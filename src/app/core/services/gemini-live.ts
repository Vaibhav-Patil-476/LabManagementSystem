import { Injectable, OnDestroy, isDevMode } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { secrets } from '../../../environments/secrets';


/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking';

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>
) => Promise<unknown>;

export interface VoiceToolResult {
  ok?: boolean;
  problems?: string[];
  [key: string]: unknown;
}

export interface VoiceConnectionConfig {
  /**
   * Returns the full wss:// URL. In production this MUST point to your
   * backend relay (which holds the Gemini key), never to Google with a key.
   */
  getWsUrl: () => Promise<string>;
}

export class VoiceConfigError extends Error { }

/* ------------------------------------------------------------------ */
/* Internal types                                                      */
/* ------------------------------------------------------------------ */

type DebugCategory = 'VOICE' | 'SESSION' | 'AUDIO' | 'GEMINI' | 'TOOL' | 'NETWORK' | 'ERROR';

interface GeminiToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

interface GeminiServerMessage {
  setupComplete?: unknown;
  goAway?: { timeLeft?: string };
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  toolCall?: { functionCalls?: GeminiToolCall[] };
  toolCallCancellation?: { ids?: string[] };
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
}

interface ToolResponse {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** Direct browser -> Google with an API key. Dev only. Keep false in production. */
const ALLOW_DIRECT_KEY_IN_PROD = true;

/**
 * Declare mutation tools NON_BLOCKING so the model keeps listening and the
 * SILENT/INTERRUPT scheduling is honoured. If your Live model rejects the
 * setup after this change (close code 1007), set this to false.
 */
const NON_BLOCKING_TOOLS = true;

const VAD = {
  startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
  endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
  prefixPaddingMs: 60,
  silenceDurationMs: 350
};

const IDLE_MS = 3 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 12000;
const MAX_FAILURES = 8;
const MAX_BACKOFF_MS = 12000;
const MAX_PENDING_AUDIO_CHUNKS = 25; // ~1 s at 40 ms per chunk
const MAX_QUEUED_PLAYBACK_S = 15;
const MAX_CACHED_TOOL_RESULTS = 200;

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `You are a SILENT, ultra-fast voice data-entry assistant for the "New Booking" screen of a diagnostic lab app used by franchise staff.
The user talks continuously and mixes English, Hindi and Marathi. Understand all three. Ignore background noise, filler words and side conversations.

1. SESSION START
- At the start say ONLY: "Give me all patient info." Say it once, then stay silent. Never say it again, even after a reconnect.

2. TIMING (most important)
- The user will NOT wait for you. The moment you hear ANY booking detail, even a partial one, call fill_booking with just that detail. Never wait for the user to finish.
- Never call fill_booking with empty arguments. If there is nothing new, do nothing and stay silent.

3. WHAT TO SEND
- Send a field ONLY when the user has just said it. NEVER resend a field you already sent.
- Exception: if the user continues or corrects a value (a surname after the first name, a corrected number), send the COMPLETE new value once.
- Never add dots, commas or other punctuation to names.
- Do not guess or invent any value, doctor, test or package.
- When a booking is saved or a new patient starts, FORGET the previous patient completely. Nothing sent earlier counts as "already sent" for the new patient.

4. WHEN TO SPEAK
- NEVER speak while the user is talking. NEVER repeat or summarise what the user said.
- After a tool result with no problems, output NOTHING at all.
- Speak ONLY when: (a) a tool result has a non-empty "problems" list: say the first problem exactly as written, once, then stop and do not retry; (b) the user asks you a question: answer in max 8 words; (c) submit_booking returns ok: say only "Saved."; (d) the user asks for a summary: call get_summary and read it briefly.
- Replies: max 8 words, in the language the user last used. Never ask questions, never ask for confirmation.

5. DOCTOR
- Set "doctor" ONLY when the user says doctor / Dr / ref / referred by. The patient name is never the doctor.

6. TESTS AND PACKAGES
- Send each test name EXACTLY as the user said it. Never shorten a full name and never expand an abbreviation: "complete blood count" stays "Complete Blood Count", "CBC" stays "CBC".
- One array item per test. Use "packages" ONLY when the user says profile or package.
- After a test is added, NEVER send it again in other words, even if the added name looks slightly different.

7. REMOVE
- Use removeItems ONLY when the user clearly says remove / kadha / hata / nako. NEVER remove anything on your own, even after a problem.

8. SAVE AND NEW BOOKING
- Call submit_booking ONLY when the user clearly says save / submit / book kar / save kar / ho jau de / kar de. Never ask "Save?" and never save on your own.
- After a save, "new booking" / "nava booking" / "next patient" / "pudhil patient": call new_booking, then stay silent. If the user directly starts new patient details instead, just call fill_booking.
- You cannot scan barcodes, upload files or enter payment amounts.

9. UNDERSTANDING
- Write names in English (Roman) letters, e.g. "Vaibhav Pandurang Patil".
- Convert every spoken number to digits in any language (ek=1, don/do=2, teen=3, char=4, paach/panch=5, saha/chhe=6, saat=7, aath=8, nau=9, daha/das=10, pachchis/pachees=25, tees/tis=30, chalis=40, pannas/pachas=50 ...). "double 9"=99, "triple 7"=777. Phone = exactly 10 digits.
- Title: Mr/Shri/Bhau/Sir/Bhaiya = mr. Mrs/Smt/Tai/Madam/Shrimati = mrs. Ms/Miss/Kumari = ms.
- Gender: purush/mard/ladka = male. stri/mahila/ladki/aurat = female.
- Age unit: varsh/saal/sal/years = years. mahine/mahina = months. din/divas = days.
- Checkboxes (true to tick, false to untick when the user says nako/nahi/hata/remove): online report / e-report = eReport. home collection / ghari = homeCollection. clinical history / clinical = clinical. file / document = file.
- Payment: cash / theva = cash. UPI / online / gpay / phonepe / paytm = upi. Discount in percent = discountPercent.`;
/* ------------------------------------------------------------------ */
/* Tool contract: declarations, policy and sanitizers stay in sync      */
/* ------------------------------------------------------------------ */

const TOOL_NAMES = [
  'fill_booking',
  'go_to_step',
  'get_summary',
  'new_booking',
  'submit_booking'
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

interface ToolPolicy {
  mutates: boolean;
  nonBlocking: boolean;
  timeoutMs: number;
  timeoutText: string;
}

const TOOL_POLICY: Record<ToolName, ToolPolicy> = {
  fill_booking: { mutates: true, nonBlocking: true, timeoutMs: 12000, timeoutText: 'Search timed out.' },
  go_to_step: { mutates: true, nonBlocking: true, timeoutMs: 4000, timeoutText: 'Step change timed out.' },
  get_summary: { mutates: false, nonBlocking: false, timeoutMs: 4000, timeoutText: 'Summary timed out.' },
  new_booking: { mutates: true, nonBlocking: true, timeoutMs: 6000, timeoutText: 'New booking timed out.' },
  submit_booking: { mutates: true, nonBlocking: false, timeoutMs: 30000, timeoutText: 'Save is slow. Check before retrying.' }
};

const sStr = (description?: string) => ({ type: 'STRING', description });
const sNum = (description?: string) => ({ type: 'NUMBER', description });
const sBool = (description?: string) => ({ type: 'BOOLEAN', description });
const sArr = (description: string) => ({ type: 'ARRAY', items: { type: 'STRING' }, description });

const BASE_DECLARATIONS: Array<{
  name: ToolName;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required?: string[] };
}> = [
    {
      name: 'fill_booking',
      description:
        'Fill booking fields the moment the user says them, even partial or mid-sentence. Include ONLY the new or changed fields. Call as often as needed. Never resend a test or doctor already sent.',
      parameters: {
        type: 'OBJECT',
        properties: {
          title: sStr('mr/mrs/ms/dr'),
          name: sStr('Patient full name in English letters'),
          age: sNum(),
          ageType: sStr('years/months/days'),
          gender: sStr('male/female/other'),
          doctor: sStr('Referring doctor name in English letters'),
          phone: sStr('10 digit mobile number'),
          aadhaar: sStr('12 digit aadhaar number'),
          uhid: sStr(),
          address: sStr(),
          history: sStr('Clinical history text'),
          otherCharges: sNum(),
          eReport: sBool('Online / e-report checkbox'),
          homeCollection: sBool(),
          clinical: sBool('Clinical history checkbox'),
          file: sBool('File / document checkbox'),
          tests: sArr('Test name EXACTLY as the user said it. Never shorten or expand it.'),
          packages: sArr('Profile / package names'),
          removeItems: sArr('Tests or packages to remove from the bill'),
          paymentMode: sStr('cash or upi'),
          discountPercent: sNum()
        }
      }
    },
    {
      name: 'go_to_step',
      description: 'Go to step 1 or step 2',
      parameters: { type: 'OBJECT', properties: { step: sNum() }, required: ['step'] }
    },
    {
      name: 'get_summary',
      description: 'Read back the current booking only if the user asks',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'new_booking',
      description: 'Clear the form and start a new patient',
      parameters: { type: 'OBJECT', properties: {} }
    },
    {
      name: 'submit_booking',
      description: 'Save the booking. Only after the user clearly says save / submit / book kar.',
      parameters: { type: 'OBJECT', properties: {} }
    }
  ];

for (const toolName of TOOL_NAMES) {
  if (!BASE_DECLARATIONS.some(d => d.name === toolName)) {
    throw new Error(`Voice tool "${toolName}" has a policy but no declaration`);
  }
}

const TOOLS = [
  {
    functionDeclarations: BASE_DECLARATIONS.map(d =>
      NON_BLOCKING_TOOLS && TOOL_POLICY[d.name].nonBlocking
        ? { ...d, behavior: 'NON_BLOCKING' }
        : d
    )
  }
];

/* Argument sanitizers: return undefined when the value is unusable. */

type Sanitizer = (v: unknown) => unknown;

const asStr = (v: unknown, max = 300): string | undefined => {
  if (typeof v !== 'string' && typeof v !== 'number') {
    return undefined;
  }
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s && s.length <= max ? s : undefined;
};

const asNum = (min: number, max: number): Sanitizer => v => {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

const asBool: Sanitizer = v =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;

const asEnum = (...allowed: string[]): Sanitizer => v => {
  const s = asStr(v, 30)?.toLowerCase();
  return s && allowed.includes(s) ? s : undefined;
};

const asList: Sanitizer = v => {
  const input = Array.isArray(v) ? v : [v];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const s = asStr(item, 120);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.length ? out.slice(0, 20) : undefined;
};

const asPhone: Sanitizer = v => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) {
    d = d.slice(2);
  } else if (d.length === 11 && d.startsWith('0')) {
    d = d.slice(1);
  }
  return d.length === 10 ? d : undefined;
};

