import { Injectable, NgZone, OnDestroy, inject, isDevMode } from '@angular/core';
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
const SILENCE_NOISE = /^\s*[\[(<*]*\s*(silent|silence|no speech|no response|nothing|speech)\s*[\])>*.]*\s*$/i;
/**
 * Declare mutation tools NON_BLOCKING so the model keeps listening and the
 * SILENT/INTERRUPT scheduling is honoured. If your Live model rejects the
 * setup after this change (close code 1007), set this to false.
 */
const NON_BLOCKING_TOOLS = true;

/**
 * START_SENSITIVITY_LOW: speaker echo / small noises are not treated as the
 * start of speech, so the AI voice is not cut in the middle.
 */
const VAD = {
  startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
  endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
  prefixPaddingMs: 100,
  silenceDurationMs: 500
};

const IDLE_MS = 3 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 12000;
const MAX_FAILURES = 8;
const MAX_BACKOFF_MS = 12000;
const MAX_PENDING_AUDIO_CHUNKS = 25; // ~1 s at 40 ms per chunk
const MAX_QUEUED_PLAYBACK_S = 15;
const MAX_CACHED_TOOL_RESULTS = 200;

/** Playback jitter buffer when the queue runs empty (network jitter absorb). */
const PLAYBACK_JITTER_S = 0.4;
/** After AI audio ends, keep the mic muted a bit (half duplex) to skip the echo tail. */
const ECHO_TAIL_MS = 300;
/** Booking tool result nantar model cha faltu "no speech" awaz/text itke sec block. */
const AI_MUTE_MS = 6000;

/** Greeting watchdog: resend greeting once, then give up with an error. */
const GREET_RETRY_MS = 6000;
const GREET_GIVEUP_MS = 14000;
/** true = user ne remove/kadha/hata/nako mhatlyashivay remove call chalnar nahi. */
const REQUIRE_REMOVE_INTENT = true;
const REMOVE_INTENT =
  /\b(remove|delete|clear|kadha|kadh|kaadh|hata|hatao|nako)\b|काढ|हटा|नको|रिमूव|डिलीट/i;
const REMOVE_INTENT_WINDOW_MS = 15000;

