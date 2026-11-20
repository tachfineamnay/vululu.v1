// T05 — accessibility / FR-EN / responsive probe (axe-core on key pages, no product code touched).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:3100';
const axeSource = fs.readFileSync(process.env.AXE_PATH || require.resolve('axe-core'), 'utf8');
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

// login
await page.goto(BASE + '/login');
await page.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL);
await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.DEMO_PASSWORD);
await page.getByRole('button', { name: 'Entrer dans le studio' }).click();
await page.waitForURL(/\/$/, { timeout: 30000 });
out('R1', 'login reaches the studio home', true, page.url());

async function axe(path, name) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }));
  const serious = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  out(name, `axe WCAG 2 A/AA: no serious or critical violations on ${path}`, serious.length === 0, serious.map((v) => `${v.id}(${v.nodes.length})`).join(', ') || `${res.violations.length} minor`);
  return res;
}

for (const [path, name] of [['/', 'R2'], ['/projects/new', 'R3'], ['/calendar', 'R4'], ['/account', 'R5'], ['/assets', 'R6']]) await axe(path, name);

// responsive: no horizontal overflow at mobile/tablet widths
for (const width of [390, 768, 1024]) {
  await page.setViewportSize({ width, height: 900 });
  for (const path of ['/', '/projects/new', '/calendar']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    out('R7', `no horizontal overflow at ${width}px on ${path}`, overflow <= 1, `${overflow}px`);
  }
}

// touch target size (WCAG 2.5.5 AAA is 44px; project claims 44 in tests)
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
const small = await page.evaluate(() => Array.from(document.querySelectorAll('button, a[href], select, input'))
  .map((el) => ({ tag: el.tagName, text: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 24), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width, vis: el.offsetParent !== null }))
  .filter((e) => e.vis && e.h > 0 && e.h < 40));
out('R8', 'interactive controls on mobile home are at least 40px tall', small.length === 0, small.slice(0, 4).map((e) => `${e.tag}(${Math.round(e.h)}px)`).join(' '));

// language switching FR -> EN
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
const frHtml = await page.getAttribute('html', 'lang');
const langSelect = page.locator('select').first();
const optionCount = await langSelect.locator('option').count();
if (optionCount) {
  await langSelect.selectOption({ index: 1 });
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'networkidle' });
  const enHtml = await page.getAttribute('html', 'lang');
  const bodyText = await page.locator('body').innerText();
  const englishSignals = (bodyText.match(/\b(Project|Projects|Calendar|Account|Create|Sign out|Studio|Format|Platform)\b/g) ?? []).length;
  const frenchSignals = (bodyText.match(/\b(Projet|Projets|Calendrier|Compte|Céer|Créer|Déconnexion)\b/g) ?? []).length;
  out('R9', 'switching to EN updates the document language and the interface copy', enHtml === 'en' && englishSignals >= 2 && frenchSignals === 0, `fr=${frHtml} en=${enHtml} enTokens=${englishSignals} frTokens=${frenchSignals}`);
  await page.evaluate(() => { document.cookie = 'vululu_lang=fr; Path=/'; });
} else out('R9', 'language selector present', false, 'no select on home');

out('R10', 'no uncaught client-side errors during the a11y sweep', consoleErrors.filter((e) => !/favicon|404 \(Not Found\).*_next/.test(e)).length === 0, consoleErrors.slice(0, 3).join(' | ').slice(0, 300));

await browser.close();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
