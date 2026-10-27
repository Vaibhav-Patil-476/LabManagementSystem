import { Injectable, NgZone, isDevMode } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { BehaviorSubject, Observable, firstValueFrom, timeout } from 'rxjs';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { LabApiService } from './lab-api';
import { AuthService } from './auth';
import { PdfDownloadService } from '../services/pdf-download';
import { parseDashboardVoice, DashAction } from '../services/dashboard-voice-parser';

/* ---------------------------- types ---------------------------- */

export type DashVoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type DashLang = 'en-IN' | 'hi-IN';

export interface TestStatus {
    name: string;
    barcode?: string;
    sampleStatus: string; // SNR | PENDING | CLINICAL | CANCELLED | COMPLETE
    reportStatus: string; // PENDING | READY | CANCELLED | OUTSOURCE ...
}

export interface BookingStatus {
    bookingId: number | string;
    patientName: string;
    sampleStatus: string;
    reportStatus: string;
    tests: TestStatus[];
    reportUrl?: string;
    franchiseId?: number;
    createdOn?: number;
}

export interface ChatMessage {
    id: number;
    role: 'user' | 'ai' | 'notice';
    text: string;
    card?: BookingStatus;
}

const CONSENT_KEY = 'voice_consent_v1';
const LANG_KEY = 'voice_lang_v1';

const COMMIT_SILENCE_MS = 2000;      // बोलणे थांबल्यावर इतका वेळ थांबून मग action
const IDLE_MS = 3 * 60 * 1000;       // 3 मिनिटे शांत राहिल्यास mic बंद

/* ---------------------------- messages (English / Hindi) ---------------------------- */

const MSG = {
    'en-IN': {
        greeting: 'How can I help?',
        askId: 'Please say a booking ID, barcode or patient name.',
        notFound: 'Not found. Please say the ID again.',
        multiple: (names: string) => `Multiple records found: ${names}. Please say the booking ID.`,
        emptyQuery: 'Could not hear the ID. Please say it again.',
        error: 'Something went wrong. Please try again.',
        problem: 'Problem occurred. Please try again.',
        dlOk: 'Report is ready and downloading.',
        dlPartial: 'Downloading the report of the completed tests.',
        dlCancelled: 'Test is cancelled, so there is no report.',
        dlNoComplete: 'No test is complete yet, so there is no report.',
        dlLocked: 'Report download is locked. Please contact the admin.',
        dlFailed: 'Report is ready but the download failed.',
        repReady: 'report is ready',
        repPending: 'report is pending',
        cancelled: 'is cancelled',
        outsource: 'is outsourced',
        sample: {
            SNR: 'sample not received yet',
            PENDING: 'sample received, work in progress',
            CLINICAL: 'clinical',
            CANCELLED: 'cancelled',
            COMPLETE: 'complete'
        } as Record<string, string>,
        noteNoSpeech: 'Speech recognition is not available on this phone.',
        noteMic: 'Microphone permission is blocked. Please allow it in phone settings.',
        noteStart: 'Could not start voice. Please try again.',
        consentHeader: 'Voice Assistant',
        consentMsg: 'Your voice will be used for speech recognition. Continue?',
        yes: 'Yes',
        no: 'No'
    },
    'hi-IN': {
        greeting: 'मैं कैसे मदद करूँ?',
        askId: 'कृपया बुकिंग आईडी, बारकोड या मरीज का नाम बताइए।',
        notFound: 'नहीं मिला। कृपया आईडी फिर से बताइए।',
        multiple: (names: string) => `कई रिकॉर्ड मिले: ${names}। कृपया बुकिंग आईडी बताइए।`,
        emptyQuery: 'आईडी सुनाई नहीं दी। कृपया फिर से बताइए।',
        error: 'कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
        problem: 'दिक्कत आई। फिर से कोशिश कीजिए।',
        dlOk: 'रिपोर्ट तैयार है, डाउनलोड हो रही है।',
        dlPartial: 'पूरे हो चुके टेस्ट की रिपोर्ट डाउनलोड हो रही है।',
        dlCancelled: 'टेस्ट रद्द है, इसलिए रिपोर्ट नहीं है।',
        dlNoComplete: 'अभी कोई टेस्ट पूरा नहीं हुआ, इसलिए रिपोर्ट नहीं है।',
        dlLocked: 'रिपोर्ट डाउनलोड लॉक है। कृपया एडमिन से संपर्क करें।',
        dlFailed: 'रिपोर्ट तैयार है लेकिन डाउनलोड नहीं हुई।',
        repReady: 'रिपोर्ट तैयार है',
        repPending: 'रिपोर्ट पेंडिंग है',
        cancelled: 'रद्द है',
        outsource: 'आउटसोर्स है',
        sample: {
            SNR: 'सैंपल अभी नहीं आया',
            PENDING: 'सैंपल मिल गया, काम चालू है',
            CLINICAL: 'क्लिनिकल है',
            CANCELLED: 'रद्द है',
            COMPLETE: 'पूरा हो गया'
        } as Record<string, string>,
        noteNoSpeech: 'इस फोन पर स्पीच रिकग्निशन उपलब्ध नहीं है।',
        noteMic: 'माइक की अनुमति बंद है। फोन सेटिंग्स में अनुमति दीजिए।',
        noteStart: 'वॉइस शुरू नहीं हुई। फिर से कोशिश कीजिए।',
        consentHeader: 'वॉइस असिस्टेंट',
        consentMsg: 'आपकी आवाज़ स्पीच रिकग्निशन के लिए इस्तेमाल होगी। जारी रखें?',
        yes: 'हाँ',
        no: 'नहीं'
    }
} as const;

