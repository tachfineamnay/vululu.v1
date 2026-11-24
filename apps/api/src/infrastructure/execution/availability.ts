import { capability } from '../mediaGeneration/providers';
import { imageProviderCapabilities } from '../imageEditing/providers';
import { audioCapabilities } from '../audio/providers';
import { pythonToolsConfig } from '../python/client';

/**
 * P11-B/P11-D — disponibilité RÉELLE d'une capacité, lue depuis la configuration
 * serveur. Aucune sonde payante, aucun jeton : ces valeurs décrivent la configuration,
 * pas un appel fournisseur vérifié. Un fournisseur désactivé n'est jamais présenté
 * disponible, et un fournisseur externe configuré sans sonde reste « non vérifié ».
 */
export type CapabilityAvailability = 'configured' | 'disabled' | 'missing_credential' | 'local';
export type CapabilityHealthState = 'healthy' | 'unverified' | 'unavailable';
export type AvailabilityInfo = {
  availability: CapabilityAvailability;
  configured: boolean;
  verified: boolean;
  healthState: CapabilityHealthState;
  reason: string | null;
};

function classify(availability: CapabilityAvailability, reason: string | null): AvailabilityInfo {
  if (availability === 'local') {
    return {
      availability,
      configured: true,
      verified: true,
      healthState: 'healthy',
      reason: reason ?? 'Capacité locale déterministe (sans appel externe).'
    };
  }
  if (availability === 'configured') {
    return {
      availability,
      configured: true,
      verified: false,
      healthState: 'unverified',
      reason: reason ?? 'Configuré côté serveur ; état de santé non vérifié (aucune sonde externe).'
    };
  }
  return {
    availability,
    configured: false,
    verified: false,
    healthState: 'unavailable',
    reason
  };
}

function mediaReason(kind: 'image' | 'video', availability: CapabilityAvailability): string {
  if (availability === 'configured') {
    return kind === 'image'
      ? 'Replicate configuré ; état de santé non vérifié (aucune sonde externe).'
      : 'Runway configuré ; état de santé non vérifié (aucune sonde externe).';
  }
  if (availability === 'missing_credential') {
    return kind === 'image'
      ? 'REPLICATE_API_TOKEN (ou MEDIA_IMAGE_CONFIGURED=1) absent.'
      : 'RUNWAYML_API_SECRET (ou MEDIA_VIDEO_CONFIGURED=1) absent.';
  }
  return kind === 'image'
    ? 'MEDIA_GENERATION_ENABLED ou MEDIA_IMAGE_ENABLED désactivé.'
    : 'MEDIA_GENERATION_ENABLED ou MEDIA_VIDEO_ENABLED désactivé.';
}

export function availabilityOf(provider: string): AvailabilityInfo {
  if (provider === 'replicate@1') {
    const state = capability('image');
    return classify(state.availability, mediaReason('image', state.availability));
  }
  if (provider === 'runway@1') {
    const state = capability('video');
    return classify(state.availability, mediaReason('video', state.availability));
  }
  if (provider === 'gemini-image@1') {
    const state = imageProviderCapabilities()[0];
    return classify(state.availability, state.reason);
  }
  if (provider === 'gemini-audio@1') {
    const state = audioCapabilities().transcription;
    return classify(state.availability, state.reason);
  }
  if (provider === 'gemini-tts@1') {
    const state = audioCapabilities().tts;
    return classify(state.availability, state.reason);
  }
  if (provider === 'python-tools@1')
    return pythonToolsConfig()
      ? classify('configured', 'Service Python interne configuré ; état de santé vérifié uniquement via /admin/jobs.')
      : classify('missing_credential', 'PYTHON_TOOLS_URL ou PYTHON_TOOLS_TOKEN absent (24 caractères minimum).');
  if (provider === 'postiz@1')
    return process.env.POSTIZ_PUBLISH_ENABLED === '1'
      ? classify('configured', 'Publication directe activée ; état de santé non vérifié (aucune sonde externe).')
      : classify('disabled', 'POSTIZ_PUBLISH_ENABLED n’est pas activé.');
  if (provider === 'vertex-gemini@1')
    return process.env.ASSISTANT_VERTEX_ENABLED === '1' && (process.env.ASSISTANT_VERTEX_PROJECT || '').trim()
      ? classify('configured', 'Vertex configuré ; état de santé non vérifié (aucune sonde externe).')
      : classify('disabled', 'ASSISTANT_VERTEX_ENABLED ou ASSISTANT_VERTEX_PROJECT absent.');
  return classify('local', null);
}
