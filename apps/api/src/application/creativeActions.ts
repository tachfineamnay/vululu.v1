import { createHash } from 'node:crypto';
import {
  creativeAction,
  creativeSpec,
  creativeReview,
  type CreativeAction,
  type CreativeSpec
} from '@vululu/contracts';
import { HttpError } from '../errors';
import type { LlmProvider } from './structuredGeneration';
const invalid = (message: string): never => {
  throw new HttpError(422, 'creative_action_invalid', message);
};
export function editScene(source: CreativeSpec, a: CreativeAction) {
  const spec = structuredClone(source),
    i = spec.scenes.findIndex((s) => s.key === a.target.sceneKey),
    scene = spec.scenes[i];
  if (!scene) return invalid('Scène introuvable.');
  for (const change of a.changes) {
    switch (change.operation) {
      case 'cta': {
        const ls = scene.layers.filter((l) => l.type === 'text' && l.role === 'cta');
        if (ls.length !== 1 || ls[0].type !== 'text') return invalid('Sélectionnez un calque CTA unique.');
        ls[0].text = change.parameters.text;
        break;
      }
      case 'text': {
        const l = scene.layers[change.parameters.layer];
        if (l?.type !== 'text') return invalid('Calque texte requis.');
        l.text = change.parameters.text;
        break;
      }
      case 'color':
        scene.background = change.parameters.background;
        break;
      case 'replace':
      case 'crop': {
        const l = scene.layers[change.parameters.layer];
        if (l?.type !== 'image') return invalid('Calque image requis.');
        if (change.operation === 'replace') l.versionId = change.parameters.versionId;
        else {
          l.gravity = change.parameters.gravity;
          l.fit = change.parameters.fit;
        }
        break;
      }
      case 'transition':
        scene.transition = change.parameters.style;
        break;
      case 'duration':
        scene.seconds = change.parameters.seconds;
        break;
      case 'move': {
        if (change.parameters.position > spec.scenes.length) return invalid('Position hors limites.');
        spec.scenes.splice(spec.scenes.indexOf(scene), 1);
        spec.scenes.splice(change.parameters.position - 1, 0, scene);
        break;
      }
    }
  }
  return creativeSpec.parse(spec);
}
// Deliberately small local language, not free-form tool execution. Match the whole command or ask for clarification.
export const localTranslator: LlmProvider<{ prompt: string; keys: string[]; selected: string }> = {
  async generate({ prompt, keys, selected }) {
    const natural = prompt
      .trim()
      .match(
        /^(?:change|set|modifier?)\s+(?:the |le )?CTA\s+(?:of |de )?(?:la )?(?:scene|scène) (two|deux|\d+) (?:to|en|à) ("[^"]+") (?:and|et) (?:the |its |sa |la )?(?:color|couleur|fond) (?:to|en|à) (#[\da-f]{6})(?: without modifying the other scenes| sans modifier les autres scènes)?[.!]?$/i
      );
    const normalized = natural
      ? `scene ${natural[1]}: CTA ${natural[2]}; couleur ${natural[3]}`
      : prompt.trim();
    const m = normalized.match(/^(?:(?:sc[eè]ne)\s+(\d+|two|deux)\s*[:,]\s*)?(.+)$/i);
    if (!m) return invalid('Demande incomplète.');
    const target = m[1] ? keys[(/^two$|^deux$/i.test(m[1]) ? 2 : Number(m[1])) - 1] : selected;
    if (!target) return invalid('Numéro de scène inconnu.');
    const chunks = m[2].match(/(?:"[^"]*"|[^";])+/g) ?? [];
    const changes = chunks.map((part) => {
      const s = part.trim();
      let x;
      if ((x = /^(?:(?:change|set|modifier)\s+(?:the |le )?)?CTA\s*(?:to |en |[:=]\s*)?"([^"]+)"$/i.exec(s)))
        return { operation: 'cta', parameters: { text: x[1] } };
      if (
        (x =
          /^(?:(?:change|set|modifier)\s+(?:the |la )?)?(?:color|couleur|fond)\s*(?:to |en |[:=]\s*)?(#[\da-f]{6})$/i.exec(
            s
          ))
      )
        return { operation: 'color', parameters: { background: x[1] } };
      if ((x = /^(?:duration|durée)\s+([\d.]+)\s*s?$/i.exec(s)))
        return { operation: 'duration', parameters: { seconds: Number(x[1]) } };
      if ((x = /^transition\s+(dip|cut)$/i.exec(s)))
        return { operation: 'transition', parameters: { style: x[1] } };
      if ((x = /^(?:position|move to)\s+(\d+)$/i.exec(s)))
        return { operation: 'move', parameters: { position: Number(x[1]) } };
      if ((x = /^(?:text|texte) (?:layer|calque) (\d+) (?:to |en )?"([^"]+)"$/i.exec(s)))
        return { operation: 'text', parameters: { layer: Number(x[1]) - 1, text: x[2] } };
      if ((x = /^(?:replace|remplacer) (?:image|layer|calque) (\d+) (?:with|par) ([a-zA-Z0-9_-]+)$/i.exec(s)))
        return { operation: 'replace', parameters: { layer: Number(x[1]) - 1, versionId: x[2] } };
      if (
        (x =
          /^(?:crop|recadrer) (?:image|layer|calque) (\d+) (cover|contain) (centre|north|south|east|west)$/i.exec(
            s
          ))
      )
        return { operation: 'crop', parameters: { layer: Number(x[1]) - 1, fit: x[2], gravity: x[3] } };
      return invalid('Précisez la valeur : scène 2 : CTA "Réserver" ; couleur #225588.');
    });
    if (chunks.join(';') !== m[2]) return invalid('Syntaxe ambiguë.');
    return { sceneKey: target, changes };
  }
};
export function previewOf(spec: CreativeSpec, raw: unknown) {
  const action = creativeAction.parse(raw),
    next = editScene(spec, action),
    pick = (s: CreativeSpec) => s.scenes.find((x) => x.key === action.target.sceneKey)!;
  const digest = createHash('sha256')
    .update(JSON.stringify([action, pick(spec), pick(next)]))
    .digest('hex');
  return {
    action,
    surface: creativeReview,
    digest,
    before: pick(spec),
    after: pick(next),
    position: next.scenes.indexOf(pick(next)) + 1
  };
}
