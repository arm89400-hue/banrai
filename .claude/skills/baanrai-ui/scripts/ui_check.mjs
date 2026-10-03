// Screenshot pages and measure layout problems on the Baanrai site.
//
// Usage: from a scratch dir where `npm i puppeteer-core@23` was run, pass this
// file's full path (puppeteer-core is looked up from the current directory):
//
//   node ui_check.mjs [--base http://localhost:5180] [--lang th|en]
//                     [--widths 1400,985,390] [--out ./shots]
//                     [--center ".navbar__links a:nth-child(3)" ".hero__content h1"]
//                     [--token <jwt> --user '<json>']   # view as a signed-in account
//                     /home /rooms/1 /admin/log ...
//
// For every path x width it saves <out>/<path>-<width>.png and prints:
//   - JS errors, console errors and failed (>=400) requests
//   - whether the page scrolls sideways (horizontal overflow)
//   - overlapping children inside the navbar (things drawn on top of each other)
//   - labels that wrapped onto two lines inside buttons/links of the navbar
//   - with --center A B: the horizontal centers of A and B and their offset
// Animations are disabled (reduced motion) so screenshots aren't caught mid-transition.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// puppeteer-core is looked up in node_modules from the directory you run this
// from (walking up), not from this file's folder, so it can live in any
// scratch dir. Its ESM entry is read from its package.json.
async function loadPuppeteer() {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    const pkgDir = join(dir, 'node_modules', 'puppeteer-core');
    if (existsSync(join(pkgDir, 'package.json'))) {
      const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
      const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main;
      return (await import(pathToFileURL(join(pkgDir, entry)).href)).default;
    }
    if (dirname(dir) === dir) break;
  }
  console.error('puppeteer-core not found. In a scratch dir run: npm i puppeteer-core@23, then run this script from there.');
  process.exit(1);
}
const puppeteer = await loadPuppeteer();

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const base = opt('base', 'http://localhost:5180');
const lang = opt('lang', 'th');
const widths = opt('widths', '1400,985,390').split(',').map(Number);
const out = opt('out', './shots');
const token = opt('token', null);
const user = opt('user', null);
let center = null;
const ci = args.indexOf('--center');
if (ci !== -1) {
  center = [args[ci + 1], args[ci + 2]];
  args.splice(ci, 3);
}
// Accepts "/home" or "home". Git Bash on Windows rewrites a leading "/home"
// into "C:/Program Files/Git/home"; undo that.
const normalizePath = (p) => {
  const converted = p.match(/^[A-Za-z]:\/.*?\/Git(\/.*)$/);
  if (converted) return converted[1];
  return p.startsWith('/') ? p : '/' + p;
};
const paths = (args.length ? args : ['/home']).map(normalizePath);
mkdirSync(out, { recursive: true });

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
let problems = [];
page.on('pageerror', (e) => problems.push('JS error: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text().slice(0, 160)));
page.on('response', (r) => {
  const u = r.url();
  if (r.status() >= 400 && !u.includes('gsi/client')) problems.push(`${r.status()} ${u}`);
});

// Session + language are stored in localStorage; set them on the origin first.
await page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
await page.evaluate(
  (l, t, u) => {
    localStorage.setItem('lang', l);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (t) {
      localStorage.setItem('token', t);
      localStorage.setItem('user', u || '{}');
    }
  },
  lang,
  token,
  user
);

for (const path of paths) {
  for (const width of widths) {
    problems = [];
    await page.setViewport({ width, height: 900, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(base + path, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 700));
    const file = `${out}/${path.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'root'}-${width}.png`;
    await page.screenshot({ path: file });

    const report = await page.evaluate((centerSel) => {
      const res = {};
      res.landedOn = location.pathname + location.search;
      res.horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const kids = [...document.querySelectorAll('.navbar__inner > *')]
        .filter((e) => getComputedStyle(e).display !== 'none')
        .map((e) => ({ name: e.className.split(' ')[0], box: e.getBoundingClientRect() }));
      res.navbarOverlaps = [];
      kids.forEach((a, i) =>
        kids.slice(i + 1).forEach((b) => {
          if (a.box.right > b.box.left + 1 && b.box.right > a.box.left + 1) res.navbarOverlaps.push(`${a.name} x ${b.name}`);
        })
      );
      res.wrappedLabels = [...document.querySelectorAll('.navbar a, .navbar button')]
        .filter((e) => e.offsetParent && e.innerText.trim() && e.getClientRects().length && e.getBoundingClientRect().height > 2.2 * parseFloat(getComputedStyle(e).lineHeight || 20))
        .map((e) => e.innerText.trim());
      if (centerSel) {
        const mid = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = document.createRange();
          r.selectNodeContents(el);
          const b = r.getBoundingClientRect();
          // Hidden at this width (e.g. navbar links inside the phone menu).
          if (b.width === 0 && b.height === 0) return null;
          return +(b.left + b.width / 2).toFixed(1);
        };
        const a = mid(centerSel[0]);
        const b = mid(centerSel[1]);
        res.center = { [centerSel[0]]: a, [centerSel[1]]: b, offsetPx: a != null && b != null ? +(a - b).toFixed(1) : null };
      }
      return res;
    }, center);

    console.log(`\n${path} @ ${width}px -> ${file}`);
    console.log(JSON.stringify(report));
    console.log(problems.length ? 'problems: ' + problems.join(' | ') : 'problems: none');
  }
}
await browser.close();
