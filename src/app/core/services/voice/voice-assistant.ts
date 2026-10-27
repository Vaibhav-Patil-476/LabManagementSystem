// src/app/core/services/voice-assistant.ts
//
// No AI, no API key, no per-call cost.
// Public interface: state$, transcript$, error$, hint$, start(handler), stop().
//
// Dynamic flow: असिस्टंट कोणता field अपेक्षित आहे (expect) ते ठरवतो.
// Keyword नसलेले बोलणे त्याच field मध्ये जाते.
//
// Gemini मधून घेतलेल्या सुधारणा:
//  - tool call timeout + रांग (mutations एकामागून एक)
//  - submitting guard (दोनदा save नाही)
//  - DEDUPE (तोच name/phone/age/aadhaar/uhid परत पाठवत नाही)
//  - idle timeout (3 मिनिटे)
//  - मराठी भाषा (mr-IN)

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { parseVoice, tidy, cap, splitItems, spokenNumber, asAge } from '../voice/voice-parser';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
type ToolHandler = (name: string, args: any) => Promise<any>;
type Expect = 'name' | 'age' | 'doctor' | 'items' | null;

const IDLE_MS = 3 * 60 * 1000;

// user बोलायचे थांबल्यावर इतका वेळ थांबून मगच info fill करायची
const COMMIT_SILENCE_MS = 3000;
// recognizer स्वतः बंद झाला तर किती लवकर परत चालू करायचा (gap कमी = शब्द कमी हरवतात)
const RESTART_DELAY_MS = 0;

// प्रत्येक tool साठी timeout (Gemini चे TOOL_POLICY)
const TOOL_TIMEOUT_MS: Record<string, number> = {
    fill_booking: 15000,
    go_to_step: 4000,
    new_booking: 6000,
    submit_booking: 30000
};

// हे fields तोच value परत आला तर पुन्हा पाठवायचे नाहीत
const DEDUPE_KEYS = ['name', 'phone', 'age', 'aadhaar', 'uhid'];

@Injectable({ providedIn: 'root' })
export class VoiceAssistantService {

    state$ = new BehaviorSubject<VoiceState>('idle');
    transcript$ = new BehaviorSubject<string>('');
    error$ = new Subject<string>();
    hint$ = new BehaviorSubject<string>('');   // UI मध्ये "Say: Age" दाखवण्यासाठी

    // 'en-IN' understands Indian English + Hinglish. 'mr-IN' = मराठी (देवनागरी text येतो).
    private lang = 'en-IN';
    // असिस्टंट फक्त इंग्रजी छोटे वाक्य बोलतो, म्हणून TTS नेहमी en-IN.
    private static readonly TTS_LANG = 'en-IN';

    private active = false;
    private busy = false;

    private listening = false;
    private handler?: ToolHandler;
    private lastText = '';
    private restartTimer: any;
    private listenersReady = false;
    private sessionOn = false;
    private paused = false;          // TTS बोलत असताना
    private bufferText = '';
    private rawLast = '';            // चालू session चा पूर्ण partial text
    private consumed = '';           // यातला भाग आधीच process झाला
    private commitTimer: any;
    private watchdog: any;
    private idleTimer: any;
    private errCount = 0;            // सलग error किती आले (backoff साठी)

    // tools
    private queue: Promise<unknown> = Promise.resolve();
    private submitting = false;
    private lastFill = new Map<string, string>();

    // dynamic flow
    private expect: Expect = null;
    private static SLOT: Record<string, Expect> = {
        'patient name': 'name',
        'age': 'age',
        'referring doctor': 'doctor'
    };
    private static LABEL: Record<string, string> = {
        name: 'Patient name', age: 'Age', doctor: 'Referred doctor', items: 'Package or test'
    };

    constructor(private zone: NgZone) { }

setLanguage(lang: 'en-IN' | 'hi-IN'): void {
  this.lang = lang;
}

    // ------------------------------------------------------------------
    async start(handler: ToolHandler): Promise<void> {
        if (this.active) return;
        this.handler = handler;

        try {
            const { available } = await SpeechRecognition.available();
            if (!available) {
                this.error$.next('Speech recognition is not available on this phone.');
                return;
            }

            let perm = await SpeechRecognition.checkPermissions();
            if (perm.speechRecognition !== 'granted') {
                perm = await SpeechRecognition.requestPermissions();
            }
            if (perm.speechRecognition !== 'granted') {
                this.error$.next('Microphone permission denied.');
                return;
            }

            await this.ensureListeners();

            this.active = true;
            this.lastFill.clear();
            this.touch();

            this.advance(['patient name']);
            this.startWatchdog();
            await this.say('Give me all patient info.');

        } catch (e: any) {
            console.warn('Voice start failed', e);
            this.error$.next('Could not start voice. Please try again.');
            await this.stop();
        }
    }