/* ------------------------------------------------------------------ */
/* Prompt                                                              */
/* ------------------------------------------------------------------ */
const SYSTEM_PROMPT = `You are a voice data-entry assistant for the "New Booking" screen of a diagnostic lab app used by franchise staff.
The user talks continuously and mixes English, Hindi and Marathi. Understand all three. Ignore background noise, filler words and side conversations.

1. SESSION START
- When the session starts you MUST say out loud, once: "Give me all patient info." After that, speak only as section 4 allows. Never say it again, even after a reconnect.

2. TIMING (most important)
- The user will NOT wait for you. The moment you hear ANY booking detail, even a partial one, call fill_booking with just that detail. Never wait for the user to finish.
- Never call fill_booking with empty arguments. If there is nothing new, just keep listening.

3. WHAT TO SEND
- Send a field ONLY when the user has just said it. NEVER resend a field you already sent.
- Exception: if the user continues or corrects a value (a surname after the first name, a corrected number), send the COMPLETE new value once.
- Never add dots, commas or other punctuation to names.
- Do not guess or invent any value, doctor, test or package.
- When a booking is saved or a new patient starts, FORGET the previous patient completely. Nothing sent earlier counts as "already sent" for the new patient.

4. WHEN TO SPEAK
- Never speak while the user is talking. Never repeat or summarise what the user said.
- You never narrate what you are doing or not doing. After a tool result with an empty "problems" list, end your turn without producing any speech.
- You speak ONLY in these cases: (0) session start: "Give me all patient info."; (a) a tool result has a non-empty "problems" list: say the first problem, once; (b) the user asks you a question: answer in max 8 words; (c) submit_booking returns ok: say only "Saved."; (d) the user asks for a summary: call get_summary and read it briefly.
- After a "not found" problem, do not retry on your own and do not remove anything. But the moment the user says the item again (a corrected or different name), ALWAYS call fill_booking with it, even if it sounds similar to the failed one. A failed item is NOT in the cart, so it is not "already sent".
- When you read a problem, say ONLY the first 6 words. Never read suggestion lists.
- Replies: max 8 words, in the language the user last used. Never ask questions, never ask for confirmation.

4b. HOW TO SPEAK
- When you do speak, speak SLOWLY, clearly and calmly at a relaxed pace. Pronounce every word fully. Never rush and never skip or swallow words.

5. DOCTOR
- Set "doctor" ONLY when the user says doctor / Dr / ref / referred by. The patient name is never the doctor.

6. TESTS AND PACKAGES
- Send each test name EXACTLY as the user said it. Never shorten a full name and never expand an abbreviation. Client handles abbreviations like CBC.
- One array item per test. Use "packages" ONLY when the user says profile or package. If the user says only a name without saying test or package, put it in "tests"; the client also checks packages.
- If the user says several numbers after one name ("wellness 1.3 and 1.2", "wellness 1.3, 1.2"), send EACH as its own array item with the FULL name: ["Wellness 1.3", "Wellness 1.2"]. Never put a comma or "and" inside one item. Never send a bare number like "1.2" alone.
- Names can contain dash or dot, e.g. "Wellness-1.6". The user will NOT say "dash". Send the name as spoken: "Wellness 1.6". Never add or ask for a dash. "point" between digits = ".", e.g. "one point six" = 1.6. The client matches ignoring dashes, dots and spaces.
- Never send an item that is already in cart.tests or cart.packages of the last tool result. An item that is NOT in the cart MUST be sent whenever the user says it.

7. REMOVE
- Remove ONLY when the user clearly says remove / kadha / hata / nako. NEVER remove anything on your own, even after a problem.
- The last tool result has a "cart" with the exact names of tests and packages in the bill. Copy the name from the cart.
- User says "remove test X" -> removeTests: [exact name from cart.tests]. User says "remove package X" -> removePackages: [exact name from cart.packages].
- Send ONLY the item(s) the user named in that sentence. NEVER list other items.
- Use clearAll: true ONLY when the user says remove all / sagla kadha. Never otherwise.
- If the user says remove without naming an item, do not call anything.
- Send remove calls alone, do not put tests or packages in the same call.
- If the item is not in the cart, do not call remove.

8. SAVE AND NEW BOOKING
- Call submit_booking ONLY when the user clearly says save / submit / book kar / save kar / ho jau de / kar de. Never ask "Save?" and never save on your own.
- After a save, "new booking" / "nava booking" / "next patient" / "pudhil patient": call new_booking and end your turn. If the user directly starts new patient details instead, just call fill_booking.
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

export interface ToolPolicy {
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
        'Fill booking fields the moment the user says them, even partial or mid-sentence. Include ONLY the new or changed fields. Call as often as needed. Never resend a test, package or doctor that is in the cart of the last tool result. Items that failed are not in the cart: send them again when the user repeats or corrects them. Never call with no new information.',
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
          removeTests: sArr(
            'Individual test(s) the user just asked to remove. Copy the exact name from cart.tests in the last tool result. Never include other items.'
          ),
          removePackages: sArr(
            'Package(s) the user just asked to remove. Copy the exact name from cart.packages in the last tool result. Never include other items.'
          ),
          removeItems: sArr(
            'Legacy. Do not use. Use removeTests or removePackages.'
          ),
          clearAll: sBool(
            'true ONLY when the user explicitly says to remove everything / all tests and packages. Never otherwise.'
          ),
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

export type Sanitizer = (v: unknown) => unknown;

export const asStr = (v: unknown, max = 300): string | undefined => {
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

const SPLIT_RE = /\s*(?:,|&|\band\b|\bani\b|\baur\b)\s*/i;
const BARE_NUM = /^\d+(?:\.\d+)?$/;
const prefixOf = (s: string): string => s.replace(/[\s\-–_.\d]+$/, '').trim();

/** "Wellness 1.3, 1.2" -> ["Wellness 1.3", "Wellness 1.2"]. Normal naave (Vitamin B12, Serum) tashi rahtat. */
const expandShorthand = (s: string): string[] => {
  const parts = s.split(SPLIT_RE).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return [s];
  const rest = parts.slice(1);
  if (!rest.every(p => BARE_NUM.test(p))) return [s];
  const prefix = prefixOf(parts[0]);
  if (!prefix) return [s];
  return [parts[0], ...rest.map(n => `${prefix} ${n}`)];
};

const asList: Sanitizer = v => {
  const input = Array.isArray(v) ? v : [v];
  const seen = new Set<string>();
  const out: string[] = [];
  let lastPrefix = '';

  for (const item of input) {
    let s = asStr(item, 120);
    if (!s) continue;

    // model ne fakta "1.2" pathavla tar adhicha prefix ghe
    if (BARE_NUM.test(s) && lastPrefix) s = `${lastPrefix} ${s}`;

    for (const part of expandShorthand(s)) {
      const clean = part.replace(/[\s,;:!?]+$/, '');
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      out.push(clean);
      const p = prefixOf(clean);
      if (p) lastPrefix = p;
    }
  }
  return out.length ? out.slice(0, 20) : undefined;
};

/**
 * remove lists: ek vela fakt thode items. Model ne bill madhle sagle items pathvle
 * tar reject hotat.
 */
const MAX_REMOVE_ITEMS = 3;
const asRemoveList: Sanitizer = v => {
  const list = asList(v) as string[] | undefined;
  return list && list.length <= MAX_REMOVE_ITEMS ? list : undefined;
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
  removeTests: asRemoveList,
  removePackages: asRemoveList,
  removeItems: asRemoveList,
  clearAll: asBool,
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

/**
 * A "profile" = everything that makes one voice assistant different from another:
 * prompt, greeting, tool declarations, per-tool policy and argument sanitizers.
 * The service itself (socket, audio, reconnect, tool plumbing) is shared.
 */
export interface VoiceProfile {
  systemPrompt: string;
  /**
   * Sent once as the first user turn, e.g. "Start. Say only: Hello."
   * Empty string = NO spoken greeting: a short local chime plays and the user can speak at once.
   */
  greeting: string;
  /** Gemini `tools` array (functionDeclarations). */
  tools: unknown[];
  policy: Record<string, ToolPolicy>;
  sanitizers: Record<string, Record<string, Sanitizer>>;
  /** Spoken names for rejected fields: { phone: 'Phone' } */
  labels?: Record<string, string>;
}

/** The existing New Booking assistant. Default profile, behaviour unchanged. */
export const BOOKING_PROFILE: VoiceProfile = {
  systemPrompt: SYSTEM_PROMPT,
  greeting: 'Start. Say slowly and clearly, only: Give me all patient info.',
  tools: TOOLS,
  policy: TOOL_POLICY,
  sanitizers: {
    fill_booking: FILL_SCHEMA,
    go_to_step: STEP_SCHEMA,
    get_summary: {},
    new_booking: {},
    submit_booking: {}
  },
  labels: FIELD_LABEL
};

function sanitizeArgs(
  schema: Record<string, Sanitizer>,
  name: string,
  raw: Record<string, unknown>
): { args: Record<string, unknown>; rejected: string[] } {
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
  /** Live transcript chunks (user speech / assistant speech) for a chat UI. */
  readonly message$ = new Subject<{ role: 'user' | 'ai'; text: string }>();

  /**
   * Socket + mic + playback run OUTSIDE Angular's zone: otherwise every WebSocket message
   * (audio chunk, ~25/s) and every mic chunk triggers a full change detection, which starves
   * the main thread on phones and makes the AI voice stutter. Public streams (state$, error$,
   * message$) and tool handlers are brought back into the zone explicitly.
   */
  private readonly zone = inject(NgZone);

  private emitState(s: VoiceState): void {
    this.zone.run(() => this.state$.next(s));
  }

  private emitError(msg: string): void {
    this.zone.run(() => this.error$.next(msg));
  }

  private emitMessage(m: { role: 'user' | 'ai'; text: string }): void {
    this.zone.run(() => this.message$.next(m));
  }

  private DEBUG_VOICE = isDevMode(); // release build madhe console.debug band
  private transcriptRoman = true;
  /**
   * Half duplex = AI bolat astana mic band (echo mule AI cha swatacha awaz ekla jat nahi).
   * Default TRUE. Barge-in (AI chya madhe bolne) nako asel tar setHalfDuplex(false).
   */
  private halfDuplex = true;
  /** performance.now() timestamp until which mic stays muted (echo tail). */
  private mutedUntil = 0;
    /** true = AI cha awaz ani chat text drop hoto (tool result nantar faltu bolne). */
  private aiMuted = false;
  private aiMuteTimer?: ReturnType<typeof setTimeout>;

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
  private profile: VoiceProfile = BOOKING_PROFILE;

  /* socket */
  private ws?: WebSocket;
  private ready = false;
  private connecting = false;
  private connectionResumed = false;
  private resumeHandle?: string;
  private epoch = 0;
  private failures = 0;
  private greeted = false;
  private heardAnything = false;          // pahila AI audio chunk aala ka
  private greetTimers: Array<ReturnType<typeof setTimeout>> = [];
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
  private recentUser = '';
  private recentUserAt = 0;

  /* ---------------------------- public API ---------------------------- */

  configure(config: VoiceConnectionConfig): void {
    this.cfg = config;
  }

  setHalfDuplex(value: boolean): void {
    this.halfDuplex = value;
    if (!value) {
      this.mutedUntil = 0;
    }
  }

  setTranscriptRoman(value: boolean): void {
    this.transcriptRoman = value;
  }

  setDebug(value: boolean): void {
    this.DEBUG_VOICE = value;
  }

  async start(onTool: ToolHandler, profile: VoiceProfile = BOOKING_PROFILE): Promise<void> {
    if (this.state$.value !== 'idle') {
      return;
    }

    const gen = ++this.sessionGen;
    if (isDevMode()) {
      console.debug('[SESSION] start() gen', gen);
    }
    this.onTool = onTool;
    this.profile = profile;
    this.voiceSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.failures = 0;
    this.greeted = false;
    this.heardAnything = false;
    this.clearGreetTimers();
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
    this.recentUser = '';
    this.recentUserAt = 0;
    this.mutedUntil = 0;
    this.unmuteAi();

    this.emitState('connecting');
    this.transcript$.next('');
    this.attachLifecycleListeners();

    // Open Gemini immediately; the microphone initialises in parallel.
    void this.openSocket();

    try {
      // IMPORTANT: AudioContexts MUST be created synchronously, before any `await`,
      // while the user's tap (gesture) is still valid. Otherwise Android WebView /
      // Chrome keeps the output context "suspended" and the greeting is never heard
      // (mostly on first launch, when the mic-permission dialog breaks the gesture).
      this.inCtx = new AudioContext();
      // AI audio is 24 kHz. playPcm() converts to whatever rate the context really has.
      this.outCtx = new AudioContext({ sampleRate: 24000, latencyHint: 'playback' });
      this.log('AUDIO', 'Output ctx', { rate: this.outCtx.sampleRate });
      const resumeBoth = Promise.all([this.inCtx.resume(), this.outCtx.resume()]);

      const stream = await this.getMic();

      if (gen !== this.sessionGen) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this.stream = stream;
      stream.getAudioTracks()[0]?.addEventListener('ended', this.onMicEnded);

      await resumeBoth;
      // Mic permission dialog nantar context parat suspend zala asel tar punha resume.
      await Promise.all([this.inCtx.resume(), this.outCtx.resume()]);
      if (gen !== this.sessionGen) {
        return;
      }

      const url = URL.createObjectURL(
        new Blob([WORKLET], { type: 'application/javascript' })
      );
      try {
        // Kahi Android WebView var pahilyanda addModule fail hoto: ek retry.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await this.inCtx.audioWorklet.addModule(url);
            break;
          } catch (e) {
            if (attempt === 1) {
              throw e;
            }
            this.log('AUDIO', 'addModule failed, retrying');
            await new Promise(r => setTimeout(r, 300));
            if (gen !== this.sessionGen || !this.inCtx) {
              return;
            }
          }
        }
      } finally {
        URL.revokeObjectURL(url);
      }
      if (gen !== this.sessionGen) {
        return;
      }

      this.audioReady = true;
      this.tryStartMic();
      this.touch();

      // Socket aadhich ready zala asel tar ata greeting pathva.
      if (this.ws && this.ready) {
        this.maybeGreet(this.ws);
      }
    } catch (error) {
      if (gen !== this.sessionGen) {
        return; // stopped intentionally while starting
      }
      const name = (error as { name?: string } | null)?.name;
      this.emitError(
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
    if (isDevMode()) {
      console.debug('[SESSION] stop() from:', new Error().stack?.split('\n').slice(2, 5).join(' | '));
    }
    this.sessionGen++;
    this.voiceSessionId = '';
    this.detachLifecycleListeners();
    this.clearGreetTimers();

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
    this.recentUser = '';
    this.recentUserAt = 0;
    this.resumeHandle = undefined;
    this.greeted = false;
    this.heardAnything = false;
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
    this.mutedUntil = 0;
this.unmuteAi();
    this.emitState('idle');
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
      this.emitError('Microphone disconnected.');
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

  private openSocket(): Promise<void> {
    return this.zone.runOutsideAngular(() => this.openSocketCore());
  }

  private async openSocketCore(): Promise<void> {
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

    private muteAi(): void {
    this.aiMuted = true;
    if (this.aiMuteTimer) clearTimeout(this.aiMuteTimer);
    this.aiMuteTimer = setTimeout(() => {
      this.aiMuted = false;
      this.aiMuteTimer = undefined;
    }, AI_MUTE_MS);
    if (this.sources.size > 0) {
      this.stopPlayback();   // chalu asleli faltu awaz lagech thambva
    }
  }

  private unmuteAi(): void {
    this.aiMuted = false;
    if (this.aiMuteTimer) {
      clearTimeout(this.aiMuteTimer);
      this.aiMuteTimer = undefined;
    }
  }

  /** Booking tools: problem/summary/save nasel tar AI ne bolu naye. */
  private applyQuietPolicy(response: ToolResponse): void {
    if (!this.profile.policy[response.name]?.nonBlocking) {
      return;   // dashboard sarkhe tools: AI ne nehmi bolaycha
    }
    const r = response.response;
    const hasProblems = Array.isArray(r['problems']) && (r['problems'] as unknown[]).length > 0;
    const mustSpeak = r['ok'] === false || hasProblems;
    if (mustSpeak) {
      this.unmuteAi();
    } else {
      this.muteAi();
    }
  }

  resetFillCache(): void {
    this.lastFill.clear();
  }

  private buildSetup(): Record<string, unknown> {
    return {
      setup: {
        model: secrets.geminiLiveModel,
        generationConfig: {
          responseModalities: ['AUDIO']
        },
        // NO_INTERRUPTION: server VAD (noise/echo) must not cut the AI voice in the middle.
        // If setup is rejected (close code 1007), remove the activityHandling line.
        realtimeInputConfig: {
          automaticActivityDetection: VAD,
          activityHandling: 'NO_INTERRUPTION'
        },
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
        systemInstruction: { parts: [{ text: this.profile.systemPrompt }] },
        tools: this.profile.tools,
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
      this.emitState('connecting');
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
      this.emitState('connecting');
    }
    void this.openSocket();
  }

  private fatal(message: string): void {
    this.log('ERROR', 'Fatal voice failure', { message });
    this.emitError(message);
    this.stop();
  }

  /* ------------------------ greeting + watchdog ----------------------- */

  private clearGreetTimers(): void {
    for (const t of this.greetTimers) {
      clearTimeout(t);
    }
    this.greetTimers = [];
  }

  private sendGreeting(socket: WebSocket): boolean {
    return this.sendJson(socket, {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: this.profile.greeting }] }],
        turnComplete: true
      }
    });
  }

  /**
   * Greeting fakt tevha pathvto jevha socket setup zalay ANI speaker (outCtx) ready ahe.
   * `greeted` fakt send success zalyavar true hoto, mhanje fail zali tar parat try hote.
   */
  private maybeGreet(socket: WebSocket): void {
    if (this.greeted || !this.ready || !this.audioReady || this.ws !== socket) {
      return;
    }
    if (!this.profile.greeting) {
      // Greeting nako: Gemini chi vaat na pahta lagech listening + chhota local chime.
      this.greeted = true;
      this.heardAnything = true;
      this.playChime();
      return;
    }
    if (!this.sendGreeting(socket)) {
      return; // socket tayar navhta, pudhchya vela parat prayatn
    }
    this.greeted = true;
    this.startGreetWatchdog(socket);
  }

  /** ~0.2 s soft beep, generated locally (no network), so "ready" feedback is instant. */
  private playChime(): void {
    const ctx = this.outCtx;
    if (!ctx) {
      return;
    }
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch {
      /* ignore */
    }
  }

  private startGreetWatchdog(socket: WebSocket): void {
    const gen = this.sessionGen;
    this.clearGreetTimers();

    // 1) 6 sec madhe awaz aali nahi -> greeting parat pathva
    this.greetTimers.push(setTimeout(() => {
      if (gen !== this.sessionGen || this.heardAnything || this.ws !== socket) {
        return;
      }
      this.log('VOICE', 'Greeting watchdog: resending');
      this.outCtx?.resume().catch(() => undefined);
      this.sendGreeting(socket);
    }, GREET_RETRY_MS));

    // 2) 14 sec nantarhi nahi -> user la sanga
    this.greetTimers.push(setTimeout(() => {
      if (gen !== this.sessionGen || this.heardAnything) {
        return;
      }
      this.log('VOICE', 'Greeting watchdog: giving up');
      this.emitError('Voice start zala nahi.');
      this.stop();
    }, GREET_GIVEUP_MS));
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
      if (isDevMode()) {
        console.debug('[GEMINI]', {
          inLen: content.inputTranscription?.text?.length ?? 0,
          out: !!content.outputTranscription?.text,
          turnComplete: !!content.turnComplete,
          interrupted: !!content.interrupted
        });
      }

      if (content.interrupted) {
        this.log('GEMINI', 'interrupted by server');
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

      if (content.outputTranscription?.text && !this.aiMuted) {
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
          this.emitState('listening');
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
      this.emitState('listening');
    }
    this.tryStartMic();

    if (!this.greeted) {
      // audioReady nasel tar start() madhun nantar maybeGreet() call hoil.
      this.maybeGreet(socket);
    } else if (!this.connectionResumed && !this.freshSession) {
      // Fresh server session after a drop: restore minimal context, no reply.
      this.sendJson(socket, {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Connection restored. A booking is already in progress. Do not greet. Continue listening.'
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
    this.unmuteAi();

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
        const s = await navigator.mediaDevices.getUserMedia(attempts[i]);
        // Echo cancellation kharach chalu ahe ka te tapasnyasathi (dev only).
        this.log('AUDIO', 'Mic settings', { ...(s.getAudioTracks()[0]?.getSettings() ?? {}) });
        return s;
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
    this.applyQuietPolicy(response);
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

    const policy = this.profile.policy[name];
    if (!policy) {
      return this.makeResponse(id, name, { ok: false, problems: ['Unknown action.'] });
    }

    const schema = this.profile.sanitizers[name] ?? {};
    const labels = this.profile.labels ?? {};
    const { args, rejected } = sanitizeArgs(schema, name, call.args ?? {});
    const rejectedProblems = rejected.map(k => `${labels[k] ?? k} invalid.`);

    this.log('TOOL', `CALL ${name}`, { fields: Object.keys(args), rejected });
    if (
      isDevMode() &&
      (args['removeTests'] || args['removePackages'] || args['removeItems'] || args['clearAll'] ||
        rejected.some(k => k.startsWith('remove') || k === 'clearAll'))
    ) {
      // Dev only: AI ne remove sathi kay pathvle te baghnyasathi (test/package cha naav, patient data nahi)
      console.debug('[VOICE] remove from AI:', JSON.stringify({
        tests: call.args?.['removeTests'],
        packages: call.args?.['removePackages'],
        items: call.args?.['removeItems'],
        clearAll: call.args?.['clearAll']
      }));
    }

    if (
      REQUIRE_REMOVE_INTENT &&
      name === 'fill_booking' &&
      (args['removeTests'] || args['removePackages'] || args['removeItems'] || args['clearAll'])
    ) {
      const fresh = performance.now() - this.recentUserAt < REMOVE_INTENT_WINDOW_MS;
      if (!(fresh && REMOVE_INTENT.test(this.recentUser))) {
        delete args['removeTests'];
        delete args['removePackages'];
        delete args['removeItems'];
        delete args['clearAll'];
        this.log('TOOL', 'Remove blocked: user did not ask');
      }
    }

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

    if (name === 'fill_booking' && Object.keys(args).length === 0) {
      return this.makeResponse(
        id, name,
        { ok: true, noop: true, next: 'Already filled. Do not send it again.' },
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
      // WHEN_IDLE = model problem bolel; SILENT = kahich bolnar nahi
      response['scheduling'] = speak ? 'INTERRUPT' : 'SILENT';
    }
    return { id, name, response };
  }

  private async invoke(
    name: string,
    args: Record<string, unknown>,
    policy: ToolPolicy
  ): Promise<VoiceToolResult> {
    const handler = this.onTool;
    if (!handler) {
      return { ok: false, problems: ['Voice not ready.'] };
    }

    const TIMED_OUT = Symbol('timeout');
    const work = Promise.resolve().then(() => this.zone.run(() => handler(name, args)));

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
    this.zone.runOutsideAngular(() => this.startMic());
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
      // Half duplex: AI bolat astana ani tyanantar thoda vel (echo tail) mic chunks pathvu naka.
      if (this.halfDuplex && (this.speaking || performance.now() < this.mutedUntil)) {
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

    // tryStartMic() fakt `ready && audioReady` astana call hoto, mhanun ithe listening barobar ahe.
    this.emitState('listening');
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
    if (this.aiMuted) {
      return;   // faltu bolne drop
    }

    try {
      const bin = atob(b64);
      const n = bin.length >> 1;
      if (n === 0) {
        return;
      }

      // Pahila AI audio chunk aala: watchdog shant.
      if (!this.heardAnything) {
        this.heardAnything = true;
        this.clearGreetTimers();
      }

      // Context suspended asel tar audio vajnar nahi, mhanun ithe pan resume.
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined);
      }

      const srcRate = 24000;
      const outRate = ctx.sampleRate; // jo rate WebView ne pratyaksh dila toch vapra
      const outLen = Math.max(1, Math.round((n * outRate) / srcRate));

      // PCM16 (little endian) -> float
      const pcm = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = (bin.charCodeAt(2 * i + 1) << 8) | bin.charCodeAt(2 * i);
        if (s >= 0x8000) {
          s -= 0x10000;
        }
        pcm[i] = s / 32768;
      }

      const buffer = ctx.createBuffer(1, outLen, outRate);
      const channel = buffer.getChannelData(0);

      if (outRate === srcRate) {
        channel.set(pcm);
      } else {
        // linear interpolation: 24 kHz -> context rate
        const step = srcRate / outRate;
        for (let i = 0; i < outLen; i++) {
          const pos = i * step;
          const i0 = Math.min(Math.floor(pos), n - 1);
          const i1 = Math.min(i0 + 1, n - 1);
          const frac = pos - i0;
          channel[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
        }
      }

      const now = ctx.currentTime;
      if (this.nextTime < now + 0.01) {
        // Queue rikama / underrun: network jitter absorb karnyasathi jast buffer (250 ms).
        this.nextTime = now + PLAYBACK_JITTER_S;
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
        this.emitState('speaking');
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
          this.mutedUntil = performance.now() + ECHO_TAIL_MS; // shevatcha echo tail
          if (this.state$.value === 'speaking') {
            this.emitState('listening');
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
    this.mutedUntil = 0; // interrupt: user bolat ahe, mic lagech chalu

    if (this.state$.value === 'speaking') {
      this.emitState('listening');
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
        if (role === 'out' && SILENCE_NOISE.test(raw)) {
      return;
    }

    if (role !== this.lastRole) {
      this.tBuf = '';
      this.lastRole = role;
      if (role === 'in') {
        this.recentUser = ''; // navin user utterance
      }
    }

    if (role === 'in') {
      this.recentUser = (this.recentUser + raw).slice(-300);
      this.recentUserAt = performance.now();
    }

    // Keep the raw text (including leading spaces Gemini sends on chunks).
    this.tBuf = (this.tBuf + raw).slice(-600);
    this.emitMessage({ role: role === 'in' ? 'user' : 'ai', text: raw });
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