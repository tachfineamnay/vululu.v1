import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import { imageAspectRatio, imageEditOperation, type ImageEditOperation, type ImageEditRequest } from '@vululu/contracts';

/**
 * Fournisseurs d'édition d'image réels. L'agent ne choisit jamais l'URL, le modèle ni le coût :
 * le service valide, le broker réserve, le worker exécute et le résultat est vérifié avant stockage.
 */
export type ImageEditInput = {
  request: ImageEditRequest;
  source?: { bytes: Buffer; mimeType: string };
  mask?: { bytes: Buffer; mimeType: string };
};
export type ImageProviderResult = {
  bytes: Buffer; mimeType: 'image/png' | 'image/jpeg'; provider: string; model: string;
  costCents: number; providerRequestId: string | null; warnings: string[];
};
export interface ImageEditProvider {
  readonly id: string;
  readonly model: string;
  readonly operations: readonly ImageEditOperation[];
  readonly requiresSource: boolean;
  availability(): 'disabled' | 'missing_credential' | 'configured';
  estimateCents(): number;
  run(input: ImageEditInput, signal: AbortSignal): Promise<ImageProviderResult>;
}
/** Rejet déterministe : paramètres, droits, modération, quota. Aucun débit attendu, aucune relance. */
export class ImageProviderRejected extends Error {
  constructor(readonly code: string, message: string, readonly status = 422) { super(message); this.name = 'ImageProviderRejected'; }
}
/** Fournisseur non configuré : échec déterministe, aucune requête dispatchée. */
export class ImageProviderUnavailable extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImageProviderUnavailable'; }
}
/** Réponse ambiguë après envoi : jamais rejouée automatiquement, traitée comme issue incertaine. */
export class ImageProviderUncertain extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ImageProviderUncertain'; }
}

export type GeminiImageConfig = { project: string; location: string; model: string; maxCents: number; estimatedCents: number };
const modelPattern = /^[a-z0-9][a-z0-9.-]{2,80}$/;
const locationPattern = /^(global|[a-z]+-[a-z]+[0-9]+)$/;
const toolCapCents = 8;
const integer = (name: string, fallback: number, min: number, max: number) => {
  const raw = Number(process.env[name] || String(fallback));
  return Number.isInteger(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
};

export function geminiImageConfiguration(): { config: GeminiImageConfig } | { availability: 'disabled' | 'missing_credential'; reason: string } {
  if (process.env.IMAGE_EDITING_ENABLED !== '1') return { availability: 'disabled', reason: 'IMAGE_EDITING_ENABLED n’est pas activé sur ce serveur.' };
  const project = (process.env.GEMINI_IMAGE_PROJECT || process.env.ASSISTANT_VERTEX_PROJECT || '').trim();
  const location = (process.env.GEMINI_IMAGE_LOCATION || process.env.ASSISTANT_VERTEX_LOCATION || 'global').trim();
  const model = (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim();
  const maxCents = integer('GEMINI_IMAGE_MAX_CENTS', 8, 1, 100);
  const estimatedCents = integer('GEMINI_IMAGE_COST_CENTS', 4, 0, 100);
  if (!project) return { availability: 'missing_credential', reason: 'GEMINI_IMAGE_PROJECT (ou ASSISTANT_VERTEX_PROJECT) est absent.' };
  if (!modelPattern.test(model) || !locationPattern.test(location)) return { availability: 'missing_credential', reason: 'Modèle ou localisation Gemini image invalide.' };
  if (estimatedCents > Math.min(maxCents, toolCapCents))
    return { availability: 'missing_credential', reason: 'Coût estimé supérieur au plafond de l’outil média.image.edit@1 (' + toolCapCents + ' ¢).' };
  return { config: { project, location, model, maxCents, estimatedCents } };
}

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const responseSchema = z.object({
  responseId: z.string().max(200).optional(),
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({
      text: z.string().optional(),
      inlineData: z.object({ mimeType: z.string().min(3).max(80), data: z.string().min(8) }).partial().optional()
    })) }).partial().optional()
  })).max(4).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).partial().optional()
});
const maxOutputBytes = 12 * 1024 * 1024;

