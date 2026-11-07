/**
 * Vérifie les sources du kit ; aucune dépendance tierce.
 * Usage depuis la racine : node docs/design-system/scripts/check.mjs
 * Ce contrôle n'exécute pas le frontend, ne parse pas toute la grammaire CSS
 * et ne certifie pas l'accessibilité d'un écran rendu.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

export function validateKit(readText) {
  const errors = [];
  const checks = [];
  const required = [
    "DESIGN.md", "apps/web/AGENTS.md", ".cursor/rules/vululu-design.mdc",
    ".github/instructions/vululu-ui.instructions.md",
    "docs/design-system/README.md", "docs/design-system/BRAND.md",
    "docs/design-system/UX.md", "docs/design-system/COMPONENTS.md",
    "docs/design-system/SCREENS.md", "docs/design-system/CONTENT.md",
    "docs/design-system/ACCESSIBILITY.md", "docs/design-system/IMPLEMENTATION.md",
    "docs/design-system/IDE_PROMPT.md", "docs/design-system/DECISIONS.md",
    "docs/design-system/tokens.json", "docs/design-system/tokens.css",
    "docs/design-system/reference/README.md", "docs/design-system/reference/studio-layout.svg",
    "docs/design-system/scripts/check.mjs", "docs/design-system/HANDOFF.md"
  ];
  const contents = {};
  for (const path of required) {
    try { contents[path] = readText(path); }
    catch { errors.push("Fichier manquant : " + path); }
  }
  checks.push("required-files");
  const tokenPath = "docs/design-system/tokens.json";
  let data;
  try { data = JSON.parse(contents[tokenPath]); }
  catch { errors.push("JSON de tokens invalide"); return { errors, checks, tokenCount: 0, contrasts: [] }; }
  if (data.format !== "vululu-flat-tokens-v1" || data.version !== "1.0.0") errors.push("Métadonnées de tokens inattendues");
  const tokens = data.tokens;
  if (!tokens || typeof tokens !== "object") return { errors: [...errors, "Tokens absents"], checks, tokenCount: 0, contrasts: [] };
  const css = contents["docs/design-system/tokens.css"] || "";
  const declarations = new Map();
  for (const match of css.matchAll(/(--v-[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (declarations.has(match[1])) errors.push("Variable CSS dupliquée : " + match[1]);
    declarations.set(match[1], match[2].trim());
  }
  const expected = new Set();
  for (const [key, token] of Object.entries(tokens)) {
    const name = "--v-" + key.replaceAll(".", "-");
    expected.add(name);
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(key)) errors.push("Clé invalide : " + key);
    if (!token || typeof token.value !== "string" || /[;{}]/.test(token.value)) errors.push("Valeur CSS invalide : " + key);
    if (declarations.get(name) !== token.value) errors.push("Dérive JSON/CSS : " + key);
    if (token.type === "color" && !/^#[0-9a-f]{6}$/i.test(token.value)) errors.push("Couleur invalide : " + key);
  }
  for (const name of declarations.keys()) if (!expected.has(name)) errors.push("Variable hors tokens : " + name);
  for (const match of css.matchAll(/var\((--v-[a-z0-9-]+)/g)) if (!expected.has(match[1])) errors.push("Référence CSS inconnue : " + match[1]);
  if (!css.includes('[data-vululu-theme="blue"]') || /:root\s*\{/.test(css)) errors.push("Scope CSS absent ou global");
  if (/linear-gradient|radial-gradient|backdrop-filter|@import/i.test(css)) errors.push("Effet décoratif ou import réseau interdit");
  checks.push("json-css-sync", "css-reference-scope");
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const contrasts = [];
  for (const pair of data.contrastPairs || []) {
    const foreground = tokens[pair.foreground]?.value;
    const background = tokens[pair.background]?.value;
    if (!/^#[0-9a-f]{6}$/i.test(foreground || "") || !/^#[0-9a-f]{6}$/i.test(background || "")) {
      errors.push("Couple de contraste inconnu");
      continue;
    }
    const a = luminance(foreground), b = luminance(background);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    contrasts.push({ foreground: pair.foreground, background: pair.background, ratio: Number(ratio.toFixed(2)), minimum: pair.minimum });
    if (ratio < pair.minimum) errors.push("Contraste insuffisant : " + pair.foreground + " / " + pair.background);
  }
  if (contrasts.length !== 13) errors.push("Les 13 couples de référence doivent être contrôlés");
  checks.push("contrast-pairs");
  function resolveRelative(source, target) {
    const segments = source.split("/").slice(0, -1);
    for (const segment of target.split("/")) {
      if (segment === "..") segments.pop();
      else if (segment && segment !== ".") segments.push(segment);
    }
    return segments.join("/");
  }
  for (const [path, body] of Object.entries(contents)) {
    if (!path.endsWith(".md")) continue;
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      try { readText(resolveRelative(path, target)); }
      catch { errors.push("Lien cassé dans " + path + " : " + target); }
    }
  }
  checks.push("internal-links");
  const cursor = contents[".cursor/rules/vululu-design.mdc"] || "";
  const copilot = contents[".github/instructions/vululu-ui.instructions.md"] || "";
  if (!cursor.startsWith("---\n") || !cursor.includes('globs: "apps/web/**,docs/design-system/**,DESIGN.md"') || !cursor.includes("alwaysApply: false")) errors.push("Règle Cursor invalide");
  if (!copilot.startsWith('---\napplyTo: "apps/web/**"\n---')) errors.push("Règle Copilot invalide");
  if (!(contents["apps/web/AGENTS.md"] || "").includes("../../DESIGN.md")) errors.push("Règle AGENTS sans point d'entrée");
  checks.push("ide-entry-points");
  return { errors, checks, tokenCount: Object.keys(tokens).length, contrasts };
}

const directlyExecuted = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directlyExecuted) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const result = validateKit((path) => readFileSync(resolve(root, path), 'utf8'));
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
  else console.log('VULULU_DESIGN_KIT_STATIC_PASS');
}
