// src/app/core/voice/voice-parser.ts
//
// Rule-based parser (no AI). Spoken text -> args for the existing
// runVoiceToolInner('fill_booking', args) in add-patient.page.ts.
//
// Gemini मधून घेतलेल्या सुधारणा:
//  - मराठी keywords + मराठी/हिंदी अंक (saha, daha, pachchis ...)
//  - "one point six" -> 1.6, "double nine" -> 99, "triple seven" -> 777
//  - "Wellness 1.3 and 1.2" -> ["Wellness 1.3", "Wellness 1.2"]
//  - sanitizers: phone (+91 / 0 prefix), age 0-150, aadhaar 12, discount 0-100
//  - checkbox untick ("e report nako", "remove home collection")
//  - remove limit (max 3), "remove test X" आता चुकून add होत नाही
//  - नवीन fields: clinical / history, otherCharges

export type VoiceCmd = 'next' | 'submit' | 'new' | 'stop';

export interface VoiceParse {
  fill: any | null;
  cmds: VoiceCmd[];
  keyed: boolean;          // वाक्यात किमान एक keyword सापडला का
}

export interface ParseOpts {
  allowPre?: boolean;      // keyword आधीचा भाग नाव मानायचा का (फक्त नाव अपेक्षित असताना)
}

/* ------------------------------------------------------------------ */
/* Sanitizers (Gemini सारखेच)                                          */
/* ------------------------------------------------------------------ */

export const asPhone = (v: unknown): string | undefined => {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? d : undefined;
};

export const asAadhaar = (v: unknown): string | undefined => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 12 ? d.slice(0, 12) : undefined;
};

export const asAge = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.trim()) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 150 ? n : undefined;
};

export const asDiscount = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.trim()) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
};

export const asMoney = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.trim()) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000000 ? n : undefined;
};

/** एका वेळी जास्तीत जास्त इतके items remove होतील (Gemini: MAX_REMOVE_ITEMS). */
export const MAX_REMOVE_ITEMS = 3;

/* ------------------------------------------------------------------ */
/* Keywords                                                            */
/* ------------------------------------------------------------------ */

// word boundary that also works for Devanagari (\b does not)
const B = '[\\p{L}\\p{M}\\p{N}]';

// ORDER MATTERS: earlier groups win when two match at the same position.
const KEYS: [string, string][] = [
  ['cClear', 'clear all|remove all|delete all|sab hata(?:o|do)?|सब हटाओ|सब हटा दो|sagla kadha|sagle kadha|saglan kadha|सगळं काढा|सगळे काढा|सगळे हटवा'],
  ['cNew', 'new booking|new patient|next patient|naya patient|nayi booking|nava booking|nava patient|navin booking|pudhil patient|pudhchi patient|नया पेशेंट|नई बुकिंग|नवीन बुकिंग|नवा पेशंट|पुढील पेशंट'],
  ['cSubmit', 'save booking|booking save|save this booking|submit booking|submit|book it|save kar de|save kar|book kar de|book kar|ho jau de|सेव कर दो|सेव करो|सेव्ह कर|सेव कर|सबमिट'],
  ['cNext', 'next step|go next|next|aage|pudhe|आगे|पुढे'],
  ['cStop', "stop listening|stop|band kar(?: do)?|band kara|thamba|बंद करो|बंद करा|थांबा"],
  ['remove', 'remove|delete|hata(?:o|do)?|kadha|kadh|kaadh|nako|हटाओ|हटा दो|निकालो|काढा|काढ|नको'],

  ['name', 'patient name|naam|name|nav|नाम|नाव'],
  ['ageY', '\\d{1,3}\\s*(?:years?|yrs?|saal|sal|varsh|साल|वर्ष)'],
  ['ageM', '\\d{1,3}\\s*(?:months?|mahine|mahina|महीने|महिने|महिना)'],
  ['ageD', '\\d{1,3}\\s*(?:days?|din|divas|दिन|दिवस)'],
  ['age', 'age|umar|umr|vay|उम्र|आयु|वय'],
  ['doctor', '(?:ref+[a-z]{1,6}\\s+)?doc(?:tor|ter|te)\\s+name|ref+[a-z]{1,6}\\s+doc[a-z]{0,4}(?:\\s+name)?|ref\\.?\\s*doc[a-z]{0,4}(?:\\s+name)?|referred by|referring doctor|doctor|docter|docte|dactar|dr\\.?|डॉक्टर|डॉ\\.?'],
  ['aadhaar', 'adhar\\s*card|aadhaar\\s*card|aadhar\\s*card|aadhaar|aadhar|adhar|आधार'],
  ['packages', 'packages?|pakages?|pakej|profiles?|पैकेज|पॅकेज|प्रोफाइल'],
  ['hc', 'home collection|home delivery|ghar se|ghari|होम कलेक्शन'],
  ['clinical', 'clinical history|clinical|क्लिनिकल'],
  ['file', 'file|document|फाइल'],
  ['mobile', 'mobile number|mobile|phone number|phone|contact number|contact|मोबाइल|मोबाईल|फोन'],
  ['ph', '(?:\\+?91[\\s-]?)?[6-9](?:[\\s-]?\\d){9}'],
  ['gender', 'female|woman|girl|ladki|stri|mahila|aurat|लड़की|महिला|फीमेल|स्त्री|औरत|male|man|boy|ladka|purush|mard|लड़का|पुरुष|मर्द|मेल'],
  ['tests', 'tests?|investigations?|jaanch|janch|chachani|जांच|टेस्ट|चाचणी|चाचण्या'],
  ['address', 'address|pata|patta|पता|पत्ता'],
  ['uhid', 'uhid'],
  ['charges', 'other charges?|extra charges?|charges?|इतर चार्ज'],
  ['discount', 'discount|chhoot|chut|savlat|छूट|सवलत|डिस्काउंट'],
  // 'online report' आधी (er), मग 'online' = upi (pay)
  ['er', 'e[\\s-]?report|online report|ई[\\s-]?रिपोर्ट'],
  ['pay', 'cash|theva|upi|gpay|google pay|phonepe|paytm|online|कैश|ठेवा|यूपीआई'],
];

