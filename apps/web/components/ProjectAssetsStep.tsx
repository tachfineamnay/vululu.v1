'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ProjectAssetDecision } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type AssetKind = 'logo' | 'image' | 'video' | 'audio' | 'document' | 'font';
type License = 'commercial' | 'internal' | 'unknown';
type Version = { id: string; assetId: string; version: number; name: string; kind: AssetKind; mimeType: string; sizeBytes: number; sha256: string; license: License; provenance: string };
type Asset = { id: string; kind: AssetKind; versions: Version[] };
const kindLabels: Record<AssetKind, [string, string]> = {
  logo: ['Logo', 'Logo'], image: ['Image', 'Image'], video: ['Vidéo', 'Video'],
  audio: ['Audio', 'Audio'], document: ['Document', 'Document'], font: ['Police', 'Font']
};
const licenseLabels: Record<License, [string, string]> = {
  commercial: ['Usage commercial autorisé', 'Commercial use allowed'],
  internal: ['Usage organique interne uniquement', 'Internal organic use only'],
  unknown: ['Droits à confirmer', 'Rights to confirm']
};
function contentUrl(assetId: string, versionId: string) {
  return '/api/assets/' + encodeURIComponent(assetId) + '/versions/' + encodeURIComponent(versionId) + '/content';
}

type Props = {
  projectId: string;
  contextId: string;
  format: string;
  onDecision?: (decision: ProjectAssetDecision | null) => void;
};

