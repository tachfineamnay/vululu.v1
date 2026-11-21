import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { audioLanguage, type AudioLanguage } from '@vululu/contracts';
import {
  AudioProviderRejected,
  AudioProviderUncertain,
  AudioProviderUnavailable,
  type AudioConfig,
  type TranscriptionInput,
  type TranscriptionOutput,
  type TranscriptionProvider,
  type TtsInput,
  type TtsOutput,
  type TtsProvider
} from './providers';

/**
 * P09B — adaptateurs audio Vertex Gemini (transcription et synthèse vocale).
 * Même chemin d'identifiants que l'édition d'image (ADC, aucun secret en clair).
 * Aucun clonage de voix : seules les voix du catalogue fournisseur sont acceptées.
 */

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const maxResponseBytes = 32 * 1024 * 1024;
const maxTranscribeSeconds = 180;
const maxSegments = 200;

const inlineData = z.object({
  mimeType: z.string().min(3).max(120).optional(),
  data: z.string().min(8).optional()
});
const envelopeSchema = z.object({
  responseId: z.string().max(200).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional(), inlineData: inlineData.optional() })).max(16) }).partial().optional()
  })).max(4).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).partial().optional()
});

function endpoint(config: AudioConfig, model: string) {
  const host = config.location === 'global' ? 'aiplatform.googleapis.com' : config.location + '-aiplatform.googleapis.com';
  return 'https://' + host + '/v1/projects/' + encodeURIComponent(config.project)
    + '/locations/' + encodeURIComponent(config.location)
    + '/publishers/google/models/' + encodeURIComponent(model) + ':generateContent';
}

/** Enveloppe PCM 16 bits mono/stéréo en WAV (le fournisseur TTS renvoie du L16 brut). */
export function pcm16ToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

abstract class GeminiAudioBase {
  protected abstract readonly kind: 'transcribe' | 'tts';
  protected abstract modelName(): string;
  constructor(
    protected readonly config: AudioConfig,
    protected readonly deps = { fetch: globalThis.fetch, token: () => auth.getAccessToken() }
  ) {}

  protected async generate(body: unknown, signal: AbortSignal): Promise<z.infer<typeof envelopeSchema>> {
    let token: string | null = null;
    try { token = await this.deps.token(); }
    catch { throw new AudioProviderUnavailable('audio_provider_missing_credential', 'Identifiants Google Cloud indisponibles.'); }
    if (!token) throw new AudioProviderUnavailable('audio_provider_missing_credential', 'Identifiants Google Cloud indisponibles.');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    let response: Response;
    try {
      response = await this.deps.fetch(endpoint(this.config, this.modelName()), {
        method: 'POST',
        redirect: 'error',
        signal: deadline,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new AudioProviderUncertain('audio_provider_timeout', 'Le fournisseur n’a pas répondu : l’issue est incertaine et ne sera pas rejouée automatiquement.');
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 4096);
      if (response.status === 401 || response.status === 403)
        throw new AudioProviderRejected('audio_provider_credentials', 'Le fournisseur refuse les identifiants ou l’accès au modèle.', 403);
      if (response.status === 429)
        throw new AudioProviderRejected('audio_provider_quota', 'Quota du fournisseur atteint.', 429);
      if (response.status >= 500)
        throw new AudioProviderUncertain('audio_provider_uncertain', 'Erreur serveur du fournisseur : issue incertaine, aucune relance automatique.');
      throw new AudioProviderRejected('audio_provider_rejected', /blocked|safety|policy/i.test(detail)
        ? 'Le fournisseur a refusé la demande pour des raisons de sécurité.'
        : 'Le fournisseur a refusé la demande (paramètres, modèle ou droits).');
    }
    const raw = await response.text().catch(() => '');
    if (!raw || raw.length > maxResponseBytes)
      throw new AudioProviderRejected('audio_provider_invalid_response', 'Réponse du fournisseur illisible.');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { throw new AudioProviderRejected('audio_provider_invalid_response', 'Réponse du fournisseur illisible.'); }
    const envelope = envelopeSchema.safeParse(parsed);
    if (!envelope.success) throw new AudioProviderRejected('audio_provider_invalid_response', 'Réponse du fournisseur incomplète.');
    if (envelope.data.promptFeedback?.blockReason)
      throw new AudioProviderRejected('audio_provider_blocked', 'Le fournisseur a bloqué la demande.');
    return envelope.data;
  }
}

export class GeminiTranscriptionProvider extends GeminiAudioBase implements TranscriptionProvider {
  readonly id = 'gemini-audio@1';
  protected readonly kind = 'transcribe' as const;
  protected modelName() { return this.config.transcribeModel; }
  get model() { return this.config.transcribeModel; }
  availability() { return 'configured' as const; }
  estimateCents() { return Math.min(this.config.transcribeCents, this.config.transcribeMaxCents); }

