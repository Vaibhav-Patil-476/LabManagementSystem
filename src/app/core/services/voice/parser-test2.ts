import { parseVoice } from './voice-parser';

// [sentence, options, expected fill (partial match) | null]
type Exp = Record<string, any> | null;
const cases: [string, any, Exp, string?][] = [
  // ---- पूर्वी चुकत होते ----
  ['test two d echo', {}, { tests: ['2d echo'] }],
  ['test cbc lft kft', {}, { tests: ['cbc', 'lft', 'kft'] }],
  ['e report nako', {}, { eReport: false }],
  ['e-report nako', {}, { eReport: false }],
  ['ereport', {}, { eReport: true }],
  ['e report and home collection', {}, { eReport: true, homeCollection: true }],
  ['doctor name Dr Patil test lipid profile', {}, { doctor: 'Patil', tests: ['lipid profile'] }],
  ['test lipid profile and cbc', {}, { tests: ['lipid profile', 'cbc'] }],
  ['test cbc and thyroid profile', {}, { tests: ['cbc', 'thyroid profile'] }],
  ['lipid profile', {}, { tests: ['lipid profile'] }],
  ['thyroid profile, cbc', {}, { tests: ['thyroid profile', 'cbc'] }],
  ['remove lipid profile', {}, { removeItems: ['lipid profile'] }],
  ['package wellness 1.3', {}, { packages: ['wellness 1.3'] }],
  ['profile lipid', {}, { packages: ['lipid'] }],
  ['clinical history diabetes since five years', {}, { clinical: true, history: 'diabetes since 5 years' }],
  ['clinical history diabetes since five years male', {}, { history: 'diabetes since 5 years', gender: 'male' }],
  ['u h i d abc123', {}, { uhid: 'ABC123' }],
  ['mister ramesh patil', { allowPre: true }, { title: 'mr', name: 'Ramesh Patil' }],

  // ---- आधी चालत होते: मोडायला नकोत ----
  ['name sunita kulkarni age two years', {}, { name: 'Sunita Kulkarni', age: 2, ageType: 'years' }],
  ['age pachchis varsh', {}, { age: 25, ageType: 'years' }],
  ['test wellness 1.3 and 1.2', {}, { tests: ['wellness 1.3', 'wellness 1.2'] }],
  ['mobile nine eight seven six five four three two one zero', {}, { phone: '9876543210' }],
  ['mobile +91 9876543210', {}, { phone: '9876543210' }],
  ['remove test cbc', {}, { removeItems: ['cbc'] }],
  ['cbc kadha', {}, { removeItems: ['cbc'] }],
  ['remove home collection', {}, { homeCollection: false }],
  ['doctor sanket kale test cbc', {}, { doctor: 'Sanket Kale', tests: ['cbc'] }],
  ['test cbc, lft, kft', {}, { tests: ['cbc', 'lft', 'kft'] }],
  ['test lipid profile test cbc', {}, { tests: ['lipid profile', 'cbc'] }],
  ['package lipid profile', {}, { packages: ['lipid profile'] }],
  ['ramesh patil', { allowPre: true }, { name: 'Ramesh Patil' }],
  ['other charges 50', {}, { otherCharges: 50 }],
];

let fail = 0;
for (const [t, o, exp, note] of cases) {
  const r = parseVoice(t, o);
  const fill: any = r.fill ?? {};
  const bad = Object.entries(exp ?? {}).filter(([k, v]) => JSON.stringify(fill[k]) !== JSON.stringify(v));
  if (bad.length) {
    fail++;
    console.log('FAIL', JSON.stringify(t), '\n   expected', JSON.stringify(exp), '\n   got     ', JSON.stringify(r.fill));
  } else {
    console.log('ok  ', JSON.stringify(t));
  }
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);