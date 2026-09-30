const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'src');
const WRITE = process.argv.includes('--write');
const SKIP_FILES = ['global.scss', 'premium-tokens.scss'];

// Teal-tinted shadows/tints missed by the first pass
const RGBA = [
  [/rgba\(\s*6\s*,\s*95\s*,\s*93\s*,/gi,    'rgba(var(--app-primary-dark-rgb),'],
  [/rgba\(\s*6\s*,\s*58\s*,\s*56\s*,/gi,    'rgba(var(--app-primary-dark-rgb),'],
  [/rgba\(\s*0\s*,\s*107\s*,\s*102\s*,/gi,  'rgba(var(--app-primary-rgb),'],
  [/rgba\(\s*20\s*,\s*60\s*,\s*58\s*,/gi,   'rgba(var(--app-primary-dark-rgb),'],
  [/rgba\(\s*13\s*,\s*71\s*,\s*89\s*,/gi,   'rgba(var(--app-primary-dark-rgb),'],
  [/rgba\(\s*10\s*,\s*138\s*,\s*132\s*,/gi, 'rgba(var(--app-primary-rgb),'],
];

// Hover / pressed / tinted shades of the brand teal
const HEX = {
  '#06635f': 'var(--app-primary-deep)',
  '#044c4a': 'var(--app-primary-deep)',
  '#0a938c': 'var(--app-primary-bright)',
  '#0d6b64': 'var(--app-primary-dark)',
  '#0c857a': 'var(--app-primary-bright)',
  '#0c5f59': 'var(--app-primary-dark)',
  '#0b756b': 'var(--app-primary)',
  '#0f5c4c': 'var(--app-primary-dark)',
  '#1b7a63': 'var(--app-primary)',
  '#e6f5f4': 'var(--app-primary-light)',
  '#e5f4f2': 'var(--app-primary-light)',
  '#e1f3f1': 'var(--app-primary-light)',
  '#d9f3ef': 'var(--app-primary-light)',
  '#d6efed': 'var(--app-primary-light)',
  '#9edbd5': 'var(--app-primary-light)',
  '#f2fbfa': 'var(--app-primary-lighter)',
  '#fbfdfd': 'var(--app-primary-lighter)',
  '#f1f8f7': 'var(--app-primary-lighter)',
  '#f0f4f2': 'var(--app-primary-lighter)',
  '#087e76': 'var(--app-primary)',
  '#067e75': 'var(--app-primary)',
  '#0f4c3a': 'var(--app-primary-dark)',
  '#0b3d3a': 'var(--app-primary-dark)',
  '#0d6966': 'var(--app-primary-dark)',
  '#6fc4bd': 'var(--app-primary-bright)',
};

const SKIP_LINE = /^\s*--illus-/;
const hexRe = new RegExp(Object.keys(HEX).map(h => h + '\\b').join('|'), 'gi');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      if (f !== 'node_modules') walk(p, out);
    } else if (f.endsWith('.scss') && !SKIP_FILES.includes(f)) {
      out.push(p);
    }
  }
  return out;
}

if (!fs.existsSync(ROOT)) {
  console.error('Folder "src" not found. Run this from the project root (where package.json is).');
  process.exit(1);
}

let totalFiles = 0;
let totalChanges = 0;

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  let changes = 0;
  const out = src.split('\n').map(line => {
    if (SKIP_LINE.test(line)) return line;
    let l = line;
    for (const [re, rep] of RGBA) {
      l = l.replace(re, () => { changes++; return rep; });
    }
    l = l.replace(hexRe, m => { changes++; return HEX[m.toLowerCase()]; });
    return l;
  }).join('\n');

  if (changes) {
    totalFiles++;
    totalChanges += changes;
    console.log(String(changes).padStart(4) + '  ' + path.relative(process.cwd(), file));
    if (WRITE) fs.writeFileSync(file, out, 'utf8');
  }
}

console.log('\n' + (WRITE ? 'Written' : 'Dry run') + ': ' + totalChanges + ' replacements in ' + totalFiles + ' files.');