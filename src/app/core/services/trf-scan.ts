import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';

/** TRF table madhli ek row = ek patient */
export interface TrfPatientRow {
  name: string;
  age: string;
  gender: 'male' | 'female';
  test: string;
  sampleType?: string;
  sid?: string;
}

export interface TrfResult {
  title?: string;
  name?: string;
  age?: string;
  ageType?: 'years' | 'months' | 'days';
  gender?: 'male' | 'female' | 'other';
  phone?: string;
  aadhaar?: string;
  uhid?: string;
  address?: string;
  doctor?: string;
  /** clinical history / "Others (Disease)" */
  history?: string;
  /** test / package naav candidates (page Fuse-match karto) */
  items: string[];
  /** TRF table (S.No | Patient Name | Age/Sex | Investigations ...) madhle patients */
  patients: TrfPatientRow[];
  rawText: string;
}

interface OcrLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Row {
  text: string;      // cells joined with spaces
  raw: string;       // cells joined with " | " (table borders kept)
  top: number;
  bottom: number;
  lines: OcrLine[];
}

/**
 * TRF (Test Requisition / Report Form) / case paper scanner.
 *  - Android/iOS app : Google ML Kit (on-device, free)
 *  - Browser (ionic serve) : tesseract.js  ->  npm i tesseract.js --legacy-peer-deps
 * Path: src/app/core/services/trf-scan.ts
 */
@Injectable({ providedIn: 'root' })
export class TrfScanService {

  // ------------------------------------------------------------
  // 1. Photo ghe + OCR
  // ------------------------------------------------------------
  async scan(fromGallery: boolean): Promise<TrfResult | null> {

    let lines: OcrLine[] = [];

    if (Capacitor.isNativePlatform()) {
      lines = await this.ocrNative(fromGallery);
    } else {
      const file = await this.pickFile(!fromGallery);
      if (!file) return null;
      lines = await this.ocrWeb(file);
    }

    if (!lines.length) return null;

    return this.parse(lines);
  }