const RE = new RegExp(
  `(?<!${B})(?:${KEYS.map(([k, p]) => `(?<${k}>${p})`).join('|')})(?!${B})`,
  'giu'
);

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

// "nine eight seven six ..." -> "9876..."  (runs of 4+ digit words)
const DIGIT_WORDS: Record<string, string> = {
  zero: '0', shunya: '0',
  one: '1', ek: '1',
  two: '2', do: '2', don: '2',
  three: '3', teen: '3',
  four: '4', char: '4',
  five: '5', paanch: '5', panch: '5', paach: '5', pach: '5',
  six: '6', chhe: '6', chheh: '6', saha: '6',
  seven: '7', saat: '7',
  eight: '8', aath: '8',
  nine: '9', nau: '9'
};
const DW = Object.keys(DIGIT_WORDS).join('|');
const dig = (w: string): string => DIGIT_WORDS[w.toLowerCase()] ?? w;

// जोडअंक: एकाच वेळी वय/पैसे सारख्या ठिकाणी वापरले जातात (phone मध्ये नाही)
const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Hindi / Marathi
  ek: 1, do: 2, don: 2, teen: 3, char: 4, paanch: 5, panch: 5, paach: 5, pach: 5,
  chhe: 6, saha: 6, saat: 7, aath: 8, nau: 9,
  das: 10, daha: 10, akra: 11, gyarah: 11, bara: 12, barah: 12, tera: 13, terah: 13,
  chaudah: 14, pandhra: 15, pandrah: 15, sola: 16, solah: 16, satra: 17, satrah: 17,
  athara: 18, atthara: 18, atharah: 18, ekonis: 19, unnis: 19,
  vis: 20, bees: 20, pachchis: 25, pachees: 25, pachis: 25, pacchis: 25,
  tees: 30, tis: 30, tees_: 30, chalis: 40, chaalis: 40,
  pannas: 50, pachas: 50, pachaas: 50, saath: 60, sattar: 70, ashi: 80, assi: 80, nabbe: 90, nabbe_: 90
};

