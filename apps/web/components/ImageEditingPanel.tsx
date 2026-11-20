'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, postJson } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type AssetVersion = { id: string; assetId: string; version: number; name: string; kind: string; mimeType: string; sizeBytes: number; license: string };
type Asset = { id: string; kind: string; versions: AssetVersion[] };
type ProviderCapability = {
  provider: string; model: string; availability: string; reason: string | null; operations: string[];
  aspectRatios: string[]; maxCents: number; estimatedCents: number; accountAuthorized?: boolean;
};
type EditResult = {
  assetId: string; assetVersionId: string; sha256: string; mimeType: string; width: number; height: number;
  provider: string; model: string; operation: string; aspectRatio: string; sourceVersionId: string | null;
  prompt: string; warnings: string[]; estimatedCents: number;
};
type EditOperation = {
  id: string; state: string; costState: string; maxCents: number; reportedCents: number | null;
  params: { operation: string; sourceVersionId: string | null; maskVersionId: string | null; prompt: string; aspectRatio: string; preserveSubject: boolean };
  result: EditResult | null; digest: string; createdAt: string; approvedBy: string | null;
};
const pendingStates = new Set(['PROPOSED', 'QUEUED', 'CLAIMED', 'POLLING']);
const operationLabels: Record<string, [string, string]> = {
  generate: ['Générer une image', 'Generate an image'],
  edit: ['Éditer l’image', 'Edit the image'],
  'replace-background': ['Remplacer l’arrière-plan', 'Replace the background'],
  'remove-object': ['Retirer un élément', 'Remove an object'],
  variation: ['Proposer une variation', 'Create a variation'],
  enhance: ['Améliorer la qualité', 'Enhance quality']
};
const stateLabels: Record<string, [string, string]> = {
  PROPOSED: ['À autoriser', 'To authorize'], QUEUED: ['En file', 'Queued'], CLAIMED: ['En cours', 'Running'],
  POLLING: ['En cours', 'Running'], SUCCEEDED: ['Réussi', 'Succeeded'], FAILED: ['Échec', 'Failed'],
  CANCELLED: ['Annulé', 'Cancelled'], UNKNOWN: ['Issue incertaine', 'Uncertain outcome'], RESOLVED: ['Résolu', 'Resolved']
};
const errorMessages: Record<string, [string, string]> = {
  image_editing_disabled: ['L’édition d’image IA n’est pas activée sur ce serveur.', 'AI image editing is not enabled on this server.'],
  image_provider_missing_credential: ['Le fournisseur d’image IA n’est pas configuré.', 'The AI image provider is not configured.'],
  image_source_not_found: ['Image source introuvable dans cette marque.', 'Source image not found in this brand.'],
  image_source_rights: ['Droits de l’image non confirmés.', 'Image rights are not confirmed.'],
  image_provider_rejected: ['Le fournisseur a refusé la demande.', 'The provider rejected the request.'],
  image_provider_quota: ['Quota du fournisseur atteint.', 'Provider quota reached.'],
  image_provider_blocked: ['Contenu bloqué par le fournisseur.', 'Content blocked by the provider.'],
  image_provider_uncertain: ['Réponse ambiguë du fournisseur : vérifiez le résultat avant de relancer.', 'Ambiguous provider response: check the result before retrying.']
};

function versionContent(assetId: string, versionId: string) {
  return '/api/assets/' + encodeURIComponent(assetId) + '/versions/' + encodeURIComponent(versionId) + '/content';
}

