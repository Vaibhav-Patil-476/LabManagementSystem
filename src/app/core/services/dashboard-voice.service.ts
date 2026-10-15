import { Injectable, NgZone, isDevMode } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { BehaviorSubject, Observable, firstValueFrom, timeout } from 'rxjs';
import { LabApiService } from './lab-api'; // TODO: tuzhya project madhla actual path/file naav
import { AuthService } from './auth'; // TODO: actual path (booking page madhe '../../core/services/auth' hota)
import { GeminiLiveService } from '../services/gemini-live';
import { PdfDownloadService } from '../services/pdf-download';
import { DASHBOARD_PROFILE } from './dashboard-voice.profile';

/* ---------------------------- types ---------------------------- */

export interface TestStatus {
    name: string;
    barcode?: string;
    sampleStatus: string; // RECEIVED | PENDING | CANCELLED
    reportStatus: string; // READY | PENDING | CANCELLED
}

export interface BookingStatus {
    bookingId: number | string;
    patientName: string;
    sampleStatus: string; // RECEIVED | PENDING | CANCELLED
    reportStatus: string; // READY | PENDING | CANCELLED
    tests: TestStatus[];
    /** Booking var report cha direct URL asel tar (reportUrl) */
    reportUrl?: string;
    /** Franchise scope / report lock check sathi */
    franchiseId?: number;
}

export interface ChatMessage {
    id: number;
    role: 'user' | 'ai' | 'notice';
    text: string;
    card?: BookingStatus;
}

const CONSENT_KEY = 'voice_consent_v1';

/* ---------------------------- service ---------------------------- */