function operationInstruction(request: ImageEditRequest): string {
  const lines = [
    'Tu es l’outil d’édition d’image de Vululu. Tu ne discutes pas : tu produis une image.',
    'Respecte strictement l’image source fournie et n’invente ni marque, ni logo, ni texte, ni personne.',
    'Ne rends jamais de texte illisible ; si un texte est demandé, reste minimal et lisible.'
  ];
  const byOperation: Record<ImageEditOperation, string> = {
    generate: 'Crée une nouvelle image à partir de la description fournie.',
    edit: 'Modifie l’image source uniquement selon la demande, sans changer le reste.',
    'replace-background': 'Remplace uniquement l’arrière-plan ; conserve le sujet, ses contours et son éclairage.',
    'remove-object': 'Supprime l’élément décrit et reconstruis naturellement la zone retirée.',
    variation: 'Propose une variation créative cohérente avec l’image source, sans la dénaturer.',
    enhance: 'Améliore la qualité visuelle (netteté, exposition, couleurs) sans changer le contenu ni le cadrage.'
  };
  lines.push(byOperation[request.operation]);
  if (request.preserveSubject) lines.push('Préserve exactement le sujet principal : identité, pose, proportions et détails.');
  if (request.maskVersionId) lines.push('Le second fichier image est un masque : ne modifie que la zone blanche du masque, préserve le noir.');
  lines.push('Format demandé : ' + request.aspectRatio + '.');
  lines.push('Description du client : ' + request.prompt);
  return lines.join('\n');
}

export class GeminiImageProvider implements ImageEditProvider {
  readonly id = 'gemini-image@1';
  readonly operations = [...imageEditOperation.options];
  readonly requiresSource = false;
  constructor(private readonly config: GeminiImageConfig, private readonly deps = {
    fetch: globalThis.fetch,
    token: () => auth.getAccessToken()
  }) {}
  get model() { return this.config.model; }
  availability() { return 'configured' as const; }
  estimateCents() { return Math.min(this.config.estimatedCents, this.config.maxCents); }

