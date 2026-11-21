import { audioLanguage, type AudioLanguage } from '@vululu/contracts';

/**
 * P09B — fournisseurs audio réels, derrière des drapeaux explicites.
 * L'agent ne choisit ni l'URL, ni le modèle, ni le coût : le service valide, le broker
 * réserve, le worker exécute et la sortie est vérifiée avant stockage. Aucun fournisseur
 * n'est activé par défaut ; un appel réel reste NON VÉRIFIÉ.
 */

export type TranscriptionInput = { bytes: Buffer; mimeType: 'audio/wav'; language: AudioLanguage; durationSeconds: number };
export type TranscriptionOutput = {
  segments: { start: number; end: number; text: string }[];
  language: AudioLanguage;
  provider: string;
  model: string;
  costCents: number;
  providerRequestId: string | null;
};
export type TtsInput = { text: string; language: AudioLanguage; voice: string };
export type TtsOutput = {
  bytes: Buffer;
  mimeType: 'audio/wav';
  durationSeconds: number;
  provider: string;
  model: string;
  costCents: number;
  providerRequestId: string | null;
};

/** Rejet déterministe : paramètres, droits, modération, quota. Aucun débit attendu. */
export class AudioProviderRejected extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); this.name = 'AudioProviderRejected'; }
}
/** Fournisseur non configuré : échec déterministe, aucune requête dispatchée. */
export class AudioProviderUnavailable extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AudioProviderUnavailable'; }
}
/** Réponse ambiguë après envoi : jamais rejouée automatiquement. */
export class AudioProviderUncertain extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'AudioProviderUncertain'; }
}

export interface TranscriptionProvider {
  readonly id: string;
  readonly model: string;
  availability(): 'configured';
  estimateCents(): number;
  transcribe(input: TranscriptionInput, signal: AbortSignal): Promise<TranscriptionOutput>;
}
export interface TtsProvider {
  readonly id: string;
  readonly model: string;
  readonly voices: readonly string[];
  availability(): 'configured';
  estimateCents(): number;
  synthesize(input: TtsInput, signal: AbortSignal): Promise<TtsOutput>;
}

export const audioLanguages: readonly AudioLanguage[] = audioLanguage.options;
/** Voix du catalogue fournisseur (liste blanche) ; aucun clonage de voix n'est proposé. */
export const defaultTtsVoices: readonly string[] = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede'];

export type AudioConfig = {
  project: string;
  location: string;
  transcribeModel: string;
  ttsModel: string;
  transcribeMaxCents: number;
  ttsMaxCents: number;
  transcribeCents: number;
  ttsCents: number;
  voices: readonly string[];
};
export type AudioAvailability =
  | { availability: 'disabled' | 'missing_credential'; reason: string }
  | { availability: 'configured'; config: AudioConfig };