const asAadhaar: Sanitizer = v => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 12 ? d : undefined;
};

const stripTail = (s?: string): string | undefined =>
  s ? s.replace(/[\s.,;:!?]+$/, '') || undefined : undefined;

const FILL_SCHEMA: Record<string, Sanitizer> = {
  title: asEnum('mr', 'mrs', 'ms', 'dr'),
  name: v => stripTail(asStr(v, 120)),
  age: asNum(0, 150),
  ageType: asEnum('years', 'months', 'days'),
  gender: asEnum('male', 'female', 'other'),
  doctor: v => stripTail(asStr(v, 120)),
  phone: asPhone,
  aadhaar: asAadhaar,
  uhid: v => asStr(v, 60),
  address: v => asStr(v, 300),
  history: v => asStr(v, 1000),
  otherCharges: asNum(0, 1000000),
  eReport: asBool,
  homeCollection: asBool,
  clinical: asBool,
  file: asBool,
  tests: asList,
  packages: asList,
  removeItems: asList,
  paymentMode: asEnum('cash', 'upi'),
  discountPercent: asNum(0, 100)
};

const STEP_SCHEMA: Record<string, Sanitizer> = {
  step: v => {
    const n = asNum(1, 2)(v);
    return n === 1 || n === 2 ? n : undefined;
  }
};