/** Décision de ressources du projet : sélectionner, confirmer, ou confirmer explicitement l’absence de ressource. */
export default function ProjectAssetsStep({ projectId, contextId, format, onDecision }: Props) {
  const { t, locale } = useWorkspace();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [decision, setDecision] = useState<ProjectAssetDecision | null>(null);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string[]>([]);
  const [usage, setUsage] = useState<'organic' | 'sponsored'>('organic');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const decisionPath = '/api/projects/' + encodeURIComponent(projectId) + '/assets/decision';
  const selectionPath = '/api/projects/' + encodeURIComponent(projectId) + '/assets';
  const libraryPath = '/assets?context=' + encodeURIComponent(contextId) + '&project=' + encodeURIComponent(projectId);

  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setError(''); setFeedback('');
    void Promise.all([
      api<{ items: Asset[] }>('/api/contexts/' + encodeURIComponent(contextId) + '/assets'),
      api<{ decision: ProjectAssetDecision }>(decisionPath)
    ]).then(([library, status]) => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const asset of library.items) {
        const chosen = asset.versions.find((version) => status.decision.versionIds.includes(version.id));
        map[asset.id] = (chosen ?? asset.versions[0]).id;
      }
      setAssets(library.items); setVersions(map); setSelection(status.decision.versionIds);
      setUsage(status.decision.usage); setDecision(status.decision); setDirty(false);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, contextId, decisionPath, retry]);

  useEffect(() => { onDecision?.(decision); }, [decision, onDecision]);

  const compatibleKinds = decision?.compatibleKinds ?? null;
  const isCompatible = (kind: AssetKind) => !compatibleKinds || compatibleKinds.includes(kind);
  const confirmed = !!decision?.confirmed;

  function staleReasonText(): string {
    switch (decision?.reason) {
      case 'selection_changed': return t('La sélection a changé depuis la confirmation. Reconfirmez-la.', 'The selection changed since confirmation. Confirm it again.');
      case 'version_unavailable': return t('Une ressource confirmée n’est plus disponible. Choisissez une version disponible puis reconfirmez.', 'A confirmed asset is no longer available. Choose an available version then confirm again.');
      case 'format_incompatible': return t('Une ressource ne convient plus au format du projet. Corrigez la sélection puis reconfirmez.', 'An asset no longer fits the project format. Fix the selection then confirm again.');
      case 'license_usage_restricted': return t('Les droits d’une ressource ne couvrent plus cet usage. Corrigez la sélection puis reconfirmez.', 'An asset’s rights no longer cover this use. Fix the selection then confirm again.');
      default: return t('Choisissez vos ressources, puis confirmez la sélection — ou confirmez explicitement que vous n’avez aucune ressource.', 'Choose your assets, then confirm the selection — or explicitly confirm you have no assets.');
    }
  }
  async function reloadDecision() {
    const status = await api<{ decision: ProjectAssetDecision }>(decisionPath);
    setDecision(status.decision); setSelection(status.decision.versionIds); setUsage(status.decision.usage); setDirty(false);
    return status.decision;
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError(''); setFeedback('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : t('Opération impossible.', 'Operation failed.')); }
    finally { setBusy(false); }
  }
  function toggle(asset: Asset, version: Version, checked: boolean) {
    const ids = asset.versions.map((item) => item.id);
    setSelection((current) => [...current.filter((id) => !ids.includes(id)), ...(checked ? [version.id] : [])]);
    setVersions((current) => ({ ...current, [asset.id]: version.id }));
    setDirty(true); setError(''); setFeedback('');
  }
  async function confirmAssets() {
    if (!selection.length) { setError(t('Sélectionnez au moins une ressource, ou confirmez que vous n’avez aucune ressource.', 'Select at least one asset, or confirm that you have no assets.')); return; }
    await act(async () => {
      await api(selectionPath, { method: 'PUT', body: JSON.stringify({ usage, versionIds: selection }) });
      const status = await api<{ decision: ProjectAssetDecision }>(selectionPath + '/confirm', { method: 'POST', body: JSON.stringify({ noAssets: false }) });
      setDecision(status.decision); setSelection(status.decision.versionIds); setDirty(false);
      setFeedback(t('Ressources confirmées. Le brainstorming est déverrouillé pour cette sélection.', 'Assets confirmed. Brainstorming is unlocked for this selection.'));
    });
  }
  async function confirmNoAssets() {
    await act(async () => {
      const status = await api<{ decision: ProjectAssetDecision }>(selectionPath + '/confirm', { method: 'POST', body: JSON.stringify({ noAssets: true }) });
      setDecision(status.decision); setSelection(status.decision.versionIds); setDirty(false);
      setFeedback(t('Décision enregistrée : ce projet avance sans ressource.', 'Decision saved: this project proceeds without assets.'));
    });
  }
  async function saveSelection() {
    await act(async () => {
      await api(selectionPath, { method: 'PUT', body: JSON.stringify({ usage, versionIds: selection }) });
      await reloadDecision();
      setFeedback(t('Sélection enregistrée. Confirmez-la pour déverrouiller le brainstorming.', 'Selection saved. Confirm it to unlock brainstorming.'));
    });
  }

  return <section id="assets-decision" className="card stack assets-step" data-vululu-theme="blue" data-testid="assets-step" aria-labelledby="assets-step-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Étape ressources', 'Assets step')}</p>
        <h2 id="assets-step-heading">{t('Vos ressources avant le brainstorming', 'Your assets before brainstorming')}</h2>
      </div>
      <Link className="text-link" href={libraryPath}>{t('Ajouter ou importer des ressources', 'Add or import assets')}</Link>
    </div>
    <p className="muted">{t('Le brainstorming a besoin de savoir sur quelles matières travailler. Sélectionnez les versions exactes à employer, ou confirmez explicitement que vous n’avez aucune ressource : rien n’est obligatoire à importer.', 'Brainstorming needs to know what materials to work with. Select the exact versions to use, or explicitly confirm you have no assets: importing is never mandatory.')}</p>
    {loading ? <p role="status">{t('Chargement de vos ressources et de la décision…', 'Loading your assets and decision…')}</p> : failed ? <div className="stack" role="alert"><p className="error">{t('Chargement des ressources impossible. Aucune décision n’a été enregistrée.', 'Assets could not be loaded. No decision was recorded.')}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRetry((n) => n + 1)}>{t('Réessayer', 'Retry')}</button></div> : <>
      {decision ? <div className={confirmed ? 'toast toast--success' : 'context-completeness'} role="status" data-testid="assets-decision-status">
        {confirmed ? <>
          <p><strong>{decision.noAssets ? t('Aucune ressource confirmée pour ce projet.', 'No assets confirmed for this project.') : t('Ressources confirmées pour ce projet.', 'Assets confirmed for this project.')}</strong></p>
          <p className="hint">{t('Confirmé le ', 'Confirmed on ')}{new Date(decision.confirmedAt!).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')}{decision.digest ? t(' · empreinte ', ' · digest ') + decision.digest.slice(0, 16) + '…' : ''}</p>
          <p className="hint">{t('Toute modification de la sélection invalide cette confirmation et redemande une validation avant le brainstorming.', 'Any change to the selection invalidates this confirmation and requires validation before brainstorming.')}</p>
        </> : <>
          <p><strong>{t('Décision de ressources à confirmer', 'Asset decision to confirm')}</strong></p>
          <p>{staleReasonText()}</p>
        </>}
      </div> : null}
      {decision && compatibleKinds ? <p className="hint">{t('Format du projet : ', 'Project format: ')}{format} · {t('types acceptés : ', 'accepted types: ')}{compatibleKinds.map((kind) => t(kindLabels[kind as AssetKind][0], kindLabels[kind as AssetKind][1])).join(', ')}</p> : null}
      {error ? <div className="error" role="alert"><p>{error}</p><p className="hint">{t('La décision précédente reste celle du serveur ; aucune confirmation partielle n’est enregistrée.', 'The previous decision remains the server one; no partial confirmation is recorded.')}</p></div> : null}
      {feedback ? <p className="toast toast--success" role="status">{feedback}</p> : null}
      {assets.length ? <>
        <label className="label">{t('Usage prévu', 'Intended use')}<select className="input" value={usage} disabled={busy} onChange={(event) => { setUsage(event.target.value as 'organic' | 'sponsored'); setDirty(true); }}>
          <option value="organic">{t('Organique interne', 'Internal organic')}</option>
          <option value="sponsored">{t('Sponsorisé (droits commerciaux requis)', 'Sponsored (commercial rights required)')}</option>
        </select></label>
        <div className="asset-grid">{assets.map((asset) => {
          const version = asset.versions.find((item) => item.id === versions[asset.id]) ?? asset.versions[0];
          const selected = selection.includes(version.id);
          const incompatible = !isCompatible(asset.kind);
          const rightsBlocked = version.license === 'unknown' || (usage === 'sponsored' && version.license !== 'commercial');
          return <article key={asset.id} className="card stack asset-card">
            <h3>{version.name}</h3>
            <p className="muted small">{t(kindLabels[asset.kind][0], kindLabels[asset.kind][1])} · {Math.ceil(version.sizeBytes / 1024)} Kio · {t(licenseLabels[version.license][0], licenseLabels[version.license][1])}</p>
            {asset.versions.length > 1 ? <label className="label">{t('Version', 'Version')}<select aria-label={t('Version de ', 'Version of ') + version.name} className="input" value={version.id} disabled={busy} onChange={(event) => toggle(asset, asset.versions.find((item) => item.id === event.target.value) ?? version, selected)}>{asset.versions.map((item) => <option key={item.id} value={item.id}>v{item.version} — {item.name}</option>)}</select></label> : null}
            {asset.kind === 'image' || asset.kind === 'logo' ? <img className="asset-preview" src={contentUrl(asset.id, version.id)} alt={version.name} loading="lazy" /> : asset.kind === 'video' ? <video className="asset-preview" src={contentUrl(asset.id, version.id)} controls preload="metadata" aria-label={version.name} /> : asset.kind === 'audio' ? <audio src={contentUrl(asset.id, version.id)} controls preload="metadata" aria-label={version.name} /> : null}
            <p className="small asset-provenance">{version.provenance}</p>
            <details><summary className="small">{t('Empreinte SHA-256', 'SHA-256 digest')}</summary><code className="mono small asset-hash">{version.sha256}</code></details>
            <label className="check-row"><input type="checkbox" checked={selected} disabled={busy || incompatible || rightsBlocked} onChange={(event) => toggle(asset, version, event.target.checked)} />{t('Utiliser la version ', 'Use version ')}{version.version}</label>
            {incompatible ? <p className="hint">{t('Ce type de ressource ne convient pas au format du projet.', 'This asset type does not fit the project format.')}</p> : null}
            {rightsBlocked ? <p className="hint">{version.license === 'unknown' ? t('Droits à confirmer : importez une version avec les droits déclarés.', 'Rights to confirm: import a version with declared rights.') : t('Cette version ne possède pas les droits commerciaux requis pour un usage sponsorisé.', 'This version lacks the commercial rights required for sponsored use.')}</p> : null}
          </article>;
        })}</div>
        {dirty ? <p className="hint" role="status">{t('Modification non enregistrée : la confirmation serveur reste celle de la sélection précédente. Confirmez pour l’appliquer.', 'Unsaved change: the server confirmation still applies to the previous selection. Confirm to apply it.')}</p> : null}
        <div className="actions">
          <button type="button" className="btn btn-primary" data-testid="assets-confirm" disabled={busy || !selection.length} onClick={() => void confirmAssets()}>{busy ? t('Enregistrement…', 'Saving…') : t('Confirmer ces ressources', 'Confirm these assets')}</button>
          <button type="button" className="btn btn-secondary" data-testid="assets-save" disabled={busy || !dirty} onClick={() => void saveSelection()}>{t('Enregistrer la sélection', 'Save selection')}</button>
          <button type="button" className="btn btn-ghost" data-testid="assets-confirm-none" disabled={busy} onClick={() => void confirmNoAssets()}>{t('Je n’ai aucune ressource', 'I have no assets')}</button>
        </div>
      </> : <div className="empty-state stack" data-testid="assets-empty">
        <h3>{t('Aucune ressource dans cette marque', 'No assets in this brand')}</h3>
        <p className="muted">{t('Importez un logo, une photo ou une référence depuis la bibliothèque, ou avancez sans ressource : le brainstorming s’appuiera alors sur votre identité confirmée.', 'Import a logo, photo or reference from the library, or proceed without assets: brainstorming will then rely on your confirmed identity.')}</p>
        <div className="actions">
          <Link className="btn btn-secondary" href={libraryPath}>{t('Importer dans la bibliothèque', 'Import in the library')}</Link>
          <button type="button" className="btn btn-ghost" data-testid="assets-confirm-none" disabled={busy} onClick={() => void confirmNoAssets()}>{busy ? t('Enregistrement…', 'Saving…') : t('Confirmer : aucune ressource', 'Confirm: no assets')}</button>
        </div>
      </div>}
      <p className="hint">{t('Les versions importées ne sont jamais modifiées. Le brainstorming reçoit la décision confirmée et son empreinte, jamais une URL de navigateur.', 'Imported versions are never modified. Brainstorming receives the confirmed decision and its digest, never a browser URL.')}</p>
    </>}
  </section>;
}