/* ---------------------------- service ---------------------------- */

@Injectable({ providedIn: 'root' })
export class DashboardVoiceService {
    readonly open$ = new BehaviorSubject<boolean>(false);
    readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
    readonly state$ = new BehaviorSubject<DashVoiceState>('idle');
    readonly lang$ = new BehaviorSubject<DashLang>(DashboardVoiceService.loadLang());

    private nextId = 1;
    private lastRole: 'user' | 'ai' | null = null;

    /** franchiseId -> reportLock */
    private franchiseLock = new Map<number, boolean>();
    private locksLoaded = false;

    // voice engine state
    private active = false;
    private busy = false;
    private paused = false;
    private sessionOn = false;
    private listenersReady = false;
    private lastText = '';
    private bufferText = '';
    private rawLast = '';
    private consumed = '';
    private commitTimer: any;
    private restartTimer: any;
    private watchdog: any;
    private idleTimer: any;
    private errCount = 0;
    private lastAction: DashAction = 'status';

    constructor(
        private labApi: LabApiService,
        private zone: NgZone,
        private alerts: AlertController,
        private pdfDownload: PdfDownloadService,
        private auth: AuthService
    ) { }

    /* ----------------------- language ----------------------- */

    private static loadLang(): DashLang {
        try {
            const v = localStorage.getItem(LANG_KEY);
            if (v === 'hi-IN' || v === 'en-IN') return v;
        } catch { /* ignore */ }
        return 'en-IN';
    }

    private get lang(): DashLang {
        return this.lang$.value;
    }

    private get m() {
        return MSG[this.lang];
    }

    /** EN / हिं toggle. Chalu mic asel tar navya bhashet restart hoto. */
    setLanguage(lang: DashLang): void {
        if (lang === this.lang) return;
        try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
        this.lang$.next(lang);

        if (this.active) {
            this.sessionOn = false;
            void SpeechRecognition.stop().catch(() => undefined);
            this.schedule(200);
        }
    }

    /* ----------------------- open / close ----------------------- */

    async openChat(): Promise<void> {
        this.open$.next(true);
        await this.startVoice();
    }

    closeChat(): void {
        this.open$.next(false);
        void this.stop();
    }

    clear(): void {
        this.messages$.next([]);
        this.lastRole = null;
    }

    // Start/Stop button sathi. Chat tasach rahto (open$ la haat nahi).
    async toggleVoice(): Promise<void> {
        if (this.active) {
            await this.stop();
            return;
        }
        await this.startVoice();
    }

    private async startVoice(): Promise<void> {
        if (this.active) return;
        if (!(await this.askConsent())) {
            this.open$.next(false);
            return;
        }

        try {
            const { available } = await SpeechRecognition.available();
            if (!available) {
                this.notice(this.m.noteNoSpeech);
                return;
            }

            let perm = await SpeechRecognition.checkPermissions();
            if (perm.speechRecognition !== 'granted') {
                perm = await SpeechRecognition.requestPermissions();
            }
            if (perm.speechRecognition !== 'granted') {
                this.notice(this.m.noteMic);
                return;
            }

            await this.ensureListeners();

            this.active = true;
            this.lastAction = 'status';
            this.touch();
            this.startWatchdog();
            await this.say(this.m.greeting);
        } catch (e) {
            console.warn('[dashboard-voice] start failed', e);
            this.notice(this.m.noteStart);
            await this.stop();
        }
    }