/** "twenty five" / "pachchis" / "45" -> number, नाही तर null */
export function spokenNumber(s: string): number | null {
  const t = String(s ?? '').toLowerCase().trim();
  const d = t.match(/\d{1,3}/);
  if (d) return +d[0];
  const toks = t.split(/[\s-]+/).filter(Boolean);
  if (!toks.length || toks.length > 2) return null;
  const vals = toks.map(w => NUM_WORDS[w]);
  if (vals.some(v => v === undefined)) return null;
  if (vals.length === 1) return vals[0];
  return vals[0] >= 20 && vals[0] % 10 === 0 && vals[1] < 10 ? vals[0] + vals[1] : null;
}

const NUMW = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
const UNIT =
  '(?:years?|yrs?|saal|sal|varsh|साल|वर्ष|months?|mahine|mahina|महीने|महिने|महिना|days?|din|divas|दिन|दिवस)';
const NUM_BEFORE_UNIT = new RegExp(
  `(?<![\\p{L}\\p{N}])((?:${NUMW})(?:\\s+(?:${NUMW}))?)\\s+(?=${UNIT}(?![\\p{L}\\p{N}]))`,
  'giu'
);

// "pachchis varsh" -> "25 varsh"
function numWordsBeforeUnit(s: string): string {
  return s.replace(NUM_BEFORE_UNIT, (m, w: string) => {
    const n = spokenNumber(w);
    return n === null ? m : `${n} `;
  });
}

// "one point six" -> "1.6"
const POINT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${DW}|\\d+)\\s+(?:point|poin|dot)\\s+(${DW}|\\d+)(?![\\p{L}\\p{N}])`,
  'giu'
);
const pointFix = (s: string): string =>
  s.replace(POINT_RE, (_m, a: string, b: string) => `${dig(a)}.${dig(b)}`);

// "double nine" -> "99", "triple seven" -> "777"
const DOUBLE_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(double|triple|dabal|tripal)\\s+(${DW}|\\d)(?![\\p{L}\\p{N}])`,
  'giu'
);
const doubleTriple = (s: string): string =>
  s.replace(DOUBLE_RE, (_m, k: string, d: string) =>
    dig(d).repeat(/^(?:triple|tripal)$/i.test(k) ? 3 : 2) + ' '
  );