  // ---------------- native (ML Kit) ----------------
  private async ocrNative(fromGallery: boolean): Promise<OcrLine[]> {

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
      source: fromGallery ? CameraSource.Photos : CameraSource.Camera,
      correctOrientation: true,
      saveToGallery: false
    });

    if (!photo.path) return [];

    const res: any = await TextRecognition.processImage({
      path: photo.path,
      script: Script.Latin   // Marathi/Hindi sathi: Script.Devanagari (app size vadhto)
    });

    const out: OcrLine[] = [];
    for (const b of res?.blocks || []) {
      for (const l of b?.lines || []) {
        const bb = l?.boundingBox;
        if (!l?.text || !bb) continue;
        out.push({ text: String(l.text), left: bb.left, top: bb.top, right: bb.right, bottom: bb.bottom });
      }
    }
    return out;
  }

  // ---------------- browser (tesseract.js) ----------------
  private pickFile(capture: boolean): Promise<File | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (capture) input.setAttribute('capture', 'environment');
      input.onchange = () => resolve(input.files?.[0] ?? null);
      (input as any).oncancel = () => resolve(null);
      input.click();
    });
  }

  private async ocrWeb(file: File): Promise<OcrLine[]> {

    const { createWorker } = await import('tesseract.js');
    const worker: any = await createWorker('eng');

    try {
      // blocks (v6) / lines (v5) donhi suportt
      const { data }: any = await worker.recognize(file, {}, { blocks: true });

      let rawLines: any[] = Array.isArray(data?.lines) ? data.lines : [];

      if (!rawLines.length && Array.isArray(data?.blocks)) {
        for (const b of data.blocks) {
          for (const p of b?.paragraphs || []) {
            for (const l of p?.lines || []) rawLines.push(l);
          }
        }
      }

      return rawLines
        .filter((l: any) => String(l?.text || '').trim() && l?.bbox)
        .map((l: any) => ({
          text: String(l.text).trim(),
          left: l.bbox.x0,
          top: l.bbox.y0,
          right: l.bbox.x1,
          bottom: l.bbox.y1
        }));

    } finally {
      await worker.terminate();
    }
  }

  // ------------------------------------------------------------
  // 2. OCR lines -> rows -> patients / fields
  // ------------------------------------------------------------

  /** Same visual row madhle lines ekatra (table cells) */
  private buildRows(lines: OcrLine[]): Row[] {

    if (!lines.length) return [];

    const heights = lines.map(l => l.bottom - l.top).sort((a, b) => a - b);
    const medH = heights[Math.floor(heights.length / 2)] || 10;

    const sorted = [...lines].sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));

    const groups: OcrLine[][] = [];
    for (const l of sorted) {
      const cy = (l.top + l.bottom) / 2;
      const last = groups[groups.length - 1];
      if (last) {
        const lastCy = last.reduce((s, x) => s + (x.top + x.bottom) / 2, 0) / last.length;
        if (Math.abs(cy - lastCy) <= medH * 0.6) { last.push(l); continue; }
      }
      groups.push([l]);
    }

    return groups.map(g => {
      const ls = g.sort((a, b) => a.left - b.left);
      return {
        lines: ls,
        top: Math.min(...ls.map(x => x.top)),
        bottom: Math.max(...ls.map(x => x.bottom)),
        raw: ls.map(x => x.text.trim()).join(' | ').replace(/\s+/g, ' ').trim(),
        text: ls.map(x => x.text.trim()).join(' ').replace(/(^|\s)\|+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim()   // drop lone table borders, keep "4|" (a misread 1)
      };
    }).filter(r => r.text);
  }

  parse(lines: OcrLine[]): TrfResult {

    const rows = this.buildRows(lines);
    const rawText = rows.map(r => r.text).join('\n');

    // Section based forms (Patient / Referring Doctor / Test Requirements)
    const sectioned = this.parseSectioned(rows, lines, rawText);
    if (sectioned) return sectioned;

    const out = this.parseLabels(rawText);
    out.patients = this.parseTableRows(rows.map(r => r.text));

    return out;
  }

  private titleCase(s: string): string {
    const v = s.trim();
    return v === v.toUpperCase()
      ? v.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
      : v;
  }

  // ---------- Section based form (e.g. Agilus "TEST REQUISITION FORM") ----------
  private parseSectioned(rows: Row[], lines: OcrLine[], rawText: string): TrfResult | null {

    const find = (re: RegExp, from = 0): number => {
      for (let i = Math.max(0, from); i < rows.length; i++) if (re.test(rows[i].text)) return i;
      return -1;
    };

    const iDoc = find(/referring\s+doctor/i);
    if (iDoc < 0) return null;
    const iTest = find(/test\s+requirements?/i, iDoc + 1);
    if (iTest < 0) return null;

    const iSpecRaw = find(/specimen\s+(?:collection|type)/i, iTest + 1);
    const iSpec = iSpecRaw < 0 ? rows.length : iSpecRaw;

    // PATIENT section: starts at the row beginning with "Name" (skips "Client Name")
    const head = rows.slice(0, iDoc);
    const iName = head.findIndex(r => /^\W*(?:patient\s*)?name\b/i.test(r.text));
    const pt = head.slice(iName < 0 ? 0 : iName).map(r => r.text).join('\n');

    // DOCTOR section
    const dt = rows.slice(iDoc + 1, iTest).map(r => r.text).join('\n');

    // TEST section
    const iHdr = find(/test\s+code/i, iTest + 1);
    const testRows = rows.slice(iHdr >= 0 && iHdr < iSpec ? iHdr + 1 : iTest + 1, iSpec);

    const out: TrfResult = { items: [], patients: [], rawText };
    const clean = (s: string) => s.replace(/[^A-Za-z .'\-]/g, ' ').replace(/\s+/g, ' ').trim();

    // ----- Patient name (+ title) -----
    const nm = pt.match(/^\W*(?:patient\s*)?name\b\s*\*?\s*([^\n]+)/im);
    if (nm) {
      let v = nm[1].replace(/^\s*\([^):]*[):]\s*[:;.\-]?\s*/, '');   // lazy: stop at the first ) or :
      v = clean(v.split(/\bpatient\s*id\b|\bp\.?\s*id\b/i)[0]);
      const t = v.match(/^(mr|mrs|ms|miss|smt|shri|dr)\.?\s+(.+)$/i);
      if (t) {
        const tt = t[1].toLowerCase();
        out.title = tt === 'miss' ? 'ms' : tt === 'smt' ? 'mrs' : tt === 'shri' ? 'mr' : tt;
        v = t[2];
      }
      if (v.length >= 3) out.name = this.titleCase(v).slice(0, 60);
    }

    // ----- Patient ID -> UHID -----
    const pid = pt.match(/patient\s*id\s*[:;\-.]?[\s_]*([A-Za-z0-9][A-Za-z0-9\-\/]{2,29})/i);
    if (pid) out.uhid = pid[1];

    // ----- Mobile -----
    const mob = pt.match(/mobile\*?\s*[:;\-]?[\s_]*(?:\+?91[\s\-]?)?([6-9]\d{9})/i)
      || pt.replace(/(\d)[\s\-](?=\d)/g, '$1').match(/(?:\+?91[\s\-]?|0)?([6-9]\d{9})\b/);
    if (mob) out.phone = mob[1];

    // ----- Address (+ city + pin) -----
    // OCR often garbles the label ("ndgress"), so accept look-alikes and fall back to the row below Mobile
    const adr = pt.match(/\b[a-z]{0,2}d[dg]?r?e?ss\b\s*[:;\-.]?[\s_]*([^\n]+)/i);
    let addrLine = adr ? adr[1] : '';
    if (!addrLine) {
      const pl = pt.split('\n');
      const mi = pl.findIndex(l => /mobile|e-?mail/i.test(l));
      const next = mi >= 0 ? pl[mi + 1] : '';
      if (next && !/\bcity\b|birth|\bage\b|height|village/i.test(next)) addrLine = next;
    }
    const city = pt.match(/\bcity\s*[:;\-.]?[\s_]*([A-Za-z .]+?)(?=\s+village|\s+pin|\n|$)/i);
    const pin = pt.match(/\bpin\b[^0-9\n]{0,15}(\d{6})/i);
    const addrParts = [
      addrLine.split(/\b(?:city|village|pin)\b/i)[0].replace(/[_~]+/g, ' ').replace(/\s+/g, ' ').trim(),
      city ? city[1].trim() : '',
      pin ? pin[1] : ''
    ].filter(Boolean);
    if (addrParts.length) out.address = addrParts.join(', ').slice(0, 200);

    // ----- Age (form format is "__ Y __ M __ D") -----
    // Years is the FIRST number. OCR often misreads the "Y" ("41 v 2 m 12 d"), so go by position,
    // and only treat the first number as months/days when its own unit letter is clearly M / D.
    const am = pt.match(/\bage[a-z]?\*?\s*[:;\-]?\s*([^\n]*)/i);
    if (am) {
      // OCR look-alikes: a "1" is often read as I / l / | right after a digit ("4I Y" = "41 Y")
      const rawSeg = am[1]
        .split(/gender/i)[0]
        .replace(/(\d)\s*[Il|!](?![A-Za-z0-9])/g, (_m: string, d: string) => d + '1')
        .replace(/(\d)\s*[Oo](?![A-Za-z0-9])/g, (_m: string, d: string) => d + '0');
      // OCR sometimes splits digits ("4 1 Y"): join digits separated only by spaces,
      // but fall back to the original text if the joined number is not a valid age ("41 2 M" -> 412)
      const joined = rawSeg.replace(/(\d)\s+(?=\d)/g, '$1');
      const seg = Number((joined.match(/\d{1,4}/) || ['0'])[0]) <= 120 ? joined : rawSeg;
      const f = seg.match(/(\d{1,3})\s*([A-Za-z])?/);
      if (f) {
        const n = Number(f[1]);
        const u = (f[2] || 'y').toLowerCase();
        if (n > 0 && n <= 120) {
          out.age = String(n);
          out.ageType = u === 'm' ? 'months' : u === 'd' ? 'days' : 'years';
        } else if (n === 0) {
          // "0 Y 2 M 12 D" -> use the months number
          const nums = seg.match(/\d{1,3}/g) || [];
          const mo = Number(nums[1] || 0);
          if (mo > 0) { out.age = String(mo); out.ageType = 'months'; }
        }
      }
    }

    // ----- Gender (ticked box) -----
    const gm = pt.match(/gender\s*[:;\-]?\s*([^\n]*)/i);
    if (gm) {
      const mk = gm[1].match(/\b([MFO])\s*[\[\(|]?\s*[xX\u00D7\u2612\u22A0\u2713\u2714\u2717\u2718]/);
      if (mk) out.gender = mk[1] === 'F' ? 'female' : mk[1] === 'M' ? 'male' : 'other';
    }
    if (!out.gender && out.title) {
      if (out.title === 'mr') out.gender = 'male';
      else if (out.title === 'mrs' || out.title === 'ms') out.gender = 'female';
    }

    // ----- Clinical history ("Others (Disease)") -----
    const hs = pt.match(/others?\s*\(?\s*disease\s*\)?\s*[:;\-]?[\s_]*([^\n]+)/i);
    if (hs) {
      const h = hs[1].replace(/[_|]+/g, ' ').replace(/\s+/g, ' ').trim();
      // OCR garbage guard (e.g. "Mi I d fatig ue"): skip when it has several 1-letter fragments
      const fragments = h.split(' ').filter(w => /^[A-Za-z]$/.test(w)).length;
      if (h.length >= 3 && fragments < 2) out.history = h.slice(0, 500);
    }

    // ----- Referring doctor (NOT the hospital / patient) -----
    // OCR may drop the "NAME" label, so also accept "DR. ..." or the first row of the section
    const dn = dt.match(/^\W*name\b\s*[:;\-]?\s*([^\n]+)/im);
    const dd = dt.match(/\b(dr\.?\s+[A-Za-z][^\n]*)/i);
    const first = dt.split('\n')[0] || '';
    const docRaw = dn ? dn[1] : (dd ? dd[1] : first);
    const dv = clean(docRaw.split(/\d|\bp[a-z]?hone|\bmobile|\bemail|@/i)[0]);
    if (dv.length >= 3) out.doctor = this.titleCase(dv).slice(0, 60);

    // ----- Tests -----
    out.items = this.extractTestNames(testRows, lines);

    return out;
  }

  /** Test table: [TEST CODE | TEST NAME] x 2 columns -> only the names */
  private extractTestNames(testRows: Row[], allLines: OcrLine[]): string[] {

    if (!testRows.length || !allLines.length) return [];

    const minL = Math.min(...allLines.map(l => l.left));
    const maxR = Math.max(...allLines.map(l => l.right));
    const W = Math.max(1, maxR - minL);
    const mid = minL + W / 2;

    const names: string[] = [];

    const fromCells = (text: string) => {
      const cells = text.split('|')
        .map(c => c.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(c => c.length > 0);

      let i = 0;
      while (i < cells.length) {
        const c = cells[i];

        // "HEMO1" | "COMPLETE BLOOD COUNT (CBC)"  -> code cell, then name cell
        const looksLikeCode = cells.length > 1 && i < cells.length - 1
          && !/\s/.test(c) && c.length <= 10 && !/\(/.test(c);

        let name = looksLikeCode ? cells[i + 1] : c;
        i += looksLikeCode ? 2 : 1;

        // single cell "HEMO1 COMPLETE BLOOD COUNT" -> strip the leading code
        name = name.replace(/^(?:[A-Za-z]{3,8}-?\d{1,6}|[A-Za-z]{1,2}-?\d{3,6})\s+/, '').trim();

        name = name.replace(/[\[\]~=|{}]+/g, ' ').replace(/\s+/g, ' ').trim();   // table-border junk

        if (name.length >= 3 && /[A-Za-z]/.test(name) && !/^test\s*(code|name)$/i.test(name)) {
          names.push(name);
        }
      }
    };

    for (const r of testRows) {
      const ls = [...r.lines].sort((a, b) => a.left - b.left);
      const spans = ls.some(l => l.left < mid - W * 0.12 && l.right > mid + W * 0.12);

      if (spans) {
        fromCells(ls.map(l => l.text).join(' | '));
      } else {
        const left = ls.filter(l => (l.left + l.right) / 2 < mid);
        const right = ls.filter(l => (l.left + l.right) / 2 >= mid);
        for (const g of [left, right]) {
          if (g.length) fromCells(g.map(l => l.text).join(' | '));
        }
      }
    }

    return Array.from(new Set(names));
  }

  // ---------- TRF table: "1 Sample Patient One 41/M Thyroid Profile Serum HLR180441 —" ----------
  private parseTableRows(rows: string[]): TrfPatientRow[] {

    const sampleRe = /\b(serum|plasma|edta(?:\s+whole\s+blood)?|whole\s+blood|blood|urine|stool|swab|csf|fluoride|citrate|sputum|fluid)\b/i;
    const sidRe = /\b([A-Za-z]{2,5}-?\d{4,})\b/;
    const rowRe = /^\s*(?:\d{1,3}[.)]?\s+)?(.+?)\s+(\d{1,3})\s*[\/\\]\s*([MFmf])\b(.*)$/;

    const list: TrfPatientRow[] = [];

    for (const row of rows) {

      const m = row.match(rowRe);
      if (!m) continue;

      const name = m[1]
        .replace(/[^A-Za-z .'\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^(?:[a-z]{1,2}\s+)+/, '')   // OCR junk before the name ("ie Sample ...")
        .trim();
      const age = Number(m[2]);
      if (name.length < 3 || !(age > 0 && age <= 120)) continue;

      const rest = m[4].trim();

      const sid = rest.match(sidRe);
      const beforeSid = sid ? rest.slice(0, sid.index) : rest;

      const st = beforeSid.match(sampleRe);
      const test = (st ? beforeSid.slice(0, st.index) : beforeSid)
        .replace(/[|—–_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      list.push({
        name: name.slice(0, 60),
        age: String(age),
        gender: m[3].toUpperCase() === 'F' ? 'female' : 'male',
        test,
        sampleType: st?.[1],
        sid: sid?.[1]
      });
    }

    return list;
  }

  // ---------- Label based form: "Patient Name: ..., Age: ..." ----------
  private parseLabels(rawText: string): TrfResult {

    const text = rawText.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const out: TrfResult = { items: [], patients: [], rawText: text };

    const cutAtStop = (s: string): string =>
      s.split(/\b(?:age|sex|gender|dob|mob(?:ile)?|phone|contact|ref|referred|doctor|date|uhid|address|tests?)\b/i)[0]
        .replace(/[^A-Za-z .'\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Name (+ title)
    const nm = text.match(
      /(?:patient\s*name|name\s*of\s*(?:the\s*)?patient|pt\.?\s*name|^\s*name)\s*[:\-.]?\s*(?:(mr|mrs|ms|miss|smt|shri|dr)\.?\s+)?([A-Za-z][^\n]{2,70})/im
    );
    if (nm) {
      const name = cutAtStop(nm[2]);
      if (name.length >= 3) out.name = name.slice(0, 60);
      if (nm[1]) {
        const t = nm[1].toLowerCase();
        out.title = t === 'miss' ? 'ms' : t === 'smt' ? 'mrs' : t === 'shri' ? 'mr' : t;
      }
    }

    // Age + age type
    const unitOf = (u?: string): 'years' | 'months' | 'days' => {
      const x = String(u || 'y').toLowerCase();
      return x.startsWith('m') ? 'months' : x.startsWith('d') ? 'days' : 'years';
    };

    const age1 = text.match(/\bage\b\s*[:\-\/]?\s*(\d{1,3})\s*(y(?:ea)?rs?|yr|m(?:onths?)?|d(?:ays?)?)?/i);
    const age2 = text.match(/\b(\d{1,3})\s*(y(?:ea)?rs?|yr|months?|days?)\b/i);
    const age3 = text.match(/\b(\d{1,3})\s*[\/,]\s*(m|f|male|female)\b/i);

    const ageHit = age1 || age2 || age3;
    if (ageHit) {
      const n = Number(ageHit[1]);
      if (n > 0 && n <= 120) {
        out.age = String(n);
        out.ageType = ageHit === age3 ? 'years' : unitOf(ageHit[2]);
      }
    }

    // Gender
    const g1 = text.match(/\b(?:sex|gender)\b\s*[:\-\/]?\s*(male|female|other|m|f)\b/i);
    const g2 = text.match(/\b(female|male)\b/i);
    const gv = (g1?.[1] || g2?.[1] || (age3 ? age3[2] : '') || '').toLowerCase();
    if (gv) {
      out.gender = gv.startsWith('f') ? 'female' : gv.startsWith('m') ? 'male' : 'other';
    }
    if (!out.gender && out.title) {
      if (out.title === 'mr') out.gender = 'male';
      else if (out.title === 'mrs' || out.title === 'ms') out.gender = 'female';
    }

    // Mobile
    const phoneText = text.replace(/(\d)[\s\-](?=\d)/g, '$1');
    const ph = phoneText.match(/(?:\+?91[\s\-]?|0)?([6-9]\d{9})\b/);
    if (ph) out.phone = ph[1];

    // Aadhaar
    const ad = phoneText.match(/\b(\d{12})\b/);
    if (ad) out.aadhaar = ad[1];

    // UHID
    const uh = text.match(/\buhid\b\s*(?:no\.?)?\s*[:\-.]?\s*([A-Za-z0-9\-\/]{2,30})/i);
    if (uh) out.uhid = uh[1];

    // Address
    const addr = text.match(/\baddress\b\s*[:\-.]?\s*([^\n]{5,200})/i);
    if (addr) out.address = addr[1].trim().slice(0, 200);

    // Referring doctor
    const dr1 = text.match(
      /(?:ref(?:erred|erring)?\.?\s*(?:by)?\s*(?:doctor|doc|dr)?\.?|consultant|doctor\s*name)\s*[:\-.]?\s*(?:dr\.?\s*)?([A-Za-z][^\n]{2,60})/i
    );
    const dr2 = text.match(/\bdr\.?\s+([A-Za-z][A-Za-z .]{2,40})/i);
    const drRaw = dr1?.[1] || dr2?.[1];
    if (drRaw) {
      const d = cutAtStop(drRaw);
      if (d.length >= 3) out.doctor = d.slice(0, 60);
    }

    out.items = this.extractItems(text);

    return out;
  }

  // ------------------------------------------------------------
  // Test candidate lines (labels + patient info lines vagalun)
  // ------------------------------------------------------------
  private extractItems(text: string): string[] {

    const skip =
      /\b(name|age|sex|gender|dob|mob(?:ile)?|phone|contact|address|doctor|dr|ref(?:erred)?|date|time|uhid|id|lab|laboratory|hospital|clinic|report|sample|collected|collection|signature|page|bill|amount|total|paid|due|patient|booking|no|email|city|pin)\b/i;

    const seen = new Set<string>();
    const items: string[] = [];

    for (const line of text.split('\n')) {

      const l = line.trim();
      if (!l || skip.test(l)) continue;

      const parts = l
        .replace(/^\s*[\d]+[.)\-]\s*/, '')
        .split(/[,;+&|]/)
        .map(p => p.replace(/^[\s\-•*·]+|[\s\-•*·]+$/g, '').trim())
        .filter(p => p.length >= 3 && p.length <= 60 && !/^\d+$/.test(p));

      for (const p of parts) {
        const k = p.toLowerCase();
        if (!seen.has(k)) { seen.add(k); items.push(p); }
      }
    }

    return items;
  }
}