/** Studio d’édition d’image : source choisie, proposition, autorisation, résultat comparé, application en composition. */
export default function ImageEditingPanel({ projectId, contextId, onApplied }: { projectId: string; contextId: string; onApplied?: (revision: number) => void }) {
  const { t } = useWorkspace();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [operations, setOperations] = useState<EditOperation[]>([]);
  const [head, setHead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reload, setReload] = useState(0);
  const [operation, setOperation] = useState('edit');
  const [sourceVersionId, setSource] = useState('');
  const [maskVersionId, setMask] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [preserveSubject, setPreserve] = useState(true);
  const [rights, setRights] = useState(false);
  const base = '/api/projects/' + encodeURIComponent(projectId);
  const versionIndex = new Map<string, AssetVersion>();
  for (const asset of assets) for (const version of asset.versions) versionIndex.set(version.id, { ...version, assetId: asset.id });
  const imageAssets = assets.filter((asset) => asset.kind === 'image' || asset.kind === 'logo');
  const configured = capabilities.filter((capability) => capability.availability === 'configured' && capability.accountAuthorized !== false);
  const needsSource = operation !== 'generate';
  const sourceAssets = imageAssets;

  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true); setFailed(false);
    async function load() {
      try {
        const [library, caps, edits, history] = await Promise.all([
          api<{ items: Asset[] }>('/api/contexts/' + encodeURIComponent(contextId) + '/assets'),
          api<{ providers: ProviderCapability[]; accountAuthorized: boolean }>('/api/image-editing/capabilities'),
          api<{ items: EditOperation[] }>(base + '/image-edits'),
          api<Array<{ version: number }>>(base + '/creative')
        ]);
        if (!active) return;
        setAssets(library.items); setCapabilities(caps.providers); setAuthorized(caps.accountAuthorized);
        setOperations(edits.items); setHead(history[0]?.version ?? 0); setFailed(false);
        if (edits.items.some((item) => pendingStates.has(item.state))) timer = setTimeout(load, 4000);
      } catch { if (active) setFailed(true); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [base, contextId, reload]);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(''); setNote('');
    try { await fn(); } catch (e) {
      const code = e instanceof Error ? e.message : 'image_edit_failed';
      const message = errorMessages[code];
      setError(message ? t(message[0], message[1]) : code);
    } finally { setBusy(''); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured.length) { setError(t(errorMessages.image_provider_missing_credential[0], errorMessages.image_provider_missing_credential[1])); return; }
    if (!authorized) { setError(t('Ce compte n’est pas autorisé pour l’outil d’édition d’image.', 'This account is not authorized for the image editing tool.')); return; }
    if (needsSource && !sourceVersionId) { setError(t('Choisissez une image source.', 'Choose a source image.')); return; }
    if (!rights || prompt.trim().length < 3) return;
    void act('submit', async () => {
      const created = await postJson<EditOperation>(base + '/image-edits', {
        requestId: crypto.randomUUID(), operation,
        sourceVersionId: needsSource ? sourceVersionId : null,
        maskVersionId: maskVersionId || null,
        prompt: prompt.trim(), aspectRatio, preserveSubject, rightsConfirmed: true
      });
      setOperations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setNote(t('Demande préparée. Autorisez la dépense pour lancer la génération.', 'Request prepared. Authorize the cost to start generation.'));
      setReload((value) => value + 1);
    });
  }
  function authorize(item: EditOperation) {
    void act('authorize-' + item.id, async () => {
      await postJson('/api/execution/' + encodeURIComponent(item.id) + '/approve', { digest: item.digest });
      setNote(t('Autorisation enregistrée. La génération démarre.', 'Authorization saved. Generation starts.'));
      setReload((value) => value + 1);
    });
  }
  function cancel(item: EditOperation) {
    void act('cancel-' + item.id, async () => {
      await postJson('/api/execution/' + encodeURIComponent(item.id) + '/cancel', {});
      setNote(t('Demande annulée avant envoi si possible.', 'Request cancelled before dispatch when possible.'));
      setReload((value) => value + 1);
    });
  }
  function apply(item: EditOperation) {
    void act('apply-' + item.id, async () => {
      if (!head) { setError(t('Enregistrez d’abord une composition dans le Studio.', 'Save a composition in the Studio first.')); return; }
      const revision = await postJson<{ version: number }>(base + '/image-edits/' + encodeURIComponent(item.id) + '/apply', { expectedRevision: head, fit: 'cover' });
      setNote(t('Image appliquée à la composition v', 'Image applied to composition v') + revision.version + '.');
      onApplied?.(revision.version);
      setReload((value) => value + 1);
    });
  }
  function previewFor(item: EditOperation) {
    const result = item.result;
    if (!result) return null;
    const source = result.sourceVersionId ? versionIndex.get(result.sourceVersionId) : undefined;
    return <div className="image-edit-compare" data-testid={'image-edit-result-' + item.id}>
      {source ? <figure><img src={versionContent(source.assetId, source.id)} alt={t('Image originale', 'Original image')} /><figcaption>{t('Originale', 'Original')} · v{source.version}</figcaption></figure> : null}
      <figure><img src={versionContent(result.assetId, result.assetVersionId)} alt={t('Image éditée', 'Edited image')} /><figcaption>{t('Éditée', 'Edited')} · {result.width}×{result.height}</figcaption></figure>
    </div>;
  }

  return <section className="card stack image-editing" data-vululu-theme="blue" data-testid="image-editing" aria-labelledby="image-editing-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Studio image IA', 'AI image studio')}</p>
        <h2 id="image-editing-heading">{t('Éditer ou générer une image', 'Edit or generate an image')}</h2>
      </div>
      <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => setReload((value) => value + 1)}>{t('Actualiser', 'Refresh')}</button>
    </div>
    <p className="muted">{t('Choisissez une image de votre bibliothèque, décrivez la modification, autorisez la dépense : le résultat devient une nouvelle version, jamais un écrasement. Un masque issu de l’outil Python améliore les retouches ciblées.', 'Choose an image from your library, describe the change, authorize the cost: the result becomes a new version, never an overwrite. A mask from the Python tool improves targeted edits.')}</p>
    {loading ? <p role="status">{t('Chargement du studio image…', 'Loading image studio…')}</p> : failed ? <div className="stack" role="alert"><p className="error">{t('Studio image indisponible.', 'Image studio unavailable.')}</p><button type="button" className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('Réessayer', 'Retry')}</button></div> : <>
      <div className="context-completeness" role="status" data-testid="image-capabilities">
        <p><strong>{configured.length ? t('Fournisseur disponible', 'Provider available') : t('Aucun fournisseur d’image configuré', 'No image provider configured')}</strong></p>
        {capabilities.map((capability) => <p key={capability.provider} className="hint">{capability.provider} · {capability.model} · {capability.availability}
          {capability.reason ? ' · ' + capability.reason : ''} · {t('coût estimé', 'estimated cost')} {capability.estimatedCents} ¢ / {t('plafond', 'cap')} {capability.maxCents} ¢</p>)}
        {!authorized ? <p className="hint">{t('Le compte n’est pas encore autorisé pour l’outil d’édition : demandez l’autorisation à l’administrateur.', 'This account is not yet authorized for the editing tool: ask the administrator.')}</p> : null}
      </div>
      <form className="stack" onSubmit={submit} aria-busy={!!busy}>
        <label className="label" htmlFor="image-edit-operation">{t('Action', 'Action')}<select id="image-edit-operation" className="input" value={operation} disabled={!!busy} onChange={(e) => setOperation(e.target.value)}>
          {Object.entries(operationLabels).map(([key, label]) => <option key={key} value={key}>{t(label[0], label[1])}</option>)}
        </select></label>
        {needsSource ? <>
          <label className="label" htmlFor="image-edit-source">{t('Image source (bibliothèque)', 'Source image (library)')}<select id="image-edit-source" className="input" value={sourceVersionId} disabled={!!busy} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t('Choisir une image', 'Choose an image')}</option>
            {sourceAssets.flatMap((asset) => asset.versions.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version}</option>))}
          </select></label>
          {sourceVersionId && versionIndex.get(sourceVersionId) ? <img className="image-edit-source" src={versionContent(versionIndex.get(sourceVersionId)!.assetId, sourceVersionId)} alt={t('Image source', 'Source image')} /> : null}
          <label className="label" htmlFor="image-edit-mask">{t('Masque (facultatif)', 'Mask (optional)')}<select id="image-edit-mask" className="input" value={maskVersionId} disabled={!!busy} onChange={(e) => setMask(e.target.value)}>
            <option value="">{t('Aucun masque', 'No mask')}</option>
            {imageAssets.flatMap((asset) => asset.versions.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version}</option>))}
          </select></label>
        </> : null}
        <label className="label" htmlFor="image-edit-prompt">{t('Modification souhaitée', 'Requested change')}<textarea id="image-edit-prompt" className="input textarea" value={prompt} disabled={!!busy} onChange={(e) => setPrompt(e.target.value)} minLength={3} maxLength={1200} required placeholder={t('Exemple : remplacer le fond par un mur clair, garder le produit intact.', 'Example: replace the background with a light wall, keep the product unchanged.')} /></label>
        <div className="two-col">
          <label className="label">{t('Format social', 'Social ratio')}<select className="input" value={aspectRatio} disabled={!!busy} onChange={(e) => setAspectRatio(e.target.value)}>
            {['1:1', '4:5', '9:16', '16:9'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
          </select></label>
          <label className="check-row"><input type="checkbox" checked={preserveSubject} disabled={!!busy} onChange={(e) => setPreserve(e.target.checked)} />{t('Préserver le sujet / produit', 'Preserve subject / product')}</label>
        </div>
        <label className="check-row"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />{t('Je confirme détenir les droits sur cette image et autoriser l’envoi au fournisseur.', 'I confirm I own the rights to this image and authorize sending it to the provider.')}</label>
        <button type="submit" className="btn btn-primary" data-testid="image-edit-submit" disabled={!!busy || !configured.length || !authorized || !rights || prompt.trim().length < 3 || (needsSource && !sourceVersionId)}>{busy === 'submit' ? t('Préparation…', 'Preparing…') : t('Préparer la demande', 'Prepare request')}</button>
      </form>
      {error ? <div className="error" role="alert"><p>{error}</p><p className="hint">{t('Aucune image partielle n’est enregistrée en cas d’échec.', 'No partial image is saved on failure.')}</p></div> : null}
      {note ? <p className="toast toast--success" role="status">{note}</p> : null}
      {!operations.length ? <p className="hint" data-testid="image-edit-empty">{t('Aucune édition pour l’instant.', 'No edit yet.')}</p> : <div className="stack">
        <h3>{t('Éditions récentes', 'Recent edits')}</h3>
        <ul className="execution-list">
          {operations.map((item) => <li key={item.id} className="execution-row" data-testid={'image-edit-' + item.id}>
            <div className="execution-row-head">
              <strong>{t(operationLabels[item.params.operation]?.[0] ?? item.params.operation, operationLabels[item.params.operation]?.[1] ?? item.params.operation)}</strong>
              <span className={'pill execution-state state-' + item.state.toLowerCase()}>{t(stateLabels[item.state]?.[0] ?? item.state, stateLabels[item.state]?.[1] ?? item.state)}</span>
            </div>
            <p className="hint">{item.params.prompt} · {item.params.aspectRatio} · {t('coût', 'cost')} {item.reportedCents ?? '—'}/{item.maxCents} ¢{item.result ? ' · ' + item.result.provider + ' · ' + item.result.model : ''}</p>
            {item.state === 'UNKNOWN' ? <p className="hint" role="alert">{t('Issue incertaine : vérifiez la bibliothèque et la facturation avant de relancer une demande identique.', 'Uncertain outcome: check the library and billing before retrying an identical request.')}</p> : null}
            {item.state === 'PROPOSED' ? <div className="actions">
              <button type="button" className="btn btn-primary btn-small" disabled={!!busy} onClick={() => authorize(item)}>{t('Autoriser cet envoi (max ', 'Authorize this request (max ') + item.maxCents + ' ¢)'}</button>
              <button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => cancel(item)}>{t('Annuler', 'Cancel')}</button>
            </div> : ['QUEUED'].includes(item.state) ? <div className="actions"><button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => cancel(item)}>{t('Annuler avant envoi', 'Cancel before dispatch')}</button></div> : null}
            {item.result ? previewFor(item) : null}
            {item.result ? <div className="actions"><button type="button" className="btn btn-secondary btn-small" disabled={!!busy || !head} onClick={() => apply(item)}>{t('Appliquer à la composition v', 'Apply to composition v') + head + (head ? '' : ' —')}</button>{!head ? <span className="hint">{t('Aucune composition enregistrée.', 'No saved composition.')}</span> : null}</div> : null}
          </li>)}
        </ul>
      </div>}
    </>}
    <p className="hint">{t('L’image originale reste intacte : chaque résultat est une version immuable avec sa provenance (fournisseur, modèle, opération, source, requête). Rien n’est publié automatiquement.', 'The original image stays intact: each result is an immutable version with provenance (provider, model, operation, source, request). Nothing is published automatically.')}</p>
  </section>;
}
