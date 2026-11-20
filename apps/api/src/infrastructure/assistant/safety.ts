import { assistantCopy, assistantEdit, brainstormOutput } from '@vululu/contracts';

// Conservative rejection for promotional claims, contact details and injected control text.
// Not a fact checker: there is always a separate human fact-review step.
export function safeCopy(text: string) {
  const normalized = text.normalize('NFKD').replace(/\p{M}|\p{Cf}/gu, '').toLowerCase();
  return !/\p{Sc}|\p{N}|[<>@%]|https?:|www\.|\b(?:usd|eur|mad|dollars?|euros?|dirhams?|dhs?|gratuit\w*|free|prix|price|promotion\w*|discount\w*|remise\w*|testimonials?|temoign\w*|clients? satisf\w*|nos clients? (?:ont|recommand\w*|doubl\w*)|customers? (?:report|recommend|achiev\w*)|meilleur\w*|best in|leader du marche|certifi\w*|diplom\w*|qualified|accredit\w*|licen[cs]ed|qualifi\w*|guarante\w*|garanti\w*|gueri\w*|cur[ea]\w*|prouve\w*|proven|resultats?|results?|award\w*|recompens\w*|credentials?|ignore previous|system prompt)\b/u.test(normalized);
}
export function vettedCopy(value: unknown) {
  const r = assistantCopy.safeParse(value);
  if (!r.success) return null;
  const { campaign, strategy, posts } = r.data;
  if (![campaign, strategy, ...posts.flatMap((p) => [p.headline, p.caption, p.cta, ...p.storyboard.flatMap((s) => [s.shot, s.onScreen])])].every(safeCopy)) return null;
  return r.data;
}
/** Valide et nettoie un résultat de brainstorming : structure stricte + textes sans affirmation promotionnelle. */
export function vettedBrainstorm(value: unknown) {
  const r = brainstormOutput.safeParse(value);
  if (!r.success) return null;
  const { ack, questions, angles, decisions } = r.data;
  if (![ack, ...questions, ...angles.flatMap((a) => [a.title, a.reasoning, a.premise, ...a.assets]), ...decisions.map((d) => d.fact)].every(safeCopy)) return null;
  return r.data;
}
export function vettedChanges(value: unknown) {
  const r = assistantEdit.safeParse(value);
  if (!r.success || r.data.changes.some((c) => c.operation === 'replace' ||
    ((c.operation === 'cta' || c.operation === 'text') && !safeCopy(c.parameters.text)))) return null;
  return r.data.changes;
}

/** Remove common contact/credential formats from free text before crossing the provider boundary. */
export function minimizeModelData(value: unknown): unknown {
  if (typeof value === 'string') return value
    .replace(/-----BEGIN [^-\r\n]+-----[\s\S]*?-----END [^-\r\n]+-----/g, '[masqué]')
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu, '[lien masqué]')
    .replace(/[\w.+-]+@[\w.-]+\.[\w-]+/gu, '[coordonnée masquée]')
    .replace(/(?:\+?\d[ .()-]*){10,}/gu, '[coordonnée masquée]')
    .replace(/\b(?:bearer|api[_ -]?key|password|mot de passe)\s*[:=]?\s+[\w.+/=-]{8,}/giu, '[masqué]');
  if (Array.isArray(value)) return value.map(minimizeModelData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, minimizeModelData(item)]));
  return value;
}
