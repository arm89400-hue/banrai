// Checks that every Thai text key has an English one and vice versa.
// Run from anywhere: node .claude/skills/baanrai-ui/scripts/i18n_parity.mjs
const { STRINGS } = await import(new URL('../../../../frontend/src/i18n/strings.js', import.meta.url));
const th = Object.keys(STRINGS.th);
const en = Object.keys(STRINGS.en);
const onlyTh = th.filter((k) => !en.includes(k));
const onlyEn = en.filter((k) => !th.includes(k));
console.log(`th ${th.length} keys, en ${en.length} keys`);
if (onlyTh.length) console.log('missing in en:', onlyTh.join(', '));
if (onlyEn.length) console.log('missing in th:', onlyEn.join(', '));
process.exit(onlyTh.length || onlyEn.length ? 1 : 0);