  async transcribe(input: TranscriptionInput, signal: AbortSignal): Promise<TranscriptionOutput> {
    if (input.bytes.length > 20 * 1024 * 1024)
      throw new AudioProviderRejected('audio_source_too_large', 'Audio source au-delà de la limite du fournisseur.');
    const instruction = [
      'Tu transcris fidèlement un audio de marque. Tu n’inventes aucun mot et tu ne résumes pas.',
      'Langue attendue : ' + input.language + '. Durée maximale : ' + Math.ceil(input.durationSeconds) + ' secondes.',
      'Réponds uniquement par un JSON valide de la forme :',
      '{"language":"<code langue>","segments":[{"start":<secondes>,"end":<secondes>,"text":"<texte>"}]}',
      'Horodatages estimés, segments courts (une phrase), texte sans balises ni retours à la ligne, 200 segments maximum.',
      'Si une portion est inaudible, écris exactement [inaudible].'
    ].join('\n');
    const envelope = await this.generate({
      contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType: input.mimeType, data: input.bytes.toString('base64') } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    }, signal);
    const candidate = envelope.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
    if (!text) {
      if (candidate?.finishReason && candidate.finishReason !== 'STOP')
        throw new AudioProviderRejected('audio_provider_blocked', 'Aucune transcription produite (refus ou contenu bloqué).');
      throw new AudioProviderRejected('audio_transcription_empty', 'Le fournisseur n’a renvoyé aucune transcription.');
    }
    const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(cleaned); }
    catch { throw new AudioProviderRejected('audio_transcription_invalid', 'Transcription du fournisseur illisible.'); }
    const shape = z.object({
      language: z.string().max(20).optional(),
      segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string().max(400) })).max(maxSegments)
    }).safeParse(parsed);
    if (!shape.success) throw new AudioProviderRejected('audio_transcription_invalid', 'Transcription du fournisseur incomplète.');
    const segments = shape.data.segments
      .map((segment) => ({
        start: Math.max(0, Math.min(maxTranscribeSeconds, Number(segment.start.toFixed(2)))),
        end: Math.max(0, Math.min(maxTranscribeSeconds, Number(segment.end.toFixed(2)))),
        text: segment.text.replace(/\s+/g, ' ').trim().slice(0, 200)
      }))
      .filter((segment) => segment.text.length > 0 && segment.end > segment.start + 0.05)
      .sort((left, right) => left.start - right.start);
    if (!segments.length) throw new AudioProviderRejected('audio_transcription_empty', 'Aucun segment exploitable renvoyé par le fournisseur.');
    const language = audioLanguage.safeParse(shape.data.language ?? input.language);
    return {
      segments,
      language: (language.success ? language.data : input.language) as AudioLanguage,
      provider: this.id,
      model: this.model,
      costCents: this.estimateCents(),
      providerRequestId: envelope.responseId ?? null
    };
  }
}

export class GeminiTtsProvider extends GeminiAudioBase implements TtsProvider {
  readonly id = 'gemini-tts@1';
  protected readonly kind = 'tts' as const;
  protected modelName() { return this.config.ttsModel; }
  get model() { return this.config.ttsModel; }
  get voices() { return this.config.voices; }
  availability() { return 'configured' as const; }
  estimateCents() { return Math.min(this.config.ttsCents, this.config.ttsMaxCents); }

  async synthesize(input: TtsInput, signal: AbortSignal): Promise<TtsOutput> {
    if (!this.voices.includes(input.voice))
      throw new AudioProviderRejected('audio_voice_unsupported', 'Voix absente du catalogue fournisseur.');
    const envelope = await this.generate({
      contents: [{ role: 'user', parts: [{ text: input.text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } }, languageCode: input.language }
      }
    }, signal);
    const audioPart = (envelope.candidates?.[0]?.content?.parts ?? []).find((part) => part.inlineData?.data);
    if (!audioPart?.inlineData?.data)
      throw new AudioProviderRejected('audio_tts_missing', 'Le fournisseur n’a renvoyé aucune piste audio.');
    let bytes: Buffer;
    try { bytes = Buffer.from(audioPart.inlineData.data, 'base64'); }
    catch { throw new AudioProviderRejected('audio_tts_invalid', 'Audio du fournisseur illisible.'); }
    if (!bytes.length || bytes.length > maxResponseBytes)
      throw new AudioProviderRejected('audio_tts_invalid', 'Taille audio du fournisseur invalide.');
    const mime = (audioPart.inlineData.mimeType ?? '').toLowerCase();
    let durationSeconds = 0;
    if (mime.startsWith('audio/wav')) {
      // Déjà encapsulé : la durée réelle sera sondée par le service (ffprobe).
    } else if (mime.startsWith('audio/l16') || mime.startsWith('audio/pcm')) {
      const rate = Number(/rate=(\d{4,6})/.exec(mime)?.[1] ?? 24000);
      const sampleRate = Number.isFinite(rate) && rate >= 8000 && rate <= 96000 ? rate : 24000;
      if (bytes.length % 2 !== 0) throw new AudioProviderRejected('audio_tts_invalid', 'Flux PCM du fournisseur tronqué.');
      bytes = pcm16ToWav(bytes, sampleRate, 1);
      durationSeconds = bytes.length > 44 ? (bytes.length - 44) / (sampleRate * 2) : 0;
    } else {
      throw new AudioProviderRejected('audio_tts_unsupported_format', 'Format audio du fournisseur non pris en charge : ' + (mime || 'inconnu') + '.');
    }
    return {
      bytes,
      mimeType: 'audio/wav',
      durationSeconds,
      provider: this.id,
      model: this.model,
      costCents: this.estimateCents(),
      providerRequestId: envelope.responseId ?? null
    };
  }
}