  async run(input: ImageEditInput, signal: AbortSignal): Promise<ImageProviderResult> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    const instruction = operationInstruction(input.request);
    const imageParts: Array<Record<string, unknown>> = [];
    if (input.source) imageParts.push({ inlineData: { mimeType: input.source.mimeType, data: input.source.bytes.toString('base64') } });
    if (input.mask) imageParts.push({ inlineData: { mimeType: input.mask.mimeType, data: input.mask.bytes.toString('base64') } });
    const withRatio = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: instruction }, ...imageParts] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: input.request.aspectRatio } }
    });
    const withoutRatio = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: instruction }, ...imageParts] }],
      generationConfig: { responseModalities: ['IMAGE'] }
    });
    let token: string | null = null;
    try { token = await this.deps.token(); }
    catch { throw new ImageProviderUnavailable('image_provider_missing_credential', 'Identifiants Google Cloud indisponibles.'); }
    if (!token) throw new ImageProviderUnavailable('image_provider_missing_credential', 'Identifiants Google Cloud indisponibles.');
    const host = this.config.location === 'global' ? 'aiplatform.googleapis.com' : this.config.location + '-aiplatform.googleapis.com';
    const url = 'https://' + host + '/v1/projects/' + encodeURIComponent(this.config.project) + '/locations/' + encodeURIComponent(this.config.location)
      + '/publishers/google/models/' + encodeURIComponent(this.config.model) + ':generateContent';
    const send = async (body: string) => {
      try {
        return await this.deps.fetch(url, {
          method: 'POST', redirect: 'error', signal: deadline,
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ImageProviderUncertain('image_provider_timeout', 'Le fournisseur n’a pas répondu : l’issue est incertaine et ne sera pas rejouée automatiquement.');
      }
    };
    let response = await send(withRatio);
    let usedRatioConfig = true;
    if (!response.ok && response.status === 400) {
      const detail = (await response.text().catch(() => '')).slice(0, 4096);
      if (/imageConfig|aspectRatio|aspect_ratio|Unknown name/i.test(detail)) {
        usedRatioConfig = false;
        response = await send(withoutRatio);
      }
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 4096);
      if (response.status === 401 || response.status === 403)
        throw new ImageProviderRejected('image_provider_credentials', 'Le fournisseur refuse les identifiants ou l’accès au modèle.', 403);
      if (response.status === 429)
        throw new ImageProviderRejected('image_provider_quota', 'Quota du fournisseur atteint.', 429);
      if (response.status >= 500)
        throw new ImageProviderUncertain('image_provider_uncertain', 'Erreur serveur du fournisseur : issue incertaine, aucune relance automatique.');
      throw new ImageProviderRejected('image_provider_rejected', /blocked|safety|policy/i.test(detail)
        ? 'Le fournisseur a refusé la demande pour des raisons de sécurité.'
        : 'Le fournisseur a refusé la demande (paramètres, modèle ou droits).', 422);
    }
    const raw = await response.text().catch(() => '');
    if (!raw || raw.length > 32 * 1024 * 1024) throw new ImageProviderRejected('image_provider_invalid_response', 'Réponse du fournisseur illisible.');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ImageProviderRejected('image_provider_invalid_response', 'Réponse du fournisseur illisible.'); }
    const envelope = responseSchema.safeParse(parsed);
    if (!envelope.success) throw new ImageProviderRejected('image_provider_invalid_response', 'Réponse du fournisseur incomplète.');
    if (envelope.data.promptFeedback?.blockReason) throw new ImageProviderRejected('image_provider_blocked', 'Le fournisseur a bloqué la demande.');
    const candidate = envelope.data.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'));
    if (!imagePart?.inlineData?.data) {
      if (candidate?.finishReason && candidate.finishReason !== 'STOP')
        throw new ImageProviderRejected('image_provider_blocked', 'Aucune image produite (refus ou contenu bloqué).');
      throw new ImageProviderRejected('image_provider_no_image', 'Le fournisseur n’a renvoyé aucune image.');
    }
    let bytes: Buffer;
    try { bytes = Buffer.from(imagePart.inlineData.data, 'base64'); } catch { throw new ImageProviderRejected('image_provider_invalid_response', 'Image du fournisseur illisible.'); }
    if (!bytes.length || bytes.length > maxOutputBytes) throw new ImageProviderRejected('image_provider_invalid_response', 'Taille d’image du fournisseur invalide.');
    const mimeType = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
      : bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? 'image/jpeg' : null;
    if (!mimeType) throw new ImageProviderRejected('image_provider_invalid_response', 'Le fournisseur n’a pas renvoyé un PNG ou JPEG vérifiable.');
    return { bytes, mimeType, provider: this.id, model: this.config.model, costCents: this.estimateCents(),
      providerRequestId: envelope.data.responseId ?? null, warnings: usedRatioConfig ? [] : ['aspectRatio transmis par le prompt uniquement'] };
  }
}

export type ProviderSelection = { provider: ImageEditProvider } | { code: string; message: string };
export function selectImageProvider(): ProviderSelection {
  const configuration = geminiImageConfiguration();
  if ('availability' in configuration) {
    return { code: configuration.availability === 'disabled' ? 'image_editing_disabled' : 'image_provider_missing_credential',
      message: configuration.reason };
  }
  return { provider: new GeminiImageProvider(configuration.config) };
}

/** Capacités réelles, sans sonde payante : la disponibilité décrit la configuration, pas un essai fournisseur. */
export function imageProviderCapabilities() {
  const configuration = geminiImageConfiguration();
  const gemini = 'config' in configuration ? configuration.config : null;
  return [
    { provider: 'gemini-image@1', model: gemini?.model ?? (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'),
      availability: 'config' in configuration ? 'configured' : configuration.availability,
      reason: 'config' in configuration ? null : configuration.reason,
      operations: [...imageEditOperation.options], aspectRatios: [...imageAspectRatio.options],
      requiresSource: false, maxCents: gemini?.maxCents ?? integer('GEMINI_IMAGE_MAX_CENTS', 8, 1, 100),
      estimatedCents: gemini?.estimatedCents ?? integer('GEMINI_IMAGE_COST_CENTS', 4, 0, 100),
      supportsMaskPrompt: true, providerCallVerified: false },
    { provider: 'replicate@1', model: 'black-forest-labs/flux-schnell', availability: 'scene-flow-only',
      reason: 'Intégration Replicate existante pour les scènes Studio (media.image@1) ; non utilisée par le studio d’édition indépendant.',
      operations: ['generate'], aspectRatios: ['1:1'], requiresSource: false, maxCents: 1, estimatedCents: 1,
      supportsMaskPrompt: false, providerCallVerified: false }
  ];
}