const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  name: 'Name',
  age: 'Age',
  ageType: 'Age unit',
  gender: 'Gender',
  doctor: 'Doctor',
  phone: 'Phone',
  aadhaar: 'Aadhaar',
  otherCharges: 'Other charges',
  paymentMode: 'Payment mode',
  discountPercent: 'Discount',
  step: 'Step'
};

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function sanitizeArgs(
  name: ToolName,
  raw: Record<string, unknown>
): { args: Record<string, unknown>; rejected: string[] } {
  const schema =
    name === 'fill_booking' ? FILL_SCHEMA : name === 'go_to_step' ? STEP_SCHEMA : {};
  const args: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const sanitizer = schema[key];
    if (!sanitizer) {
      continue; // unknown keys are never forwarded
    }
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }
    const clean = sanitizer(value);
    if (clean === undefined) {
      rejected.push(key);
    } else {
      args[key] = clean;
    }
  }

  if (name === 'go_to_step' && args['step'] === undefined && !rejected.includes('step')) {
    rejected.push('step');
  }

  return { args, rejected };
}

/** Converts any handler return value / error into a short, speakable result. */
function shortProblem(text: string, strict: boolean): string {
  const first = text.split('\n')[0].trim();
  if (!first) {
    return 'Action failed.';
  }
  if (strict && /(\berror\b|exception|undefined|\bnull\b|https?:|\bat \S+ \(|[{}])/i.test(first)) {
    return 'Action failed.';
  }
  return first.slice(0, 120);
}
function normalizeResult(raw: unknown): VoiceToolResult {
  const result: VoiceToolResult =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : { ok: raw !== false };

  delete result['stack'];

  const problems: string[] = [];

  if (Array.isArray(result.problems)) {
    for (const p of result.problems as unknown[]) {
      const text =
        typeof p === 'string'
          ? p
          : p && typeof (p as { message?: unknown }).message === 'string'
            ? (p as { message: string }).message
            : '';
      if (text) {
        problems.push(shortProblem(text, false));
      }
    }
  }

  const rawError = result['error'];
  const hadError = typeof rawError === 'string' && rawError.length > 0;
  if (hadError) {
    problems.push(shortProblem(rawError as string, true));
  }
  delete result['error'];

  result.problems = problems.slice(0, 3);
  result.ok = result.ok !== false && !hadError;

  return result;
}

/* ------------------------------------------------------------------ */
/* Audio worklet: mic -> 16 kHz mono PCM16, 640-sample (40 ms) chunks   */
/* ------------------------------------------------------------------ */

const WORKLET = `
class Cap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.out = new Int16Array(640);
    this.n = 0;
  }
  process(inputs) {
    const c = inputs[0]?.[0];
    if (!c) return true;
    while (this.pos < c.length) {
      const i0 = Math.floor(this.pos);
      const i1 = Math.max(i0 + 1, Math.floor(this.pos + this.ratio));
      let sum = 0, cnt = 0;
      for (let i = i0; i < i1 && i < c.length; i++) { sum += c[i]; cnt++; }
      const v = cnt ? sum / cnt : 0;
      this.out[this.n++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      if (this.n === 640) {
        this.port.postMessage(this.out.buffer.slice(0));
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= c.length;
    return true;
  }
}
registerProcessor('cap', Cap);
`;

function safeClose(ws: WebSocket | undefined, code = 1000, reason = ''): void {
  try {
    ws?.close(code, reason);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

@Injectable({ providedIn: 'root' })
export class GeminiLiveService implements OnDestroy {
  readonly state$ = new BehaviorSubject<VoiceState>('idle');
  readonly transcript$ = new BehaviorSubject<string>('');
  /** Short, user-presentable errors (mic denied, fatal connection failure...). */
  readonly error$ = new Subject<string>();

  private DEBUG_VOICE = true;
  private transcriptRoman = true;
  private halfDuplex = false;

  private cfg: VoiceConnectionConfig = {
    getWsUrl: async () => {
      if (!isDevMode() && !ALLOW_DIRECT_KEY_IN_PROD) {
        throw new VoiceConfigError('Voice backend is not configured');
      }
      return `${WS_BASE}?key=${encodeURIComponent(secrets.geminiApiKey)}`;
    }
  };

  /** Incremented on every start() and stop(); invalidates stale async work. */
  private sessionGen = 0;
  private voiceSessionId = '';
  private onTool?: ToolHandler;

  /* socket */
  private ws?: WebSocket;
  private ready = false;
  private connecting = false;
  private connectionResumed = false;
  private resumeHandle?: string;
  private epoch = 0;
  private failures = 0;
  private greeted = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private readonly decoder = new TextDecoder();
  private lastFill = new Map<string, string>();
  private readonly DEDUPE_KEYS = ['name', 'phone', 'age', 'aadhaar', 'uhid'];

  /* audio */
  private inCtx?: AudioContext;
  private outCtx?: AudioContext;
  private stream?: MediaStream;
  private inputSource?: MediaStreamAudioSourceNode;
  private inputWorklet?: AudioWorkletNode;
  private inputMute?: GainNode;
  private audioReady = false;
  private micStarted = false;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private speaking = false;
  private pendingAudio: string[] = [];
  // class fields madhe
  private lastHeardAt = 0;
  /* tools */
  private mutationQueue: Promise<void> = Promise.resolve();
  private submitInFlight = false;
  private toolResults = new Map<string, ToolResponse>();
  private toolInFlight = new Map<string, Promise<ToolResponse>>();
  private toolSentOn = new Map<string, WebSocket>();
  private cancelledTools = new Set<string>();
  private freshSession = false;
  private recycleAfterTurn = false;
  /* transcript */
  private lastRole: '' | 'in' | 'out' = '';
  private tBuf = '';

  /* ---------------------------- public API ---------------------------- */

  configure(config: VoiceConnectionConfig): void {
    this.cfg = config;
  }

  setHalfDuplex(value: boolean): void {
    this.halfDuplex = value;
  }

  setTranscriptRoman(value: boolean): void {
    this.transcriptRoman = value;
  }

  setDebug(value: boolean): void {
    this.DEBUG_VOICE = value;
  }

  async start(onTool: ToolHandler): Promise<void> {
    if (this.state$.value !== 'idle') {
      return;
    }

    const gen = ++this.sessionGen;
    this.onTool = onTool;
    this.voiceSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.failures = 0;
    this.greeted = false;
    this.resumeHandle = undefined;
    this.epoch = 0;
    this.pendingAudio = [];
    this.toolResults.clear();
    this.toolInFlight.clear();
    this.toolSentOn.clear();
    this.cancelledTools.clear();
    this.lastFill.clear();
    this.freshSession = false;
    this.recycleAfterTurn = false;
    this.lastRole = '';
    this.tBuf = '';

    this.state$.next('connecting');
    this.transcript$.next('');
    this.attachLifecycleListeners();


    // Open Gemini immediately; the microphone initialises in parallel.
    void this.openSocket();

    try {
      const stream = await this.getMic();



      if (gen !== this.sessionGen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this.stream = stream;
      stream.getAudioTracks()[0]?.addEventListener('ended', this.onMicEnded);

      this.inCtx = new AudioContext();
      this.outCtx = new AudioContext({ sampleRate: 24000 });

      await Promise.all([this.inCtx.resume(), this.outCtx.resume()]);
      if (gen !== this.sessionGen) {
        return;
      }

      const url = URL.createObjectURL(
        new Blob([WORKLET], { type: 'application/javascript' })
      );
      try {
        await this.inCtx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (gen !== this.sessionGen) {
        return;
      }

      this.audioReady = true;
      this.tryStartMic();
      this.touch();
    } catch (error) {
      if (gen !== this.sessionGen) {
        return; // stopped intentionally while starting
      }
      const name = (error as { name?: string } | null)?.name;
      this.error$.next(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission denied.'
          : name === 'NotFoundError'
            ? 'No microphone found.'
            : 'Microphone unavailable.'
      );
      this.log('ERROR', 'Mic/audio setup failed', { name });
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.sessionGen++;
    this.voiceSessionId = '';
    this.detachLifecycleListeners();

    for (const timer of [this.reconnectTimer, this.connectTimer, this.idleTimer]) {
      if (timer) {
        clearTimeout(timer);
      }
    }
    this.reconnectTimer = undefined;
    this.connectTimer = undefined;
    this.idleTimer = undefined;

    this.stopPlayback();

    const socket = this.ws;
    this.ws = undefined;
    this.ready = false;
    this.connecting = false;
    safeClose(socket, 1000, 'Client stopped');

    if (this.inputWorklet) {
      this.inputWorklet.port.onmessage = null;
      try {
        this.inputWorklet.disconnect();
      } catch {
        /* ignore */
      }
      this.inputWorklet = undefined;
    }
    for (const node of [this.inputSource, this.inputMute]) {
      try {
        node?.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.inputSource = undefined;
    this.inputMute = undefined;

    this.stream?.getTracks().forEach(track => {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    });
    this.stream = undefined;

    const inCtx = this.inCtx;
    const outCtx = this.outCtx;
    this.inCtx = undefined;
    this.outCtx = undefined;
    inCtx?.close().catch(() => undefined);
    outCtx?.close().catch(() => undefined);

    this.audioReady = false;
    this.micStarted = false;
    this.pendingAudio = [];
    this.lastRole = '';
    this.tBuf = '';
    this.resumeHandle = undefined;
    this.greeted = false;
    this.failures = 0;
    this.epoch = 0;
    this.toolResults.clear();
    this.toolInFlight.clear();
    this.toolSentOn.clear();
    this.cancelledTools.clear();
    this.lastFill.clear();
    this.freshSession = false;
    this.recycleAfterTurn = false;
    this.mutationQueue = Promise.resolve();

    this.state$.next('idle');
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /* ------------------------ lifecycle listeners ----------------------- */

  private readonly onOnline = (): void => {
    if (this.isActive() && !this.isSocketAlive()) {
      this.reconnectNow('online');
    }
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible' || !this.isActive()) {
      return;
    }
    this.inCtx?.resume().catch(() => undefined);
    this.outCtx?.resume().catch(() => undefined);
    if (!this.isSocketAlive()) {
      this.reconnectNow('visible');
    }
  };

  private readonly onPageHide = (): void => {
    this.stop();
  };

  private readonly onMicEnded = (): void => {
    if (this.isActive()) {
      this.error$.next('Microphone disconnected.');
      this.stop();
    }
  };

  private attachLifecycleListeners(): void {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private detachLifecycleListeners(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /* ------------------------------ socket ------------------------------ */

  private isActive(): boolean {
    return this.state$.value !== 'idle' && !!this.voiceSessionId;
  }

  private isSocketAlive(): boolean {
    return (
      !!this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    );
  }

  private async openSocket(): Promise<void> {
    if (!this.isActive() || this.connecting || this.isSocketAlive()) {
      return;
    }

    const gen = this.sessionGen;
    this.connecting = true;

    let url: string;
    try {
      url = await this.cfg.getWsUrl();
    } catch (error) {
      this.connecting = false;
      if (gen !== this.sessionGen) {
        return;
      }
      if (error instanceof VoiceConfigError) {
        this.fatal('Voice is not configured.');
      } else {
        this.scheduleReconnect('url provider failed');
      }
      return;
    }

    this.connecting = false;
    if (gen !== this.sessionGen || !this.isActive() || this.isSocketAlive()) {
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect('socket constructor failed');
      return;
    }

    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.ready = false;

    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this.ws === ws && !this.ready) {
        this.log('NETWORK', 'Connect/setup timeout');
        safeClose(ws, 4000, 'Setup timeout');
      }
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.ws !== ws || !this.isActive()) {
        safeClose(ws, 1000, 'Stale socket');
        return;
      }
      this.connectionResumed = !!this.resumeHandle;
      this.sendJson(ws, this.buildSetup());
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== ws) {
        return;
      }
      let message: GeminiServerMessage;
      try {
        const text =
          typeof event.data === 'string'
            ? event.data
            : this.decoder.decode(event.data as ArrayBuffer);
        message = JSON.parse(text) as GeminiServerMessage;
      } catch {
        this.log('ERROR', 'Invalid server JSON');
        return;
      }
      this.onServerMessage(message, ws);
    };

    ws.onerror = () => {
      this.log('NETWORK', 'WebSocket error', { readyState: ws.readyState });
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) {
        return; // stale socket
      }
      this.clearConnectTimer();
      const wasReady = this.ready;
      this.ws = undefined;
      this.ready = false;
      
      this.log('NETWORK', 'WebSocket closed', { code: event.code, reason: event.reason, wasReady });
      this.log('NETWORK', 'WebSocket closed', { code: event.code, wasReady });

      if (!this.isActive()) {
        return;
      }

      // A rejected resume handle must not be retried forever.
      if (!wasReady && this.resumeHandle) {
        this.resumeHandle = undefined;
      }

      if (event.code === 1007) {
        this.fatal('Voice setup rejected.');
        return;
      }

      this.scheduleReconnect(`closed ${event.code}`);
    };
  }

  resetFillCache(): void {
    this.lastFill.clear();
  }

  private buildSetup(): Record<string, unknown> {
    return {
      setup: {
        model: secrets.geminiLiveModel,
        generationConfig: {
          responseModalities: ['AUDIO'],
          thinkingConfig: { thinkingBudget: 0 }
        },
        realtimeInputConfig: { automaticActivityDetection: VAD },
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: TOOLS,
        inputAudioTranscription: {},
        outputAudioTranscription: {}
      }
    };
  }

  private sendJson(ws: WebSocket, payload: unknown): boolean {
    if (ws !== this.ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      this.log('ERROR', 'Socket send failed');
      return false;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = undefined;
    }
  }

  private scheduleReconnect(reason: string, immediate = false): void {
    if (!this.isActive() || this.reconnectTimer || this.connecting) {
      return;
    }

    if (!immediate) {
      this.failures += 1;
      if (this.failures > MAX_FAILURES) {
        this.fatal('Connection failed.');
        return;
      }
    }

    const base = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, Math.max(0, this.failures - 1)));
    const delay = immediate ? 0 : base + Math.random() * Math.min(1000, base * 0.25);

    this.log('NETWORK', 'Reconnect scheduled', { reason, attempt: this.failures, delayMs: Math.round(delay) });

    if (this.state$.value !== 'connecting') {
      this.state$.next('connecting');
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openSocket();
    }, delay);
  }

  private reconnectNow(reason: string): void {
    if (!this.isActive() || this.connecting || this.isSocketAlive()) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.log('NETWORK', 'Reconnect now', { reason });
    if (this.state$.value !== 'connecting') {
      this.state$.next('connecting');
    }
    void this.openSocket();
  }

  private fatal(message: string): void {
    this.log('ERROR', 'Fatal voice failure', { message });
    this.error$.next(message);
    this.stop();
  }

  /* ------------------------ server message handling ------------------- */

  private onServerMessage(message: GeminiServerMessage, socket: WebSocket): void {
    if (message.setupComplete) {
      this.onSetupComplete(socket);
      return;
    }

    const update = message.sessionResumptionUpdate;
    if (update?.newHandle && update.resumable !== false) {
      this.resumeHandle = update.newHandle;
    }

    if (message.goAway) {
      this.onGoAway(socket);
      return;
    }

    for (const id of message.toolCallCancellation?.ids ?? []) {
      this.cancelledTools.add(`${this.epoch}:${id}`);
    }

    const content = message.serverContent;
    if (content) {
      if (content.interrupted) {
        this.stopPlayback();
      }

      for (const part of content.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          this.playPcm(part.inlineData.data);
        }
      }

      if (content.inputTranscription?.text) {
        this.lastHeardAt = performance.now();
        this.touch();
        this.pushTranscript('in', content.inputTranscription.text);
      }

      if (content.outputTranscription?.text) {
        this.pushTranscript('out', content.outputTranscription.text);
      }

      if (content.turnComplete) {
        if (this.recycleAfterTurn) {
          this.recycleAfterTurn = false;
          this.recycleSession();
          return;
        }
        this.lastRole = '';
        if (this.state$.value === 'speaking' && this.sources.size === 0) {
          this.state$.next('listening');
        }
      }
    }

    const calls = message.toolCall?.functionCalls;
    if (calls?.length) {
      this.touch();
      for (const call of calls) {
        void this.handleToolCall(socket, call);
      }
    }
  }

  private onSetupComplete(socket: WebSocket): void {
    if (this.ws !== socket) {
      return;
    }

    this.clearConnectTimer();
    this.ready = true;
    this.failures = 0;

    if (!this.connectionResumed) {
      this.epoch += 1; // fresh server session: tool IDs may restart
    }

    if (this.micStarted && this.state$.value === 'connecting') {
      this.state$.next('listening');
    }
    this.tryStartMic();

    if (!this.greeted) {
      this.greeted = true;
      this.sendJson(socket, {
        clientContent: {
          turns: [
            { role: 'user', parts: [{ text: 'Start. Say only: Give me all patient info.' }] }
          ],
          turnComplete: true
        }
      });
    } else if (!this.connectionResumed && !this.freshSession) {
      // Fresh server session after a drop: restore minimal context, no reply.
      this.sendJson(socket, {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Connection restored. A booking is already in progress. Do not greet. Stay silent until the user speaks.'
                }
              ]
            }
          ],
          turnComplete: false
        }
      });
    }
    this.freshSession = false;
    const chunks = this.pendingAudio.splice(0);
    for (const chunk of chunks) {
      this.sendAudio(socket, chunk);
    }
  }

  private recycleSession(): void {
    if (!this.isActive()) {
      return;
    }
    this.log('SESSION', 'Recycle after save');
    this.resumeHandle = undefined;
    this.freshSession = true;
    this.toolResults.clear();
    this.toolInFlight.clear();
    this.toolSentOn.clear();
    this.cancelledTools.clear();
    this.lastFill.clear();

    const socket = this.ws;
    this.ws = undefined;
    this.ready = false;
    this.clearConnectTimer();
    safeClose(socket, 1000, 'recycle');
    this.scheduleReconnect('recycle', true);
  }

  private onGoAway(socket: WebSocket): void {
    if (this.ws !== socket) {
      return;
    }
    this.log('NETWORK', 'goAway received');
    // Detach first, otherwise openSocket() sees an active socket and exits.
    this.ws = undefined;
    this.ready = false;
    this.clearConnectTimer();
    safeClose(socket, 1000, 'goAway');
    this.scheduleReconnect('goAway', true);
  }

  /* ------------------------------- tools ------------------------------ */

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutationQueue.then(fn, fn);
    this.mutationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async getMic(): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } },
      { audio: true }   // sadhi constraints, kaahi devices var pahilya ne fail hotat
    ];

    let lastError: unknown;
    for (let i = 0; i < attempts.length; i++) {
      try {
        return await navigator.mediaDevices.getUserMedia(attempts[i]);
      } catch (e) {
        lastError = e;
        const err = e as { name?: string; message?: string };
        console.warn('[MIC] attempt', i + 1, 'failed:', err?.name, err?.message);
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          throw e;   // permission cha problem, retry nako
        }
        await new Promise(r => setTimeout(r, 600));
      }
    }

    // default mic fail zala: baki available mics ek-ek karun try kara
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      for (const d of devices.filter(x => x.kind === 'audioinput' && x.deviceId)) {
        if (d.deviceId === 'default' || d.deviceId === 'communications') {
          continue;   // he virtual aahet, aadhich fail zale
        }
        try {
          return await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: d.deviceId }, echoCancellation: true, noiseSuppression: true, channelCount: 1 }
          });
        } catch (e) {
          console.warn('[MIC] device failed:', d.label, (e as { name?: string })?.name);
        }
      }
    } catch {
      /* ignore */
    }

    throw lastError;
  }

  private async handleToolCall(socket: WebSocket, call: GeminiToolCall): Promise<void> {
    const key = call.id ? `${this.epoch}:${call.id}` : undefined;



    if (key) {
      const cached = this.toolResults.get(key);
      if (cached) {
        this.sendToolResponse(socket, key, cached);
        return;
      }
      const pending = this.toolInFlight.get(key);
      if (pending) {
        this.sendToolResponse(socket, key, await pending);
        return;
      }
    }

    // executeCall runs synchronously up to its first await, which keeps
    // mutating calls queued in the order Gemini sent them.
    const work = this.executeCall(call);
    if (key) {
      this.toolInFlight.set(key, work);
    }

    const response = await work;

    if (key) {
      this.toolInFlight.delete(key);
      this.toolResults.set(key, response);
      if (this.toolResults.size > MAX_CACHED_TOOL_RESULTS) {
        const oldest = this.toolResults.keys().next().value;
        if (oldest !== undefined) {
          this.toolResults.delete(oldest);
          this.toolSentOn.delete(oldest);
        }
      }
      if (this.cancelledTools.delete(key)) {
        this.log('TOOL', 'Response skipped: call cancelled', { tool: call.name });
        return;
      }
    }

    this.sendToolResponse(socket, key ?? '', response);
    if (call.name === 'submit_booking' && response.response['ok'] === true) {
      const gen = this.sessionGen;
      this.recycleAfterTurn = true;
      // turnComplete na aala tar 6 sec nantar recycle kara
      setTimeout(() => {
        if (gen === this.sessionGen && this.recycleAfterTurn) {
          this.recycleAfterTurn = false;
          this.recycleSession();
        }
      }, 6000);
    }
  }

  private sendToolResponse(socket: WebSocket, key: string, response: ToolResponse): void {
    if (key && this.toolSentOn.get(key) === socket) {
      return; // already answered on this socket (duplicate server message)
    }
    const sent = this.sendJson(socket, {
      toolResponse: { functionResponses: [response] }
    });
    if (sent && key) {
      this.toolSentOn.set(key, socket);
    } else if (!sent) {
      this.log('TOOL', 'Response not sent: socket stale or closed', { tool: response.name });
    }
  }

  private async executeCall(call: GeminiToolCall): Promise<ToolResponse> {
    const id = call.id ?? `${call.name}-${Date.now()}`;
    const name = call.name;

    if (!isToolName(name)) {
      return this.makeResponse(id, name, { ok: false, problems: ['Unknown action.'] });
    }

    const policy = TOOL_POLICY[name];

    const { args, rejected } = sanitizeArgs(name, call.args ?? {});
    const rejectedProblems = rejected.map(k => `${FIELD_LABEL[k] ?? k} invalid.`);

    this.log('TOOL', `CALL ${name}`, { fields: Object.keys(args), rejected });

    if (name === 'fill_booking') {
      for (const k of this.DEDUPE_KEYS) {
        if (k in args && this.lastFill.get(k) === JSON.stringify(args[k])) {
          delete args[k];
        }
      }
    }

    if (rejected.length > 0 && Object.keys(args).length === 0) {
      return this.makeResponse(id, name, { ok: false, problems: rejectedProblems }, policy);
    }

    // if (name === 'fill_booking' && Object.keys(args).length === 0) {
    //   return this.makeResponse(id, name, { ok: true, noop: true }, policy);
    // }

    if (name === 'fill_booking' && Object.keys(args).length === 0) {
      return this.makeResponse(
        id, name,
        { ok: true, noop: true, next: 'Already filled. Do NOT send it again. Stay silent until the user says something new.' },
        policy
      );
    }

    if (name === 'submit_booking' && this.submitInFlight) {
      return this.makeResponse(id, name, { ok: false, problems: ['Save in progress.'] }, policy);
    }


    const run = (): Promise<VoiceToolResult> => this.invoke(name, args, policy);

    let result: VoiceToolResult;
    if (policy.mutates) {
      result = await this.runExclusive(run);
    } else {
      await this.mutationQueue; // read-only: see the latest completed mutations
      result = await run();
    }

    if (name === 'fill_booking' && result.ok !== false && !result.problems?.length) {
      for (const k of this.DEDUPE_KEYS) {
        if (k in args) this.lastFill.set(k, JSON.stringify(args[k]));
      }
    }
    if (name === 'new_booking' || (name === 'submit_booking' && result.ok)) {
      this.lastFill.clear();
    }

    if (rejectedProblems.length > 0) {
      result.problems = [...(result.problems ?? []), ...rejectedProblems].slice(0, 3);
    }

    return this.makeResponse(id, name, result, policy);
  }

  private makeResponse(
    id: string,
    name: string,
    result: VoiceToolResult,
    policy?: ToolPolicy
  ): ToolResponse {
    const speak = result.ok === false || (result.problems?.length ?? 0) > 0;
    const response: Record<string, unknown> = { ...result };
    if (NON_BLOCKING_TOOLS && policy?.nonBlocking) {
      response['scheduling'] = speak ? 'INTERRUPT' : 'SILENT';
    }
    return { id, name, response };
  }

  private async invoke(
    name: ToolName,
    args: Record<string, unknown>,
    policy: ToolPolicy
  ): Promise<VoiceToolResult> {
    const handler = this.onTool;
    if (!handler) {
      return { ok: false, problems: ['Voice not ready.'] };
    }

    const TIMED_OUT = Symbol('timeout');
    const work = Promise.resolve().then(() => handler(name, args));

    if (name === 'submit_booking') {
      // Stays true until the real save settles, even if we time out first.
      this.submitInFlight = true;
      const clear = (): void => {
        this.submitInFlight = false;
      };
      work.then(clear, clear);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), policy.timeoutMs);
    });

    try {
      const outcome = await Promise.race([work, timeout]);
      if (outcome === TIMED_OUT) {
        this.log('TOOL', `TIMEOUT ${name}`);
        return { ok: false, problems: [policy.timeoutText] };
      }
      return normalizeResult(outcome);
    } catch (error) {
      this.log('ERROR', `Tool failed ${name}`, {
        error: error instanceof Error ? error.name : 'unknown'
      });
      return { ok: false, problems: ['Action failed.'] };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /* ------------------------------ microphone -------------------------- */

  private tryStartMic(): void {
    if (this.micStarted || !this.ready || !this.audioReady) {
      return;
    }
    this.micStarted = true;
    this.startMic();
  }

  private startMic(): void {
    if (!this.inCtx || !this.stream) {
      return;
    }

    this.inputSource = this.inCtx.createMediaStreamSource(this.stream);
    this.inputWorklet = new AudioWorkletNode(this.inCtx, 'cap');
    this.inputMute = this.inCtx.createGain();
    this.inputMute.gain.value = 0;

    this.inputWorklet.port.onmessage = (event: MessageEvent) => {
      if (this.halfDuplex && this.speaking) {
        return;
      }

      const data = this.toBase64(event.data as ArrayBuffer);
      const socket = this.ws;

      if (this.ready && socket && socket.readyState === WebSocket.OPEN) {
        this.sendAudio(socket, data);
        return;
      }

      // Reconnecting: keep ~1 s so the first words after recovery are not lost.
      this.pendingAudio.push(data);
      if (this.pendingAudio.length > MAX_PENDING_AUDIO_CHUNKS) {
        this.pendingAudio.shift();
      }
    };

    this.inputSource.connect(this.inputWorklet);
    this.inputWorklet.connect(this.inputMute);
    this.inputMute.connect(this.inCtx.destination);

    this.state$.next('listening');
  }

  private sendAudio(socket: WebSocket, base64: string): void {
    this.sendJson(socket, {
      realtimeInput: { audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } }
    });
  }

  /* ------------------------------ playback ---------------------------- */

  private playPcm(b64: string): void {
    const ctx = this.outCtx;
    if (!ctx || !this.isActive()) {
      return;
    }

    try {
      const bin = atob(b64);
      const n = bin.length >> 1;
      if (n === 0) {
        return;
      }

      const buffer = ctx.createBuffer(1, n, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < n; i++) {
        let s = (bin.charCodeAt(2 * i + 1) << 8) | bin.charCodeAt(2 * i);
        if (s >= 0x8000) {
          s -= 0x10000;
        }
        channel[i] = s / 32768;
      }

      const now = ctx.currentTime;
      if (this.nextTime < now + 0.01) {
        this.nextTime = now + 0.03; // underrun: restart with a tiny lead
      }
      if (this.nextTime - now > MAX_QUEUED_PLAYBACK_S) {
        return; // runaway queue protection
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(this.nextTime);
      this.nextTime += buffer.duration;

      this.sources.add(source);
      this.speaking = true;
      if (this.state$.value === 'listening') {
        this.state$.next('speaking');
      }

      source.onended = () => {
        this.sources.delete(source);
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        if (this.sources.size === 0) {
          this.speaking = false;
          if (this.state$.value === 'speaking') {
            this.state$.next('listening');
          }
        }
      };
    } catch {
      this.log('ERROR', 'PCM playback failed');
    }
  }

  private stopPlayback(): void {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
    this.speaking = false;

    if (this.state$.value === 'speaking') {
      this.state$.next('listening');
    }
  }

  private toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  /* ----------------------------- transcript --------------------------- */

  private pushTranscript(role: 'in' | 'out', raw: string): void {
    if (!raw) {
      return;
    }

    if (role !== this.lastRole) {
      this.tBuf = '';
      this.lastRole = role;
    }

    // Keep the raw text (including leading spaces Gemini sends on chunks).
    this.tBuf = (this.tBuf + raw).slice(-600);



  }

  /* ------------------------------- misc ------------------------------- */

  private touch(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.log('VOICE', 'Idle timeout');
      this.stop();
    }, IDLE_MS);
  }

  /**
   * Minimal structured logging. Callers must only pass non-sensitive metadata
   * (counts, field NAMES, codes). Never pass values, args, audio or tokens.
   */
  private log(category: DebugCategory, message: string, meta?: Record<string, unknown>): void {
    if (!this.DEBUG_VOICE) {
      return;
    }
    if (meta) {
      console.debug(`[${category}]`, message, meta);
    } else {
      console.debug(`[${category}]`, message);
    }
  }
}