import { capability } from '../mediaGeneration/providers';
import { imageProviderCapabilities } from '../imageEditing/providers';
import { audioCapabilities } from '../audio/providers';
import { pythonToolsConfig } from '../python/client';

/**
 * P11-B/P11-D — disponibilité RÉELLE d'une capacité, lue depuis la configuration
 * serveur. Aucune sonde payante, aucun jeton : ces valeurs décrivent la configuration,
 * pas un appel fournisseur vérifié. Un fournisseur désactivé n'est jamais présenté
 * disponible.
 */
export type CapabilityAvailability = 'configured' | 'disabled' | 'missing_credential' | 'local';

export function availabilityOf(provider: string): { availability: CapabilityAvailability; reason: string | null } {
  if (provider === 'replicate@1') {
    const state = capability('image');
    return { availability: state.availability, reason: null };
  }
  if (provider === 'runway@1') {
    const state = capability('video');
    return { availability: state.availability, reason: null };
  }
  if (provider === 'gemini-image@1') {
    const state = imageProviderCapabilities()[0];
    return { availability: state.availability, reason: state.reason };
  }
  if (provider === 'gemini-audio@1') {
    const state = audioCapabilities().transcription;
    return { availability: state.availability, reason: state.reason };
  }
  if (provider === 'gemini-tts@1') {
    const state = audioCapabilities().tts;
    return { availability: state.availability, reason: state.reason };
  }
  if (provider === 'python-tools@1')
    return pythonToolsConfig()
      ? { availability: 'configured', reason: 'Service Python interne configuré ; disponibilité non sondée.' }
      : { availability: 'missing_credential', reason: 'PYTHON_TOOLS_URL ou PYTHON_TOOLS_TOKEN absent (24 caractères minimum).' };
  if (provider === 'postiz@1')
    return process.env.POSTIZ_PUBLISH_ENABLED === '1'
      ? { availability: 'configured', reason: 'Publication directe activée ; disponibilité non sondée.' }
      : { availability: 'disabled', reason: 'POSTIZ_PUBLISH_ENABLED n’est pas activé.' };
  if (provider === 'vertex-gemini@1')
    return process.env.ASSISTANT_VERTEX_ENABLED === '1' && (process.env.ASSISTANT_VERTEX_PROJECT || '').trim()
      ? { availability: 'configured', reason: 'Vertex configuré ; appel non sondé.' }
      : { availability: 'disabled', reason: 'ASSISTANT_VERTEX_ENABLED ou ASSISTANT_VERTEX_PROJECT absent.' };
  return { availability: 'local', reason: null };
}
