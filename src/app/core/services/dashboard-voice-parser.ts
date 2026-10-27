

export type DashAction = 'status' | 'download';

export interface DashParse {
  stop: boolean;
  action: DashAction | null;   // null = वापरकर्त्याने सांगितले नाही, मागचा action वापर
  query: string;               // booking id / barcode / patient name
}

/* ---------------- digit words ---------------- */

const DIGIT_WORDS: Record<string, string> = {
  // English
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9',
  // Hindi (roman)
  shunya: '0', ek: '1', do: '2', teen: '3', char: '4', chaar: '4', panch: '5',
  paanch: '5', chhe: '6', chhah: '6', saat: '7', aath: '8', nau: '9',
  // Hindi (Devanagari)
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5',
  'पाँच': '5', 'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
  // English words written in Devanagari (recognizer output)
  'जीरो': '0', 'ज़ीरो': '0', 'वन': '1', 'टू': '2', 'थ्री': '3', 'फोर': '4',
  'फाइव': '5', 'सिक्स': '6', 'सेवन': '7', 'एट': '8', 'नाइन': '9'
};

const REPEAT: Record<string, number> = {
  double: 2, dabal: 2, 'डबल': 2, triple: 3, tripal: 3, 'ट्रिपल': 3
};

/* ---------------- filler / command words ---------------- */

const DOWNLOAD_RE = /download|डाउनलोड|डाऊनलोड|nikalo|निकालो/i;
const REPORT_RE = /report|reports|रिपोर्ट|रिपोर्ट्स/i;
const STATUS_RE = /status|स्टेटस|sthiti|स्थिति|halat|हालत/i;

const NOISE = new Set([
  // English
  'download', 'report', 'reports', 'booking', 'bookings', 'status', 'give', 'me', 'show',
  'tell', 'of', 'for', 'the', 'a', 'an', 'id', 'number', 'no', 'patient', 'name', 'barcode',
  'please', 'plz', 'check', 'what', 'whats', "what's", 'is', 'my', 'and', 'with', 'to', 'get',
  'open', 'need', 'want', 'can', 'you', 'i', 'it', 'this', 'that', 'on', 'about', 'full',
  // Hindi
  'डाउनलोड', 'डाऊनलोड', 'रिपोर्ट', 'रिपोर्ट्स', 'बुकिंग', 'स्टेटस', 'दो', 'दीजिए', 'दिखाओ',
  'बताओ', 'बताइए', 'का', 'की', 'के', 'नंबर', 'नम्बर', 'आईडी', 'आयडी', 'मरीज', 'नाम',
  'चाहिए', 'कर', 'करो', 'निकालो', 'मुझे', 'मेरा', 'है', 'हैं', 'और', 'ऑफ', 'फॉर',
  'बारकोड', 'पेशेंट', 'पेशंट', 'प्लीज',
  // stray Marathi
  'गिव्ह', 'मी', 'द्या', 'दाखवा', 'सांगा', 'चा', 'ची', 'चे', 'आहे'
]);

const STOP_WORDS = new Set([
  'stop', 'exit', 'quit', 'close', 'cancel', 'band', 'bas', 'बंद', 'रुको', 'रुकिए', 'स्टॉप', 'बस'
]);

/* ---------------- helpers ---------------- */

const DEV_DIGITS = '०१२३४५६७८९';

function normalize(raw: string): string[] {
  const t = String(raw || '')
    .toLowerCase()
    .replace(/[०-९]/g, d => String(DEV_DIGITS.indexOf(d)))
    .replace(/[.,;:!?()"']/g, ' ')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 $2');

  const src = t.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (let i = 0; i < src.length; i++) {
    const w = src[i];

    // "double nine" -> 99, "triple seven" -> 777
    if (REPEAT[w] && i + 1 < src.length) {
      const next = src[i + 1];
      const d = DIGIT_WORDS[next] ?? (/^\d$/.test(next) ? next : undefined);
      if (d !== undefined) {
        out.push(d.repeat(REPEAT[w]));
        i++;
        continue;
      }
    }

    out.push(DIGIT_WORDS[w] ?? w);
  }
  return out;
}

const isDigitTok = (s: string) => /^\d+$/.test(s);
// barcode letters like "b", "bk", "abc" (max 4 letters) next to digits
const isShortAlpha = (s: string) => /^[a-z]{1,4}$/.test(s) && !NOISE.has(s);
const hasDigit = (s: string) => /\d/.test(s);

/* ---------------- main ---------------- */

export function parseDashboardVoice(raw: string): DashParse {
  const text = String(raw || '').trim();
  const tokens = normalize(text);

  // पूर्ण वाक्य फक्त "stop" सारखे असेल तर
  if (tokens.length > 0 && tokens.length <= 2 && tokens.every(t => STOP_WORDS.has(t))) {
    return { stop: true, action: null, query: '' };
  }

  // action
  let action: DashAction | null = null;
  if (DOWNLOAD_RE.test(text)) action = 'download';
  else if (STATUS_RE.test(text)) action = 'status';
  else if (REPORT_RE.test(text)) action = 'download';

  // बाकी शब्द (filler काढून)
  const rest = tokens.filter(t => !NOISE.has(t));

  // 1) अंक असतील तर: ID / barcode
  if (rest.some(hasDigit)) {
    let best = '';
    let cur = '';
    let curHasDigit = false;

    const flush = () => {
      if (curHasDigit && cur.length > best.length) best = cur;
      cur = '';
      curHasDigit = false;
    };

    for (const tok of rest) {
      if (isDigitTok(tok)) {
        cur += tok;
        curHasDigit = true;
      } else if (/^[a-z]+\d+[a-z\d]*$/.test(tok) || /^\d+[a-z]+[a-z\d]*$/.test(tok)) {
        cur += tok;                 // "bk123"
        curHasDigit = true;
      } else if (isShortAlpha(tok)) {
        cur += tok;                 // "b" "k" "1" "2" "3" -> "bk123"
      } else {
        flush();
      }
    }
    flush();

    if (best) return { stop: false, action, query: best.toUpperCase() };
  }

  // 2) अंक नाहीत: patient name
  const name = rest
    .filter(t => /^[\p{L}\p{M}]+$/u.test(t))
    .join(' ')
    .trim();

  return { stop: false, action, query: name };
}