    async stop(): Promise<void> {
        this.active = false;
        this.busy = false;
        this.paused = false;
        this.sessionOn = false;
        clearTimeout(this.restartTimer);
        clearTimeout(this.commitTimer);
        clearTimeout(this.idleTimer);
        clearInterval(this.watchdog);
        this.commitTimer = undefined;
        this.lastText = '';
        this.bufferText = '';
        this.rawLast = '';
        this.consumed = '';
        this.zone.run(() => this.state$.next('idle'));

        try { await TextToSpeech.stop(); } catch { /* ignore */ }
        try { await SpeechRecognition.stop(); } catch { /* ignore */ }

        // start() ajun chalu hot asel tar te pan band kar
        setTimeout(() => {
            if (!this.active) void SpeechRecognition.stop().catch(() => undefined);
        }, 400);
    }

    private touch(): void {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.active) void this.stop();
        }, IDLE_MS);
    }

    private async askConsent(): Promise<boolean> {
        try {
            if (localStorage.getItem(CONSENT_KEY) === '1') return true;
        } catch { /* ignore */ }

        const m = this.m;
        const ok = await new Promise<boolean>(async resolve => {
            const alert = await this.alerts.create({
                cssClass: 'premium-alert',
                header: m.consentHeader,
                message: m.consentMsg,
                buttons: [
                    { text: m.no, role: 'cancel', handler: () => resolve(false) },
                    { text: m.yes, handler: () => resolve(true) }
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

    /* ----------------------- recognizer ----------------------- */

    private async ensureListeners(): Promise<void> {
        if (this.listenersReady) return;
        this.listenersReady = true;

        await SpeechRecognition.addListener('partialResults', (d: any) => {
            if (!this.active || this.busy || this.paused) return;
            const raw = (d?.matches ?? [])[0];
            if (!raw) return;
            this.rawLast = raw;
            this.errCount = 0;
            let t = raw;
            if (this.consumed && raw.startsWith(this.consumed)) {
                t = raw.slice(this.consumed.length).trim();
            }
            if (!t) return;
            this.lastText = t;
            this.touch();
            this.armCommit();
        });

        await SpeechRecognition.addListener('listeningState', (d: any) => {
            const s = d?.state ?? d?.status;
            if (s === 'stopped') this.onNativeEnd();
        });

        await SpeechRecognition.addListener('error', (e: any) => {
            console.warn('[dashboard-voice] recognizer error', e?.code, e?.message);
            this.onNativeEnd(true);
        });
    }

    private onNativeEnd(isError = false): void {
        this.sessionOn = false;
        this.consumed = '';
        this.rawLast = '';
        if (this.lastText.trim()) {
            this.bufferText = (this.bufferText + ' ' + this.lastText).trim();
            this.lastText = '';
            this.armCommit(false);
        }
        if (this.active && !this.paused) {
            if (isError) {
                this.errCount++;
                this.schedule(Math.min(2000, this.errCount * 300));
            } else {
                this.schedule();
            }
        }
    }

    private armCommit(reset = true): void {
        if (!reset && this.commitTimer) return;
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => {
            this.commitTimer = undefined;
            void this.commit();
        }, COMMIT_SILENCE_MS);
    }

    private async commit(): Promise<void> {
        if (!this.active || this.busy) return;
        const text = (this.bufferText + ' ' + this.lastText).trim();
        this.bufferText = '';
        this.lastText = '';
        if (this.sessionOn) this.consumed = this.rawLast;
        if (text) await this.handleText(text);
    }

    private schedule(delay = 0): void {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => void this.listen(), delay);
    }

    private async listen(): Promise<void> {
        if (!this.active || this.paused || this.sessionOn) return;
        this.sessionOn = true;
        this.zone.run(() => {
            if (this.state$.value === 'idle') this.state$.next('listening');
        });
        try {
            await SpeechRecognition.start({
                language: this.lang,          // en-IN (default) ya hi-IN
                maxResults: 1,
                partialResults: true,
                popup: false,
                muteRecognizerBeep: false
            });

            // Stop dabla gela hota, pan start nantar yetoy -> lagech band
            if (!this.active) {
                this.sessionOn = false;
                await SpeechRecognition.stop().catch(() => undefined);
            }
        } catch (e) {
            console.warn('[dashboard-voice] listen failed, retrying', e);
            this.sessionOn = false;
            if (this.active) this.restartTimer = setTimeout(() => void this.listen(), 800);
        }
    }

    private startWatchdog(): void {
        clearInterval(this.watchdog);
        this.watchdog = setInterval(() => {
            if (this.active && !this.paused && !this.sessionOn) void this.listen();
        }, 1500);
    }

    private async pauseMic(): Promise<void> {
        this.paused = true;
        clearTimeout(this.restartTimer);
        this.sessionOn = false;
        try { await SpeechRecognition.stop(); } catch { /* ignore */ }
    }

    private resumeMic(): void {
        this.paused = false;
        if (this.active) void this.listen();
    }

    /* ----------------------- speak ----------------------- */

    private async say(text: string): Promise<void> {
        if (!this.active) return;
        this.zone.run(() => this.appendTranscript('ai', text));
        await this.pauseMic();
        if (!this.active) return;                      // Stop dabla asel tar pudhe jau naka
        this.zone.run(() => this.state$.next('speaking'));
        try {
            await TextToSpeech.speak({
                text,
                lang: this.lang,
                rate: 1.0,
                pitch: 1.0,
                volume: 1.0,
                category: 'ambient'
            });
        } catch { /* ignore */ }

        if (!this.active) return;                      // Stop dabla asel tar mic parat chalu karu naka
        this.zone.run(() => this.state$.next('listening'));
        this.resumeMic();
    }

    /* ----------------------- main handler ----------------------- */

    private async handleText(text: string): Promise<void> {
        this.busy = true;
        this.touch();
        this.zone.run(() => this.state$.next('thinking'));
        await this.pauseMic();

        let reply = '';
        try {
            const p = parseDashboardVoice(text);

            if (p.stop) {
                await this.stop();
                return;
            }

            this.zone.run(() => this.appendTranscript('user', text));

            if (!p.query) {
                reply = this.m.askId;
            } else {
                const action: DashAction = p.action ?? this.lastAction;
                this.lastAction = action;
                const tool = action === 'download' ? 'download_report' : 'get_status';

                const r = await this.withTimeout(
                    this.zone.run(() => this.runTool(tool, { query: p.query })),
                    tool === 'download_report' ? 25000 : 10000
                );
                reply = this.compose(tool, r);
            }
        } catch (e) {
            console.warn('[dashboard-voice]', e);
            reply = this.m.error;
        } finally {
            this.busy = false;
            this.lastRole = null;
        }

        if (reply && this.active) {
            await this.say(reply);
        } else if (this.active) {
            this.zone.run(() => this.state$.next('listening'));
            this.resumeMic();
        }
    }

    private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout')), ms);
            p.then(
                v => { clearTimeout(t); resolve(v); },
                e => { clearTimeout(t); reject(e); }
            );
        });
    }

    /* ----------------------- result -> spoken sentence ----------------------- */

    private compose(tool: string, r: any): string {
        const m = this.m;

        if (!r?.ok) {
            if (r?.error === 'NOT_FOUND') return m.notFound;
            if (r?.error === 'MULTIPLE') {
                const names = (r.matches ?? [])
                    .slice(0, 3)
                    .map((x: any) => x.patientName)
                    .filter(Boolean)
                    .join(', ');
                return m.multiple(names);
            }
            if (r?.error === 'EMPTY_QUERY') return m.emptyQuery;
            return m.problem;
        }

        if (tool === 'download_report') {
            if (r.downloaded) return r.partial ? m.dlPartial : m.dlOk;
            if (r.reason === 'TEST_CANCELLED') return m.dlCancelled;
            if (r.reason === 'NO_COMPLETE_TEST') return m.dlNoComplete;
            if (r.reason === 'REPORT_LOCKED') return m.dlLocked;
            return m.dlFailed;
        }

        // get_status
        const sample = m.sample[r.sampleStatus] ?? '';
        const rep =
            r.reportStatus === 'COMPLETE' ? m.repReady
                : r.reportStatus === 'CANCELLED' ? ''
                    : m.repPending;

        const parts: string[] = [];
        const main = [sample, rep].filter(Boolean).join(', ');
        if (main) parts.push(main);

        const special = (r.tests ?? [])
            .filter((t: any) => t.reportStatus === 'CANCELLED' || t.reportStatus === 'OUTSOURCE')
            .slice(0, 3)
            .map((t: any) => `${t.name} ${t.reportStatus === 'CANCELLED' ? m.cancelled : m.outsource}`);
        if (special.length) parts.push(special.join(', '));

        return `${r.patientName ? r.patientName + ' (' + r.bookingId + '): ' : ''}${parts.join('. ')}.`;
    }

    /* ----------------------- chat state ----------------------- */

    private appendTranscript(role: 'user' | 'ai', text: string): void {
        const list = [...this.messages$.value];
        const last = list[list.length - 1];
        if (this.lastRole === role && last && last.role === role && !last.card) {
            list[list.length - 1] = { ...last, text: last.text + ' ' + text };
        } else {
            list.push({ id: this.nextId++, role, text });
        }
        this.lastRole = role;
        this.messages$.next(list);
    }

    private addCard(card: BookingStatus): void {
        this.messages$.next([...this.messages$.value, { id: this.nextId++, role: 'ai', text: '', card }]);
        this.lastRole = null;
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
                    matches: found.slice(0, 3).map(b => ({
                        bookingId: b.bookingId,
                        patientName: `${b.patientName}, ID ${b.bookingId}`
                    }))
                };
            }

            this.addCard(booking);

            if (name === 'get_status') {
                return { ok: true, ...this.forVoice(booking) };
            }

            if (name === 'download_report') {
                // Ata saglya tests complete nasle tari, ek tari test complete asel tar download hoto.
                const anyReady =
                    booking.tests.some(t => t.reportStatus === 'READY') ||
                    (booking.tests.length === 0 && booking.reportStatus === 'READY');

                if (!anyReady) {
                    return {
                        ok: true,
                        ...this.forVoice(booking),
                        downloaded: false,
                        reason: booking.reportStatus === 'CANCELLED' ? 'TEST_CANCELLED' : 'NO_COMPLETE_TEST'
                    };
                }

                if (await this.isReportLocked(booking.franchiseId)) {
                    return {
                        ok: true,
                        ...this.forVoice(booking),
                        downloaded: false,
                        reason: 'REPORT_LOCKED'
                    };
                }

                const downloaded = await this.downloadReport(booking);
                return {
                    ok: true,
                    ...this.forVoice(booking),
                    downloaded,
                    partial: booking.reportStatus !== 'READY',
                    ...(downloaded ? {} : { reason: 'DOWNLOAD_FAILED' })
                };
            }

            return { ok: false, error: 'Unknown action.' };
        } catch (e) {
            console.error('[dashboard-voice]', e);
            return { ok: false, error: 'Server problem. Try again.' };
        }
    }

    /* ----------------------- permissions ----------------------- */

    /** Franchise user asel tar fakt tyacha franchise cha data; admin/staff sathi undefined. */
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

        // ROLE_STAFF la fakt swatah ne banvlele bookings.
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
            // Report: saglya tests complete jhalyavarach READY, tovar PENDING
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
            franchiseId: franchiseId > 0 ? franchiseId : undefined,
            createdOn: Number(b?.createdOn) || undefined
        };
    }

    private pickOne(found: BookingStatus[], query: string): BookingStatus | null {
        if (found.length === 1) return found[0];

        const q = query.toLowerCase().replace(/\s+/g, ' ').trim();

        // booking id / barcode exact
        const byKey = found.filter(
            b =>
                String(b.bookingId).toLowerCase() === q ||
                b.tests.some(t => String(t.barcode ?? '').toLowerCase() === q)
        );
        if (byKey.length === 1) return byKey[0];

        // same patient che anek bookings -> latest
        const sameName = found.filter(
            b => b.patientName.toLowerCase().replace(/\s+/g, ' ').trim() === q
        );
        if (sameName.length >= 1) return this.latest(sameName);

        return null;
    }

    private latest(list: BookingStatus[]): BookingStatus {
        return [...list].sort(
            (a, b) =>
                (b.createdOn ?? 0) - (a.createdOn ?? 0) ||
                Number(b.bookingId) - Number(a.bookingId)
        )[0];
    }

    /** Bolnyasathi chota, safe result (mobile/address nahi). */
    private forVoice(b: BookingStatus) {
        const rep = (s: string) => (s === 'READY' ? 'COMPLETE' : s);
        return {
            bookingId: b.bookingId,
            patientName: b.patientName,
            sampleStatus: b.sampleStatus,
            reportStatus: rep(b.reportStatus),
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

    /** generatePdfReport -> PdfDownloadService (APK: Downloads + notification, web: new tab). */
    private async downloadReport(b: BookingStatus): Promise<boolean> {
        try {
            const res: any = await this.call(
                this.labApi.generatePdfReport([Number(b.bookingId)], {
                    single: true,
                    letterHead: true,
                    onlyCompleted: true
                }),
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
}