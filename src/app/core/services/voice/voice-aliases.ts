// src/app/core/services/voice/voice-aliases.ts
//
// शिकणारा शब्दकोश (AI नाही, खर्च नाही).
// "lip it profile" -> "Lipid Profile" असे जुळवले आणि booking save झाली
// (म्हणजे user ने ते मान्य केले), तर ही जोडी फोनमध्ये साठवली जाते.
// पुढच्या वेळी तोच चुकीचा उच्चार थेट बरोबर नावावर जातो.

export type AliasKind = 'test' | 'pkg' | 'doctor';

const STORE_KEY = 'voice_aliases_v1';
const MAX_PER_KIND = 300;

const norm = (s: unknown): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();

export class VoiceAliases {
  private static data: Record<AliasKind, Record<string, string>> | null = null;

  private static load(): Record<AliasKind, Record<string, string>> {
    if (this.data) return this.data;
    let parsed: any = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch { /* ignore */ }
    this.data = {
      test: parsed?.test ?? {},
      pkg: parsed?.pkg ?? {},
      doctor: parsed?.doctor ?? {}
    };
    return this.data;
  }

  private static save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch { /* ignore */ }
  }

  /** शिकलेले बरोबर नाव, नसेल तर null */
  static resolve(kind: AliasKind, spoken: string): string | null {
    const k = norm(spoken);
    if (!k) return null;
    return this.load()[kind][k] ?? null;
  }

  /** spoken -> exactName जोडी साठव */
  static remember(kind: AliasKind, spoken: string, exactName: string): void {
    const k = norm(spoken);
    const v = String(exactName ?? '').trim();
    if (k.length < 3 || !v || norm(v) === k) return;

    const store = this.load()[kind];
    if (store[k] === v) return;

    const keys = Object.keys(store);
    if (keys.length >= MAX_PER_KIND && !(k in store)) {
      delete store[keys[0]];   // सर्वात जुनी काढ
    }
    store[k] = v;
    this.save();
  }

  static clear(): void {
    this.data = { test: {}, pkg: {}, doctor: {} };
    this.save();
  }
}