    async stop(): Promise<void> {
        this.active = false;
        this.busy = false;

        this.listening = false;
        clearTimeout(this.restartTimer);
        clearTimeout(this.commitTimer);
        clearTimeout(this.idleTimer);
        clearInterval(this.watchdog);

        this.lastText = '';
        this.expect = null;
        this.hint$.next('');
        this.state$.next('idle');
        this.transcript$.next('');
        this.sessionOn = false;
        this.paused = false;
        this.bufferText = '';
        this.rawLast = '';
        this.consumed = '';
        this.lastFill.clear();
        this.queue = Promise.resolve();

        try { await SpeechRecognition.stop(); } catch { }
        try { await TextToSpeech.stop(); } catch { }
    }

    // ------------------------------------------------------------------
    // idle timeout: 3 मिनिटे काहीच बोलले नाही तर mic बंद
    // ------------------------------------------------------------------
    private touch(): void {
        clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            if (this.active) this.stop();
        }, IDLE_MS);
    }

    // ------------------------------------------------------------------
    private async ensureListeners(): Promise<void> {
        if (this.listenersReady) return;
        this.listenersReady = true;

        await SpeechRecognition.addListener('partialResults', (d) => {
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
            this.zone.run(() => this.transcript$.next(t));
            this.armCommit();
        });

        await SpeechRecognition.addListener('listeningState', (d) => {
            const s = d?.state ?? d?.status;
            if (s === 'stopped') this.onNativeEnd();
        });

        await SpeechRecognition.addListener('error', (e) => {
            console.warn('[VOICE] recognizer error', e?.code, e?.message);
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
                // error वर वेगाने पुन्हा पुन्हा start नको: 300ms, 600ms ... कमाल 2s
                this.errCount++;
                this.schedule(Math.min(2000, this.errCount * 300));
            } else {
                this.schedule();   // सामान्य शांतता-बंद: लगेच परत
            }
        }
    }

    // reset=true: user अजून बोलतोय, 3 सेकंदाची मोजणी पुन्हा सुरू.
    // reset=false: मोजणी आधीच चालू असेल तर तिला हात लावू नको (recognizer बंद झाल्यावर वेळ वाढू नये).
    private armCommit(reset = true): void {
        if (!reset && this.commitTimer) return;
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => {
            this.commitTimer = undefined;
            this.commit();
        }, COMMIT_SILENCE_MS);
    }

    private async commit(): Promise<void> {
        if (!this.active || this.busy) return;
        const text = (this.bufferText + ' ' + this.lastText).trim();
        this.bufferText = '';
        this.lastText = '';
        if (this.sessionOn) this.consumed = this.rawLast;   // तोच text पुन्हा येऊ नये
        this.zone.run(() => this.transcript$.next(''));
        if (text) await this.handleText(text);
    }

    private schedule(delay = RESTART_DELAY_MS): void {
        clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => this.listen(), delay);
    }

    private async listen(): Promise<void> {
        if (!this.active || this.paused || this.sessionOn) return;
        this.sessionOn = true;
        if (this.state$.value === 'idle') this.state$.next('listening');
        try {
            await SpeechRecognition.start({
                language: this.lang,
                maxResults: 1,
                partialResults: true,
                popup: false,
                muteRecognizerBeep: false
            });
        } catch (e) {
            console.warn('listen failed, retrying', e);
            this.sessionOn = false;
            if (this.active) this.restartTimer = setTimeout(() => this.listen(), 800);
        }
    }

    private startWatchdog(): void {
        clearInterval(this.watchdog);
        this.watchdog = setInterval(() => {
            if (this.active && !this.paused && !this.sessionOn) this.listen();
        }, 1500);
    }

    // ------------------------------------------------------------------
    // tool calls: timeout + रांग (Gemini च्या runExclusive/invoke सारखे)
    // ------------------------------------------------------------------
    private callTool(name: string, args: any): Promise<any> {
        const handler = this.handler;
        if (!handler) return Promise.resolve({ ok: false, error: 'Voice not ready.' });

        const run = (): Promise<any> => {
            const work = Promise.resolve().then(() => this.zone.run(() => handler(name, args)));

            if (name === 'submit_booking') {
                // खरा save संपेपर्यंत true राहतो, timeout झाला तरी
                const clear = () => { this.submitting = false; };
                work.then(clear, clear);
            }

            let timer: any;
            const timeout = new Promise<any>(resolve => {
                timer = setTimeout(
                    () => resolve({ ok: false, error: name === 'submit_booking' ? 'Save is slow. Check before retrying.' : 'Action timed out.' }),
                    TOOL_TIMEOUT_MS[name] ?? 10000
                );
            });

            return Promise.race([work, timeout])
                .catch(() => ({ ok: false, error: 'Action failed.' }))
                .finally(() => clearTimeout(timer));
        };

        const p = this.queue.then(run, run);
        this.queue = p.then(() => undefined, () => undefined);
        return p;
    }

    // ------------------------------------------------------------------
    // dynamic flow helpers
    // ------------------------------------------------------------------
    private slot(k: Expect, raw: string): any | null {
        const t = tidy(raw);
        if (!t) return null;
        if (k === 'name') return { name: cap(t), nameExplicit: true };
        if (k === 'age') {
            const a = asAge(spokenNumber(t));
            return a !== undefined ? { age: a } : null;
        }
        if (k === 'doctor') return { doctor: cap(t) };
        if (k === 'items') {
            const tests = splitItems(t);
            return tests.length ? { tests } : null;
        }
        return null;
    }

    private advance(missing?: string[]): void {
        const first = (missing ?? [])[0];
        this.expect = first ? (VoiceAssistantService.SLOT[first] ?? null) : 'items';
        this.hint$.next(this.expect ? 'Say: ' + VoiceAssistantService.LABEL[this.expect] : '');
    }

    // तोच value परत आला तर वगळ
    private dedupe(fill: any): any | null {
        if (!fill) return null;
        const out = { ...fill };
        for (const k of DEDUPE_KEYS) {
            if (k in out && this.lastFill.get(k) === JSON.stringify(out[k])) delete out[k];
        }
        return Object.keys(out).length ? out : null;
    }

    private remember(fill: any): void {
        for (const k of DEDUPE_KEYS) {
            if (k in fill) this.lastFill.set(k, JSON.stringify(fill[k]));
        }
    }

    // ------------------------------------------------------------------
    private async handleText(text: string): Promise<void> {
        this.busy = true;
        this.touch();
        this.state$.next('thinking');
        await this.pauseMic();   // fill होत असताना mic बंद

        try {
            const parsed = parseVoice(text, {
                allowPre: this.expect === 'name'
            });

            let fill = parsed.fill;

            if (!parsed.keyed && this.expect) {
                fill = this.slot(this.expect, text);
            }

            const sent = this.dedupe(fill);

            if (!sent && !fill && parsed.cmds.length === 0) {
                if (text.length > 3) await this.say('Please say again.');
                return;
            }

            let spoken = '';

            if (sent && this.handler) {
                const r = await this.callTool('fill_booking', sent);
                if (r?.problems?.length) spoken = String(r.problems[0]);
                else if (r?.ok === false && r?.error) spoken = String(r.error);
                else this.remember(sent);
                this.advance(r?.missing);
            }

            for (const c of parsed.cmds) {
                if (!this.active) return;

                if (c === 'stop') { await this.stop(); return; }

                if (!this.handler) continue;

                if (c === 'next') {
                    const r = await this.callTool('go_to_step', { step: 2 });
                    if (r && r.ok === false) spoken = String(r.error || '');
                } else if (c === 'submit') {
                    if (this.submitting) {
                        spoken = 'Save in progress.';
                        continue;
                    }
                    this.submitting = true;
                    const r = await this.callTool('submit_booking', {});
                    // handler "slow" असेल तर ok:true + problems येतो; तेव्हा "Saved." म्हणू नको
                    const saved = !!r?.ok && !r?.problems?.length;
                    spoken = saved
                        ? 'Saved.'
                        : String(r?.problems?.[0] || r?.error || 'Booking was not saved.');
                    if (saved) {
                        this.lastFill.clear();
                        this.advance(['patient name']);
                    }
                } else if (c === 'new') {
                    await this.callTool('new_booking', {});
                    this.lastFill.clear();
                    this.advance(['patient name']);
                }
            }

            if (spoken && this.active) await this.say(spoken);

        } catch (e) {
            console.warn('voice handle error', e);
        } finally {
            this.busy = false;
            if (this.active) {
                this.state$.next('listening');
                this.resumeMic();   // fill झाल्यावर लगेच mic चालू
            }
        }
    }

    private async pauseMic(): Promise<void> {
        this.paused = true;
        clearTimeout(this.restartTimer);
        this.sessionOn = false;
        try { await SpeechRecognition.stop(); } catch { }
    }

    private resumeMic(): void {
        this.paused = false;
        if (this.active) this.listen();   // sessionOn guard मुळे दोनदा सुरू होणार नाही
    }

    // speak only short messages; mic is stopped meanwhile
    private async say(text: string): Promise<void> {
        if (!this.active) return;
        this.paused = true;
        clearTimeout(this.restartTimer);
        this.sessionOn = false;
        try { await SpeechRecognition.stop(); } catch { }
        this.state$.next('speaking');
        try {
            await TextToSpeech.speak({
                text,
                lang: VoiceAssistantService.TTS_LANG,
                rate: 1.05,
                pitch: 1.0,
                volume: 1.0,
                category: 'ambient'
            });
        } catch { }
        this.paused = false;
        this.state$.next('listening');
        if (this.active) this.listen();
    }
}