// 4+ अंक/अंकशब्द एकापुढे एक -> जोडून एक number (शब्द असल्यासच)
const DIGIT_RUN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:${DW}|\\d+)(?![\\p{L}\\p{N}])[\\s,-]*){4,}`,
  'giu'
);
function wordsToDigits(s: string): string {
  return s.replace(DIGIT_RUN, run => {
    if (!/[a-z]/i.test(run)) return run;   // आधीच फक्त अंक असतील तर काही बदलू नको
    return (
      run.toLowerCase().split(/[\s,-]+/).filter(Boolean)
        .map(w => DIGIT_WORDS[w] ?? w.replace(/\D/g, '')).join('') + ' '
    );
  });
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const TRIM_EDGE = /^[\s:,.\-]+|[\s:,.\-]+$/g;
const FILL = /^(?:is|hai|है|ahe|aahe|आहे|ka|ki|of|to|as|please|plz|from|add|also|change|set|update|make|two)\s+/i;
const TAIL = /\s+(?:hai|है|ahe|aahe|आहे|please|plz|karo|kar do|kardo|kara|kijiye|and|aur|और|also|add|at)$/i;

export function tidy(s: string): string {
  let t = s.replace(TRIM_EDGE, '');
  let prev: string;
  do {
    prev = t;
    t = t.replace(FILL, '').replace(TAIL, '').replace(TRIM_EDGE, '');
  } while (t !== prev);
  return /^(?:is|hai|है|ahe|aahe|आहे|and|aur|और)$/i.test(t) ? '' : t;
}

const SPLIT_RE = /\s*,\s*|\s+(?:and|aur|ani|aani|और|आणि)\s+/i;
const BARE_NUM = /^\d+(?:\.\d+)?$/;
const prefixOf = (s: string): string => s.replace(/[\s\-–_.\d]+$/, '').trim();

/**
 * ["wellness 1.3", "1.2"] -> ["wellness 1.3", "wellness 1.2"]
 * (फक्त नंबर आला तर आधीच्या item चे नाव घे)
 */
function expandList(parts: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let lastPrefix = '';
  for (let p of parts) {
    if (BARE_NUM.test(p) && lastPrefix) p = `${lastPrefix} ${p}`;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    const pre = prefixOf(p);
    if (pre) lastPrefix = pre;
  }
  return out.slice(0, 20);
}

// "cbc lft kft" (मधे and/comma नसताना) -> 3 वेगळे items.
// फक्त जेव्हा सगळे शब्द ओळखीचे short test-codes असतील तेव्हाच तोडतो ("lipid profile" सारखे नाव तुटू नये).
const ABBR = new Set([
  'cbc', 'lft', 'kft', 'rft', 'esr', 'tsh', 'crp', 'hba1c', 'ecg', 'usg', 'hiv', 'psa',
  'fbs', 'ppbs', 'rbs', 'pt', 'inr', 'aptt', 't3', 't4', 'ft3', 'ft4', 'sgpt', 'sgot', 'hb'
]);
function splitAbbr(x: string): string[] {
  const t = x.toLowerCase().split(/\s+/).filter(Boolean);
  return t.length > 1 && t.every(w => ABBR.has(w)) ? t : [x];
}

/** "cbc, lft and wellness 1.3 and 1.2" -> items. voice-assistant.ts पण हेच वापरतो. */
export function splitItems(s: string): string[] {
  return expandList(
    s.split(SPLIT_RE).map(tidy).filter(x => x.length > 1 || BARE_NUM.test(x)).flatMap(splitAbbr)
  );
}

const CONNECTOR = /^(?:,|and\b|aur\b|ani\b|aani\b|और|आणि)\s*/i;

export function cap(s: string): string {
  return s.replace(/(^|\s)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
}

const TITLES: Record<string, string> = {
  mr: 'mr', mister: 'mr', shri: 'mr', shree: 'mr', bhau: 'mr', sir: 'mr', bhaiya: 'mr', 'श्री': 'mr',
  mrs: 'mrs', smt: 'mrs', tai: 'mrs', madam: 'mrs', 'श्रीमती': 'mrs',
  ms: 'ms', miss: 'ms', kumari: 'ms'
};

// "test" सारखे ऐकू येणारे शब्द (taste, tests, text, teast, tessed...) -> test
// फक्त जेव्हा त्यानंतर काहीतरी येते, आणि "history/clinical" नंतर नसेल तेव्हा.
const TESTLIKE = /\b(?:ta+ste|text(?:s)?|tast|teast|tess?ed)\b(?=\s+\S)/gi;

// फक्त सामान्य (generic) दुरुस्त्या: नावांची/शब्दांची यादी नाही.
const SPEECH_FIX: [RegExp, string][] = [
  [/\bat\s+kar(?:a|t)?ta\b/gi, ' '],                                    // "at karata" = noise
  [/\b(?:bbc|sbc|ccb|cbb|cpc|cbs|see\s*bee\s*see|c\s+b\s+c|c\s+c\s+b)\b/gi, 'cbc'],
  [/\bl\s+f\s+t\b/gi, 'lft'],
  [/\bk\s+f\s+t\b/gi, 'kft'],
  [/\bu\s*h\s*i\s*d\b/gi, 'uhid'],                                      // "u h i d" -> uhid
  [/\b(?:two|2)\s*d\s*echo\b/gi, '2d echo'],                            // "two d echo" ('two' FILL मध्ये गळू नये)
  [/\badd\s+(?=(?:tests?|packages?|pakages?|pakej)\b)/gi, ' '],         // "add test/package" -> "test/package"
  [/\b(?:check|checked|tick)\b/gi, ' '],                                // "file check" -> "file"
];

function fixSpeech(s: string): string {
  s = s.replace(TESTLIKE, (w, off: number, whole: string) =>
    /(?:history|clinical)\s+$/i.test(whole.slice(Math.max(0, off - 14), off)) ? w : 'test'
  );
  return SPEECH_FIX.reduce((t, [re, to]) => t.replace(re, to), s);
}

export function prepare(raw: string): string {
  let t = fixSpeech(String(raw || ''));
  t = pointFix(t);
  t = doubleTriple(t);
  t = wordsToDigits(t);
  t = numWordsBeforeUnit(t);
  return t.trim();
}

const NEG = /^(?:nahi|nahin|no|not|without|नहीं|नाही)(?![\p{L}\p{N}])/iu;
const FEMALE = /^(?:female|woman|girl|ladki|stri|mahila|aurat|लड़की|महिला|फीमेल|स्त्री|औरत)$/i;

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export function parseVoice(raw: string, opts: ParseOpts = {}): VoiceParse {
  const text = prepare(raw);
  const fill: any = {};
  const cmds: VoiceCmd[] = [];
  const tests: string[] = [];
  const pkgs: string[] = [];
  const rem: string[] = [];
  let looseAge: string | null = null;
  let removePre = false;     // keyword आधीचा भाग remove साठी वापरला का
  let preUsed = false;       // keyword आधीचा भाग test नाव म्हणून वापरला ("lipid profile")
  let historyOpen = false;   // clinical history text चालू आहे ("diabetes since five years")
  let lastList: string[] | null = null;   // शेवटी भरलेली tests/packages/remove यादी

  const setName = (seg: string) => {
    let s = tidy(seg);
    if (!s) return;
    const t = s.match(/^(mr|mister|mrs|ms|miss|shri|shree|smt|bhau|sir|bhaiya|tai|madam|kumari|श्री|श्रीमती)\.?\s+(.*)$/i);
    if (t) {
      fill.title = TITLES[t[1].toLowerCase()] ?? TITLES[t[1]];
      s = t[2];
    }
    // "ramesh patil 45"  -> name + age
    const m = s.match(/^([^\d]+?)\s+(\d{1,3})$/);
    if (m) { s = m[1]; looseAge = m[2]; }
    s = tidy(s);
    if (s) { fill.name = cap(s); fill.nameExplicit = true; }
  };

  const ms = [...text.matchAll(RE)];
  const keys = ms.map(m => Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0]);

  const segOf = (i: number): string => {
    const m = ms[i];
    const s = (m.index ?? 0) + m[0].length;
    const e = ms[i + 1]?.index ?? text.length;
    return tidy(text.slice(s, e));
  };

  // keyword आधीचा भाग
  const pre = tidy(text.slice(0, ms[0]?.index ?? text.length))
    .replace(/\b(?:patient|info|information|details|booking|new|please|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // checkbox: true = tick, false = untick ("e report nako", "remove home collection")
  const flag = (i: number): boolean => {
    const seg = segOf(i);
    if (NEG.test(seg)) return false;
    if (keys[i + 1] === 'remove' && seg === '') return false;
    if (i > 0 && keys[i - 1] === 'remove' && segOf(i - 1) === '' && !(i - 1 === 0 && removePre)) return false;
    return true;
  };

  // "remove test cbc" -> remove, add नाही
  const afterRemove = (i: number): boolean =>
    i > 0 && keys[i - 1] === 'remove' && segOf(i - 1) === '' && !(i - 1 === 0 && removePre);

  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const key = keys[i];
    if (!key) continue;

    const seg = segOf(i);
    const digits = seg.replace(/\D/g, '');

    // history मधले "five years" हे वय नाही, history चाच भाग आहे
    if (historyOpen) {
      if (key === 'ageY' || key === 'ageM' || key === 'ageD') {
        fill.history = `${fill.history} ${m[0]}${seg ? ' ' + seg : ''}`.trim();
        continue;
      }
      historyOpen = false;
    }

    switch (key) {
      case 'name': setName(seg); break;
      case 'ageY': case 'ageM': case 'ageD': {
        const a = asAge(parseInt(m[0], 10));
        if (a !== undefined) {
          fill.age = a;
          fill.ageType = key === 'ageY' ? 'years' : key === 'ageM' ? 'months' : 'days';
        }
        break;
      }
      case 'age': {
        const a = asAge(spokenNumber(seg));
        if (a !== undefined) fill.age = a;
        break;
      }
      case 'doctor': if (seg) fill.doctor = cap(seg); break;
      case 'aadhaar': { const a = asAadhaar(digits); if (a) fill.aadhaar = a; break; }
      case 'mobile': {
        const p = asPhone(digits) ?? (digits.length > 10 ? asPhone(digits.slice(-10)) : undefined);
        if (p) fill.phone = p;
        break;
      }
      case 'ph': { const p = asPhone(m[0]); if (p) fill.phone = p; break; }
      case 'gender': fill.gender = FEMALE.test(m[0].toLowerCase()) ? 'female' : 'male'; break;
      case 'tests': {
        const target = afterRemove(i) ? rem : tests;
        target.push(...splitItems(seg));
        lastList = target;
        break;
      }
      case 'packages': {
        // "lipid profile" / "thyroid profile": 'profile' हा शब्द नावाचाच भाग आहे, keyword नाही.
        // (नावानंतर येऊन वाक्य/यादी संपत असेल तेव्हा.) "profile lipid" असेल तर keyword.
        if (/^profiles?$/i.test(m[0])) {
          const prevEnd = i > 0 ? (ms[i - 1].index ?? 0) + ms[i - 1][0].length : 0;
          const before = i === 0 ? pre : tidy(text.slice(prevEnd, m.index ?? 0));
          const rawAfter = text.slice((m.index ?? 0) + m[0].length, ms[i + 1]?.index ?? text.length).trim();
          const trailing = !tidy(rawAfter) || CONNECTOR.test(rawAfter);

          if (trailing && before) {
            let list: string[] | null = null;
            if (i === 0) {
              tests.push(...splitItems(`${before} profile`));
              list = tests;
              preUsed = true;
            } else if (
              lastList && lastList.length &&
              (keys[i - 1] === 'tests' || keys[i - 1] === 'packages' || keys[i - 1] === 'remove')
            ) {
              lastList[lastList.length - 1] += ' profile';
              list = lastList;
            }
            if (list) {
              lastList = list;
              const rest = rawAfter.replace(CONNECTOR, '');
              if (tidy(rest)) list.push(...splitItems(rest));
              break;
            }
          }
        }
        const target = afterRemove(i) ? rem : pkgs;
        target.push(...splitItems(seg));
        lastList = target;
        break;
      }
      case 'remove': {
        let items = splitItems(seg);
        // मराठी क्रम: "CBC kadha" (item आधी, keyword नंतर)
        if (!items.length && i === 0 && pre && !/\d{3,}/.test(pre)) {
          items = splitItems(pre);
          if (items.length) removePre = true;
        }
        rem.push(...items);
        lastList = rem;
        break;
      }
      case 'address': if (seg) fill.address = seg; break;
      case 'uhid': if (seg) fill.uhid = seg.replace(/\s/g, '').toUpperCase(); break;
      case 'charges': {
        const n = asMoney(spokenNumber(seg));
        if (n !== undefined) fill.otherCharges = n;
        break;
      }
      case 'discount': {
        const n = seg.match(/\d{1,3}(?:\.\d+)?/);
        const d = n ? asDiscount(Number(n[0])) : undefined;
        if (d !== undefined) fill.discountPercent = d;
        break;
      }
      case 'pay': fill.paymentMode = /upi|pay|phonepe|paytm|online|यूपीआई/i.test(m[0]) ? 'upi' : 'cash'; break;
      case 'hc': fill.homeCollection = flag(i); break;
      case 'er': fill.eReport = flag(i); break;
      case 'file': fill.file = flag(i); break;
      case 'clinical': {
        const on = flag(i);
        fill.clinical = on;
        if (on && seg && !NEG.test(seg)) {
          fill.history = seg;
          historyOpen = true;
        }
        break;
      }

      case 'cClear': fill.clearAll = true; break;
      case 'cNext': cmds.push('next'); break;
      case 'cSubmit': cmds.push('submit'); break;
      case 'cNew': cmds.push('new'); break;
      case 'cStop': cmds.push('stop'); break;
    }
  }

  // keyword आधीचे शब्द नाव मानायचे ते फक्त जेव्हा असिस्टंट नावच अपेक्षित करत असेल
  if (opts.allowPre && !removePre && !preUsed && !fill.name && pre && !/\d/.test(pre) && pre.split(' ').length <= 4) {
    setName(pre);
  }
  if (looseAge && fill.age === undefined) {
    const a = asAge(looseAge);
    if (a !== undefined) fill.age = a;
  }

  if (tests.length) fill.tests = expandList(tests);
  if (pkgs.length) fill.packages = expandList(pkgs);
  // एका वेळी फार items असतील तर चुकीचे समजून सोडून दे (Gemini सारखे)
  if (rem.length && rem.length <= MAX_REMOVE_ITEMS) fill.removeItems = rem;

  return {
    keyed: ms.length > 0,
    fill: Object.keys(fill).length ? fill : null,
    cmds: cmds.filter((c, i) => cmds.indexOf(c) === i)
  };
}