const locationPattern = /^(global|[a-z]+-[a-z]+[0-9]+)$/;
const modelPattern = /^[a-z0-9][a-z0-9.-]{2,80}$/;
const integer = (name: string, fallback: number, min: number, max: number) => {
  const raw = Number(process.env[name] || String(fallback));
  return Number.isInteger(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
};
const toolCents = { transcribe: 8, tts: 12 } as const;

function commonConfig(): { project: string; location: string } | null {
  const project = (process.env.AUDIO_VERTEX_PROJECT || process.env.ASSISTANT_VERTEX_PROJECT || '').trim();
  const location = (process.env.AUDIO_VERTEX_LOCATION || process.env.ASSISTANT_VERTEX_LOCATION || 'global').trim();
  if (!project) return null;
  if (!locationPattern.test(location)) return null;
  return { project, location };
}

function voicesFromEnv(): readonly string[] {
  const raw = (process.env.AUDIO_TTS_VOICES || '').trim();
  if (!raw) return defaultTtsVoices;
  const values = raw.split(',').map((value) => value.trim()).filter((value) => /^[A-Za-z][A-Za-z0-9-]{2,40}$/.test(value));
  return values.length ? values : defaultTtsVoices;
}

function availability(kind: 'transcribe' | 'tts'): AudioAvailability {
  const enabled = kind === 'transcribe' ? process.env.AUDIO_TRANSCRIBE_ENABLED : process.env.AUDIO_TTS_ENABLED;
  if (enabled !== '1')
    return { availability: 'disabled', reason: (kind === 'transcribe' ? 'AUDIO_TRANSCRIBE_ENABLED' : 'AUDIO_TTS_ENABLED') + ' n’est pas activé sur ce serveur.' };
  const common = commonConfig();
  if (!common) return { availability: 'missing_credential', reason: 'AUDIO_VERTEX_PROJECT (ou ASSISTANT_VERTEX_PROJECT) est absent ou invalide.' };
  const model = kind === 'transcribe'
    ? (process.env.AUDIO_TRANSCRIBE_MODEL || 'gemini-2.5-flash').trim()
    : (process.env.AUDIO_TTS_MODEL || 'gemini-2.5-flash-preview-tts').trim();
  if (!modelPattern.test(model)) return { availability: 'missing_credential', reason: 'Modèle audio invalide.' };
  const maxCents = integer(kind === 'transcribe' ? 'AUDIO_TRANSCRIBE_MAX_CENTS' : 'AUDIO_TTS_MAX_CENTS',
    kind === 'transcribe' ? 8 : 12, 1, 100);
  const cents = integer(kind === 'transcribe' ? 'AUDIO_TRANSCRIBE_COST_CENTS' : 'AUDIO_TTS_COST_CENTS',
    kind === 'transcribe' ? 4 : 6, 0, 100);
  if (cents > Math.min(maxCents, toolCents[kind]))
    return { availability: 'missing_credential', reason: 'Coût estimé supérieur au plafond de l’outil (' + toolCents[kind] + ' ¢).' };
  return {
    availability: 'configured',
    config: {
      ...common,
      transcribeModel: (process.env.AUDIO_TRANSCRIBE_MODEL || 'gemini-2.5-flash').trim(),
      ttsModel: (process.env.AUDIO_TTS_MODEL || 'gemini-2.5-flash-preview-tts').trim(),
      transcribeMaxCents: integer('AUDIO_TRANSCRIBE_MAX_CENTS', 8, 1, 100),
      ttsMaxCents: integer('AUDIO_TTS_MAX_CENTS', 12, 1, 100),
      transcribeCents: integer('AUDIO_TRANSCRIBE_COST_CENTS', 4, 0, 100),
      ttsCents: integer('AUDIO_TTS_COST_CENTS', 6, 0, 100),
      voices: voicesFromEnv()
    }
  };
}

export function audioConfiguration() {
  return { transcribe: availability('transcribe'), tts: availability('tts') };
}

/** Capacités réelles, sans sonde payante : la disponibilité décrit la configuration. */
export function audioCapabilities() {
  const configuration = audioConfiguration();
  const describe = (kind: 'transcribe' | 'tts') => {
    const state = configuration[kind];
    const configured = 'config' in state ? state.config : null;
    return {
      provider: kind === 'transcribe' ? 'gemini-audio@1' : 'gemini-tts@1',
      model: kind === 'transcribe'
        ? (configured?.transcribeModel ?? (process.env.AUDIO_TRANSCRIBE_MODEL || 'gemini-2.5-flash'))
        : (configured?.ttsModel ?? (process.env.AUDIO_TTS_MODEL || 'gemini-2.5-flash-preview-tts')),
      availability: 'config' in state ? 'configured' : state.availability,
      reason: 'config' in state ? null : state.reason,
      languages: [...audioLanguages],
      maxCents: kind === 'transcribe' ? (configured?.transcribeMaxCents ?? 8) : (configured?.ttsMaxCents ?? 12),
      estimatedCents: kind === 'transcribe' ? (configured?.transcribeCents ?? 4) : (configured?.ttsCents ?? 6),
      providerCallVerified: false
    };
  };
  return { transcription: describe('transcribe'), tts: { ...describe('tts'), voices: [...(('config' in configuration.tts ? configuration.tts.config.voices : voicesFromEnv()))] } };
}

export function selectTranscriptionProvider(): { code: string; message: string } | { config: AudioConfig } {
  const state = audioConfiguration().transcribe;
  return 'config' in state
    ? { config: state.config }
    : { code: state.availability === 'disabled' ? 'audio_transcription_disabled' : 'audio_provider_missing_credential', message: state.reason };
}

export function selectTtsProvider(): { code: string; message: string } | { config: AudioConfig } {
  const state = audioConfiguration().tts;
  return 'config' in state
    ? { config: state.config }
    : { code: state.availability === 'disabled' ? 'audio_tts_disabled' : 'audio_provider_missing_credential', message: state.reason };
}
