// T05 — item 13 evidence: FR/EN completeness and touch-target sizing, with precise element inventory.
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:3100';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(BASE + '/login');
await p.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL);
await p.getByLabel('Mot de passe', { exact: true }).fill(process.env.DEMO_PASSWORD);
await p.getByRole('button', { name: 'Entrer dans le studio' }).click();
await p.waitForURL(/\/$/);
await p.evaluate(() => { document.cookie = 'vululu_lang=en; Path=/'; });

const FR = /\b(Projets?|Calendrier|Compte|Créer|Création|Enregistrer|Annuler|Contexte|Résultat|Suivi|Déconnexion|Retour|Nouveau|Ajouter|Aucun|Aucune|Modifier|Valider|Aperçu|Durée|Scène|Qualité|Livraison|Droits|Format|Ouvrir|Fermer|Supprimer|Rechercher|Choisir|Prêt|En cours|Brouillon|Versions?)\b/;
let totalLeaks = 0;
for (const path of ['/', '/projects/new', '/calendar', '/account', '/assets', '/support', '/results', '/campaigns', '/creations', '/catalog', '/contexts']) {
  await p.goto(BASE + path, { waitUntil: 'networkidle' });
  const lang = await p.getAttribute('html', 'lang');
  const leaks = await p.evaluate((src) => {
    const re = new RegExp(src);
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.textContent.trim();
      if (t && re.test(t) && !/^[\d\s.,%-]+$/.test(t)) out.push(t.slice(0, 60) + ' <' + n.parentElement.tagName.toLowerCase() + (n.parentElement.dataset.testid ? '#' + n.parentElement.dataset.testid : '') + '>');
    }
    return out;
  }, FR.source);
  totalLeaks += leaks.length;
  console.log(`I18N ${path} html_lang=${lang} french_strings=${leaks.length} :: ${leaks.slice(0, 5).join(' | ')}`);
}
console.log(`I18N TOTAL french_strings_in_EN_mode=${totalLeaks}`);

await p.evaluate(() => { document.cookie = 'vululu_lang=fr; Path=/'; });
await p.setViewportSize({ width: 390, height: 844 });
for (const path of ['/', '/projects/new', '/calendar', '/account', '/assets']) {
  await p.goto(BASE + path, { waitUntil: 'networkidle' });
  const small = await p.evaluate(() => Array.from(document.querySelectorAll('button, a[href], select, input[type=checkbox], [role="button"]'))
    .map((el) => { const r = el.getBoundingClientRect(); return { tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 32), h: Math.round(r.height), w: Math.round(r.width), vis: !!el.offsetParent }; })
    .filter((e) => e.vis && e.h > 0 && e.h < 44));
  const aa = small.filter((e) => e.h < 24 || e.w < 24);
  console.log(`TAP ${path} under_44px=${small.length} under_24px_WCAG258=${aa.length} :: ${aa.slice(0, 6).map((e) => `${e.tag}(${e.h}x${e.w}px,'${e.text}')`).join(' ')}`);
}
await b.close();