@Injectable({ providedIn: 'root' })
export class DashboardVoiceService {
    readonly open$ = new BehaviorSubject<boolean>(false);
    readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);

    /** true only while THIS service owns the voice session (booking page shares GeminiLiveService). */
    private active = false;
    private nextId = 1;
    private lastRole: 'user' | 'ai' | null = null;

    /** franchiseId -> reportLock (Booking Status / Download Reports page sarkhach) */
    private franchiseLock = new Map<number, boolean>();
    private locksLoaded = false;

    constructor(
        private voice: GeminiLiveService,
        private labApi: LabApiService,
        private zone: NgZone,
        private alerts: AlertController,
        private pdfDownload: PdfDownloadService,
        private auth: AuthService
    ) {
        this.voice.message$.subscribe(m => {
            if (this.active) this.zone.run(() => this.appendTranscript(m.role, m.text));
        });
        this.voice.error$.subscribe(msg => {
            if (this.active) this.zone.run(() => this.notice(msg));
        });
        this.voice.state$.subscribe(s => {
            if (s === 'idle') {
                if (this.active) this.voice.setHalfDuplex(true); // booking page sathi default parat
                this.active = false;
            }
        });
    }

    get state$() {
        return this.voice.state$;
    }

    /* ----------------------- open / close ----------------------- */

    async openChat(): Promise<void> {
        this.open$.next(true);
        await this.startVoice();
    }

    closeChat(): void {
        this.open$.next(false);
        if (this.active) {
            this.active = false;
            this.voice.setHalfDuplex(true);
            this.voice.stop();
        }
    }

    clear(): void {
        this.messages$.next([]);
        this.lastRole = null;
    }

    private async startVoice(): Promise<void> {
        if (this.voice.state$.value !== 'idle') {
            this.notice('Voice assistant is already running.');
            return;
        }
        if (!(await this.askConsent())) {
            this.open$.next(false);
            return;
        }

        this.active = true;
        // AI bolat asatana mic mute: speaker cha awaz mic madhe jaun AI la interrupt karat nahi.
        this.voice.setHalfDuplex(true);
        try {
            await this.voice.start(
                (name, args) => this.zone.run(() => this.runTool(name, args)),
                DASHBOARD_PROFILE
            );
        } catch (e: any) {
            this.active = false;
            this.voice.setHalfDuplex(true);
            const msgs: Record<string, string> = {
                NotAllowedError: 'Mic permission block ahe. Phone settings madhe Allow kara.',
                NotFoundError: 'Mic sapadla nahi.',
                NotReadableError: 'Mic dusrya app madhe chalu ahe.'
            };
            this.notice(msgs[e?.name] ?? 'Voice connection problem.');
        }
    }

    private async askConsent(): Promise<boolean> {
        try {
            if (localStorage.getItem(CONSENT_KEY) === '1') return true;
        } catch { /* ignore */ }

        const ok = await new Promise<boolean>(async resolve => {
            const alert = await this.alerts.create({
                cssClass: 'premium-alert',
                header: 'Voice Assistant',
                message: 'Tumcha awaz AI processing sathi Google la pathvla jail. Chalel ka?',
                buttons: [
                    { text: 'No', role: 'cancel', handler: () => resolve(false) },
                    { text: 'Yes', handler: () => resolve(true) }
                ],
                backdropDismiss: false
            });
            await alert.present();
        });

        if (ok) {
            try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
        }
        return ok;
    }

    /* ----------------------- chat state ----------------------- */

    private appendTranscript(role: 'user' | 'ai', text: string): void {
        const list = [...this.messages$.value];
        const last = list[list.length - 1];
        if (this.lastRole === role && last && last.role === role && !last.card) {
            list[list.length - 1] = { ...last, text: last.text + text };
        } else {
            list.push({ id: this.nextId++, role, text });
        }
        this.lastRole = role;
        this.messages$.next(list);
    }

    private addCard(card: BookingStatus): void {
        this.messages$.next([...this.messages$.value, { id: this.nextId++, role: 'ai', text: '', card }]);
        this.lastRole = null; // next transcript chunk starts a new bubble
    }

    private notice(text: string): void {
        this.messages$.next([...this.messages$.value, { id: this.nextId++, role: 'notice', text }]);
        this.lastRole = null;
    }

    /* ----------------------- tool handler ----------------------- */

    private async runTool(name: string, args: any): Promise<any> {
        const query = this.cleanQuery(args?.query);
        if (!query) return { ok: false, error: 'EMPTY_QUERY' };

        try {
            const found = await this.search(query);
            if (found.length === 0) return { ok: false, error: 'NOT_FOUND', query };

            const booking = this.pickOne(found, query);
            if (!booking) {
                return {
                    ok: false,
                    error: 'MULTIPLE',
                    matches: found.slice(0, 5).map(b => ({ bookingId: b.bookingId, patientName: b.patientName }))
                };
            }

            this.addCard(booking);

            if (name === 'get_status') {
                return {
                    ok: true,
                    ...this.forGemini(booking),
                    next_step: "Tell the status briefly in the user's language, then ask if they need any other help."
                };
            }

            if (name === 'download_report') {
                // Download Reports page sarkhach: saglya tests READY asel tarach report download hoto.
                if (booking.reportStatus !== 'READY') {
                    return {
                        ok: true,
                        ...this.forGemini(booking),
                        downloaded: false,
                        reason: booking.reportStatus === 'CANCELLED' ? 'TEST_CANCELLED' : 'REPORT_NOT_READY'
                    };
                }

                // Franchise cha report download locked asel tar block.
                if (await this.isReportLocked(booking.franchiseId)) {
                    return {
                        ok: true,
                        ...this.forGemini(booking),
                        downloaded: false,
                        reason: 'REPORT_LOCKED'
                    };
                }

                const downloaded = await this.downloadReport(booking);
                return {
                    ok: true,
                    ...this.forGemini(booking),
                    downloaded,
                    ...(downloaded
                        ? {
                            next_step:
                                "Report downloaded. Tell the user in their own language that the download is done, then ask if they need any other help."
                        }
                        : {
                            reason: 'DOWNLOAD_FAILED',
                            next_step: 'Tell the user the download failed and offer to try again.'
                        })
                };
            }

            return { ok: false, error: 'Unknown action.' };
        } catch (e) {
            console.error('[dashboard-voice]', e);
            return { ok: false, error: 'Server problem. Try again.' };
        }
    }

    /* ----------------------- permissions ----------------------- */

    /** Franchise user asel tar fakt tyacha franchise cha data; admin/staff sathi undefined (sagla). */
    private get franchiseScope(): number | undefined {
        const r = this.auth.role;
        const franchiseUser = r === 'ROLE_FRANCHISE' || r === 'ROLE_FRANCHISE_STAFF';
        const id = Number(this.auth.franchiseId);
        return franchiseUser && id > 0 ? id : undefined;
    }

    private async isReportLocked(franchiseId?: number): Promise<boolean> {
        if (!franchiseId) return false;

        if (!this.locksLoaded) {
            try {
                const res: any = await this.call(this.labApi.getFranchises(), 6000);
                const list: any[] = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
                this.franchiseLock.clear();
                list.forEach(f => {
                    const id = Number(f?.franchiseId);
                    if (id) this.franchiseLock.set(id, !!f?.reportLock);
                });
                this.locksLoaded = true;
            } catch {
                // Lock mahit nahi: download block karu nakos, backend ne check karaycha.
                return false;
            }
        }

        return !!this.franchiseLock.get(Number(franchiseId));
    }

    /* ----------------------- search + mapping ----------------------- */

    private call<T>(obs: Observable<T>, ms: number): Promise<T> {
        return firstValueFrom(obs.pipe(timeout({ each: ms })));
    }

    private async search(query: string): Promise<BookingStatus[]> {
        const labId = this.labApi.getCurrentLabId();
        const res: any = await this.call(
            this.labApi.searchBookingStatus(labId, query, 10, this.franchiseScope),
            9000
        );

        let list: any[] = Array.isArray(res) ? res : res?.content ?? res?.data ?? res?.bookings ?? [];

        if (isDevMode()) {
            console.debug('[VOICE] booking-status raw sample (first item):', list[0]);
        }

        // Download Reports page sarkhach: ROLE_STAFF la fakt swatah ne banvlele bookings.
        if (this.auth.role === 'ROLE_STAFF') {
            const uid = this.auth.userId;
            list = list.filter(b => b?.createdBy === uid);
        }

        return list.map(b => this.mapBooking(b));
    }

    private g(o: any, ...keys: string[]): any {
        for (const k of keys) {
            const v = o?.[k];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return undefined;
    }

    private isCompleteOrReady(s: string): boolean {
        return s.includes('complete') || s.includes('ready');
    }

private mapBooking(b: any): BookingStatus {
    const rawTests: any[] = (b?.bookingWithTestMappings || b?.testMappings || b?.tests || [])
        .filter((t: any) => !!t?.testName);

    const rawSamples: any[] = b?.sampleAccessions || b?.samples || [];
    const reportsRaw: any[] = Array.isArray(b?.reports) ? b.reports : [];

    const reportUrl: string | undefined =
        typeof b?.reportUrl === 'string' && b.reportUrl.trim() ? b.reportUrl.trim() : undefined;

    const statusByTestId = new Map<number, string>();
    reportsRaw.forEach((r: any) => {
        if (r?.testId != null) statusByTestId.set(r.testId, r.reportStatus || 'PENDING');
    });

    const isOutsourced = (x: any): boolean => {
        if (!x || typeof x !== 'object') return false;
        const v = String(x?.status ?? x?.sampleStatus ?? x?.reportStatus ?? '').toLowerCase();
        return v.includes('outsource') || x?.isOutsource === true || x?.outsource === true || x?.outsourced === true;
    };

    const tests: TestStatus[] = rawTests.map((t: any) => {
        const isCancelled = !!(t.cancelDate || t.deleted);

        const sample = rawSamples.find((s: any) => Number(s?.testId) === Number(t.testId));
        const received = String(sample?.status ?? '').toUpperCase() === 'RECEIVED';

        const fromReport = statusByTestId.get(t.testId);
        const fromTest =
            t.reportStatus && String(t.reportStatus).toUpperCase() !== 'PENDING' ? t.reportStatus : null;

        const reportSt = String(fromReport || t.reportStatus || '').toLowerCase();
        const reportOpen = !reportSt || reportSt === 'pending';
        const defaultStatus =
            (isOutsourced(sample) || isOutsourced(t)) && reportOpen
                ? 'outsource'
                : received ? 'inprocess' : 'snr';

        const raw = String(fromReport || fromTest || defaultStatus).toLowerCase();

        // test-wise (Booking Status page sarkhach)
        let reportStatus: string;
        if (isCancelled || raw === 'cancel' || raw === 'cancelled') reportStatus = 'CANCELLED';
        else if (raw === 'snr') reportStatus = 'SNR';
        else if (raw.includes('clinical')) reportStatus = 'CLINICAL';
        else if (raw.includes('recheck') || raw.includes('hold')) reportStatus = 'RECHECK_HOLD';
        else if (this.isCompleteOrReady(raw)) reportStatus = 'READY';
        else if (raw.includes('outsource')) reportStatus = 'OUTSOURCE';
        else if (raw.includes('process') || raw.includes('doctor approval')) reportStatus = 'IN_PROCESS';
        else reportStatus = 'PENDING';

        // sample status: SNR -> PENDING (received) -> COMPLETE / CLINICAL / CANCELLED
        let sampleStatus: string;
        if (reportStatus === 'CANCELLED') sampleStatus = 'CANCELLED';
        else if (reportStatus === 'CLINICAL') sampleStatus = 'CLINICAL';
        else if (reportStatus === 'READY') sampleStatus = 'COMPLETE';
        else if (reportStatus === 'SNR') sampleStatus = 'SNR';
        else sampleStatus = 'PENDING';

        return {
            name: String(t.testName).trim(),
            barcode: sample?.barCode ?? sample?.barcode ?? undefined,
            sampleStatus,
            reportStatus
        };
    });

    let reportStatus: string;
    let sampleStatus: string;

    if (tests.length === 0) {
        reportStatus = reportUrl ? 'READY' : 'PENDING';
        sampleStatus = rawSamples.length > 0 &&
            rawSamples.every((s: any) => String(s?.status ?? '').toUpperCase() === 'RECEIVED')
            ? 'PENDING'
            : 'SNR';
    } else if (tests.every(t => t.reportStatus === 'CANCELLED')) {
        reportStatus = 'CANCELLED';
        sampleStatus = 'CANCELLED';
    } else {
        // Report: saglya tests complete jhalyavarach COMPLETE, tovar PENDING
        reportStatus = tests.every(t => t.reportStatus === 'READY') ? 'READY' : 'PENDING';

        // Sample: ek jari SNR asel tar SNR, saglya complete -> COMPLETE, nahitar PENDING
        const active = tests.filter(t => t.sampleStatus !== 'CANCELLED');
        if (active.some(t => t.sampleStatus === 'SNR')) {
            sampleStatus = 'SNR';
        } else if (active.every(t => t.sampleStatus === 'COMPLETE' || t.sampleStatus === 'CLINICAL')) {
            sampleStatus = active.some(t => t.sampleStatus === 'CLINICAL') ? 'CLINICAL' : 'COMPLETE';
        } else {
            sampleStatus = 'PENDING';
        }
    }

    const franchiseId = Number(this.g(b, 'franchiseId') ?? b?.franchise?.franchiseId);

    return {
        bookingId: this.g(b, 'bookingId', 'id') ?? '',
        patientName: String(b?.customerName ?? this.g(b, 'patientName', 'name') ?? '').trim(),
        sampleStatus,
        reportStatus,
        tests,
        reportUrl,
        franchiseId: franchiseId > 0 ? franchiseId : undefined
    };
}

    /** One booking, or null when the match is ambiguous. */
    private pickOne(found: BookingStatus[], query: string): BookingStatus | null {
        if (found.length === 1) return found[0];
        const q = query.toLowerCase();
        const exact = found.filter(
            b =>
                String(b.bookingId).toLowerCase() === q ||
                b.patientName.toLowerCase() === q ||
                b.tests.some(t => String(t.barcode ?? '').toLowerCase() === q)
        );
        return exact.length === 1 ? exact[0] : null;
    }

    /** Gemini la jaanara chota, safe result (mobile/address nahi). */
private forGemini(b: BookingStatus) {
    const rep = (s: string) => (s === 'READY' ? 'COMPLETE' : s);
    return {
        bookingId: b.bookingId,
        patientName: b.patientName,
        sampleStatus: b.sampleStatus,
        reportStatus: rep(b.reportStatus),
        meaning:
            'sampleStatus: SNR = sample not received yet; PENDING = sample received, work in progress; ' +
            'CLINICAL = clinical; CANCELLED = cancelled; COMPLETE = completed. ' +
            'reportStatus: PENDING until all tests are complete, then COMPLETE. ' +
            'Say the exact status clearly, never say unknown.',
        tests: b.tests.slice(0, 10).map(t => ({
            name: t.name,
            sampleStatus: t.sampleStatus,
            reportStatus: rep(t.reportStatus)
        }))
    };
}

    private cleanQuery(q: any): string {
        const s = String(q ?? '').trim();
        // ID / barcode ("B K 1 2 3" -> "BK123"); naav as-is
        return /\d/.test(s) ? s.replace(/[\s-]+/g, '').toUpperCase() : s;
    }

    /* ----------------------- download ----------------------- */

    /** Download Reports page sarkhach: generatePdfReport -> PdfDownloadService (APK: Downloads + notification, web: new tab). */
    private async downloadReport(b: BookingStatus): Promise<boolean> {
        try {
            const res: any = await this.call(
                this.labApi.generatePdfReport([Number(b.bookingId)], { single: true, letterHead: true }),
                22000
            );

            if (res?.success && res?.downloadUrl) {
                const fileName = res.fileName || `report-${b.bookingId}.pdf`;
                await this.pdfDownload.download(res.downloadUrl, fileName);
                return true;
            }

            if (isDevMode()) console.warn('[VOICE] generatePdfReport unexpected response', res);
        } catch (e) {
            console.error('[VOICE] download failed', e);
        }
        return false;
    }

    /* ----------------------- start / stop button ----------------------- */

    // Start/Stop button sathi. Chat tasach rahto (open$ la haat nahi).
    async toggleVoice(): Promise<void> {
        if (this.voice.state$.value !== 'idle') {
            this.active = false;
            this.voice.setHalfDuplex(true);
            this.voice.stop();
            return;
        }
        await this.startVoice();
    }
}