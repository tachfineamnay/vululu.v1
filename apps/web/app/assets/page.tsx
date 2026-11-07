'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import { api, type BrandContext, type ProjectSummary } from '../../lib/api';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';

type Kind = 'logo' | 'image' | 'video' | 'audio' | 'document' | 'font';
type License = 'commercial' | 'internal' | 'unknown';
type Version = { id: string; assetId: string; version: number; name: string; kind: Kind; mimeType: string; sizeBytes: number; sha256: string; license: License; provenance: string };
type Asset = { id: string; contextId: string; kind: Kind; versions: Version[] };
const kinds: Record<Kind, string> = { logo: 'Logo', image: 'Image', video: 'Vidéo', audio: 'Audio', document: 'Document', font: 'Police' };
const licenses: Record<License, string> = { commercial: 'Usage commercial autorisé', internal: 'Usage organique interne uniquement', unknown: 'Droits à confirmer' };
const accepts: Record<Kind, string> = { logo: '.png,.jpg,.jpeg,.webp', image: '.png,.jpg,.jpeg,.webp', video: '.mp4', audio: '.wav,.mp3', document: '.pdf,.txt', font: '.ttf,.otf' };
const mimeByExtension: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', pdf: 'application/pdf', txt: 'text/plain', ttf: 'font/ttf', otf: 'font/otf' };
function contentUrl(v: Version) { return `/api/assets/${encodeURIComponent(v.assetId)}/versions/${encodeURIComponent(v.id)}/content`; }

export default function AssetsPage() {
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [contextId, setContextId] = useState('');
  const [items, setItems] = useState<Asset[]>([]);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const [usage, setUsage] = useState<'organic' | 'sponsored'>('organic');
  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState<Kind>('logo');
  const [license, setLicense] = useState<License>('unknown');
  const [provenance, setProvenance] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [uploadDirty, setUploadDirty] = useState(false);
  const requestedProject = useRef('');
  useUnsavedChanges(selectionDirty || uploadDirty);
  const inputFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([api<{ items: BrandContext[] }>('/api/contexts'), api<{ items: ProjectSummary[] }>('/api/projects')])
      .then(([a, p]) => { if (active) {
        const params = new URLSearchParams(window.location.search);
        const requested = params.get('context');
        const project = p.items.find((item) => item.id === params.get('project'));
        const chosen = a.items.find((item) => item.id === requested)?.id || project?.contextId || a.items[0]?.id || '';
        requestedProject.current = project?.contextId === chosen ? project.id : '';
        setContexts(a.items); setProjects(p.items); setContextId(chosen);
      } })
      .catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!contextId) return;
    let active = true;
    setLoading(true); setLibraryLoaded(false); setError(''); setFeedback(''); setItems([]); setVersions({}); setProjectId(''); setSelection([]); setAssetId(''); setSelectionDirty(false);
    void api<{ items: Asset[] }>(`/api/contexts/${encodeURIComponent(contextId)}/assets`)
      .then((data) => { if (active) { setItems(data.items); setLibraryLoaded(true); if (requestedProject.current) { setProjectId(requestedProject.current); requestedProject.current = ''; } } })
      .catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contextId, retry]);
  useEffect(() => {
    if (!projectId) { setSelection([]); setSelectLoading(false); return; }
    let active = true;
    setSelectLoading(true); setSelectionLoaded(false); setError(''); setFeedback(''); setSelection([]); setSelectionDirty(false);
    void api<{ usage: 'organic' | 'sponsored'; versionIds: string[] }>(`/api/projects/${encodeURIComponent(projectId)}/assets`)
      .then((data) => { if (active) { setSelectionLoaded(true); setSelection(data.versionIds); setUsage(data.usage); setVersions((current) => ({ ...current, ...Object.fromEntries(items.flatMap((a) => a.versions).filter((v) => data.versionIds.includes(v.id)).map((v) => [v.assetId, v.id])) })); } })
      .catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setSelectLoading(false); });
    return () => { active = false; };
  }, [projectId, retry]);
  async function upload(event: FormEvent) {
    event.preventDefault(); setError(''); setFeedback('');
    const file = inputFile.current?.files?.[0];
    if (!file || file.size > 32 * 1024 * 1024 || !file.size) { setError('Choisissez un fichier non vide de 32 Mio maximum.'); return; }
    setBusy(true);
    try {
      const mimeType = mimeByExtension[file.name.split('.').pop()?.toLowerCase() || ''] || '';
      const metadata = { name, kind, license, provenance, mimeType, ...(assetId ? { assetId } : {}) };
      const { version } = await api<{ version: Version }>(`/api/contexts/${encodeURIComponent(contextId)}/assets`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'x-asset-metadata': encodeURIComponent(JSON.stringify(metadata)) } });
      const data = await api<{ items: Asset[] }>(`/api/contexts/${encodeURIComponent(contextId)}/assets`);
      setItems(data.items); setVersions((current) => ({ ...current, [version.assetId]: version.id }));
      if (inputFile.current) inputFile.current.value = '';
      setName(''); setUploadDirty(false); setFeedback(`Version ${version.version} importée et vérifiée.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Import impossible.'); }
    finally { setBusy(false); }
  }
  async function saveSelection() {
    setBusy(true); setError(''); setFeedback('');
    try {
      await api(`/api/projects/${encodeURIComponent(projectId)}/assets`, { method: 'PUT', body: JSON.stringify({ usage, versionIds: selection }) });
      setSelectionDirty(false); setFeedback('Sélection enregistrée pour le prochain lancement.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sélection impossible.'); }
    finally { setBusy(false); }
  }
  function toggle(v: Version, checked: boolean) {
    setSelectionDirty(true);
    const sameAsset = items.find((a) => a.id === v.assetId)!.versions.map((version) => version.id);
    setSelection((current) => [...current.filter((id) => !sameAsset.includes(id)), ...(checked ? [v.id] : [])]);
  }
  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#assets-main">Aller au contenu</a>
    <StudioNav><Link href={contextId ? '/contexts?context=' + encodeURIComponent(contextId) : '/contexts'} className="btn btn-secondary">Retour à la fiche</Link></StudioNav>
    <main id="assets-main" tabIndex={-1} className="page" data-testid="assets-page">
      <section className="studio-head"><div><p className="eyebrow">Marques et références</p><h1>Ressources du contexte</h1><p className="muted">Vos fichiers, leurs droits et leurs versions. Choisissez explicitement ceux à utiliser dans un projet.</p></div></section>
      {error ? <div className="error" role="alert"><p>{error}</p><p>Opération non confirmée. Corrigez les informations ou réessayez.</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => {
        if (selectionDirty && !window.confirm('La sélection non enregistrée sera rechargée. Continuer ?')) return;
        setRetry((n) => n + 1);
      }}>Recharger les listes</button></div> : null}
      {feedback ? <p className="toast toast--success" role="status">{feedback}</p> : null}
      <label className="label">Contexte<select aria-label="Contexte" className="input" value={contextId} disabled={busy || loading} onChange={(e) => {
        if ((selectionDirty || uploadDirty) && !window.confirm('Des modifications ne sont pas enregistrées. Changer de contexte ?')) return;
        setError(''); setFeedback(''); setUploadDirty(false); setName(''); setProvenance(''); setContextId(e.target.value);
        if (inputFile.current) inputFile.current.value = '';
        const url = new URL(window.location.href); url.searchParams.set('context', e.target.value); url.searchParams.delete('project'); window.history.replaceState(null, '', url);
      }}><option value="">Choisir un contexte</option>{contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {!loading && !error && !contexts.length ? <p className="muted">Créez un <Link href="/contexts/new">contexte</Link> pour importer vos premiers fichiers.</p> : null}
      {contextId ? <div className="asset-layout">
        <section className="card stack" aria-labelledby="asset-upload-heading">
          <h2 id="asset-upload-heading">Importer un fichier</h2>
          <p className="hint">Ajoutez une référence ou une nouvelle version. Chaque fichier reste rattaché à ce contexte.</p>
          <details><summary>Ajouter un fichier ou une version</summary>
          <form className="stack" onSubmit={upload} onChange={() => setUploadDirty(true)} aria-busy={busy}>
            <label className="label">Destination<select aria-label="Destination" className="input" value={assetId} disabled={busy || loading} onChange={(e) => { const a = items.find((item) => item.id === e.target.value); setAssetId(e.target.value); if (a) setKind(a.kind); }}><option value="">Nouvelle ressource</option>{items.map((a) => <option key={a.id} value={a.id}>Nouvelle version de {a.versions[0].name}</option>)}</select></label>
            <label className="label">Type d’actif<select className="input" value={kind} disabled={busy || !!assetId} onChange={(e) => setKind(e.target.value as Kind)}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="label">Nom de la version<input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={160} required disabled={busy} /></label>
            <label className="label">Fichier<input className="input" key={kind} type="file" accept={accepts[kind]} ref={inputFile} required disabled={busy} /></label>
            <p className="hint">32 Mio maximum · Images : 16 mégapixels · Vidéo MP4/H.264 et audio : 10 minutes maximum. Documents PDF/TXT et polices TTF/OTF en pièces jointes.</p>
            <label className="label">Droits déclarés<select className="input" value={license} onChange={(e) => setLicense(e.target.value as License)} disabled={busy}>{Object.entries(licenses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="label">Provenance et autorisation<textarea className="input" value={provenance} onChange={(e) => setProvenance(e.target.value)} minLength={3} maxLength={1000} required disabled={busy} placeholder="Créateur, source et autorisation d’utilisation" /></label>
            <button type="submit" className="btn btn-primary" disabled={busy || loading || !libraryLoaded}>{busy ? 'Opération en cours…' : 'Importer et vérifier'}</button>
          </form></details><p className="hint">Le remplacement du fichier crée une nouvelle version. Renommer ou supprimer une ressource n’est pas disponible dans cette version.</p>
        </section>
        <section className="stack" aria-labelledby="asset-library-heading">
          <div className="card stack"><h2 id="asset-library-heading">Bibliothèque</h2>
            <label className="label">Sélection pour un projet<select className="input" value={projectId} disabled={busy || loading} onChange={(e) => {
              if (selectionDirty && !window.confirm('La sélection a changé sans être enregistrée. Changer de projet ?')) return;
              setProjectId(e.target.value);
              const url = new URL(window.location.href); url.searchParams.set('project', e.target.value); window.history.replaceState(null, '', url);
            }}><option value="">Aucun projet sélectionné</option>{projects.filter((p) => p.contextId === contextId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
            {projectId ? <><label className="label">Usage prévu<select className="input" value={usage} disabled={busy || selectLoading || !selectionLoaded} onChange={(e) => { setUsage(e.target.value as 'organic' | 'sponsored'); setSelectionDirty(true); }}><option value="organic">Organique interne</option><option value="sponsored">Sponsorisé (droits commerciaux requis)</option></select></label><p className="hint">Une version exacte par actif. Les droits doivent être confirmés. Les ressources seront figées au lancement ; leur composition dans les sorties est en cours de finalisation.</p><button type="button" className="btn btn-secondary" disabled={busy || selectLoading || loading || !selectionLoaded || !selectionDirty} onClick={saveSelection}>Enregistrer la sélection ({selection.length})</button><p className="hint" role="status">{selectLoading ? 'Chargement de la sélection…' : selectionDirty ? 'Sélection non enregistrée.' : selectionLoaded ? 'Sélection identique à celle du serveur.' : 'Sélection inaccessible ; rechargez les listes avant de modifier.'}</p><Link className="text-link" href={'/projects/' + encodeURIComponent(projectId)}>Retour au projet</Link></> : null}
          </div>
          {loading ? <p role="status">Chargement de la bibliothèque…</p> : libraryLoaded && !items.length ? <div className="card empty-state"><h3>Ajoutez les éléments que Vululu doit utiliser.</h3><p className="muted">Logo, image, document ou autre référence autorisée : importez un fichier avec sa provenance et ses droits.</p></div> : null}
          <div className="asset-grid">{items.map((asset) => {
            const v = asset.versions.find((version) => version.id === versions[asset.id]) ?? asset.versions[0];
            const selected = selection.includes(v.id);
            return <article key={asset.id} className="card stack asset-card">
              <h3>{v.name}</h3><p className="muted small">{kinds[asset.kind]} · {Math.ceil(v.sizeBytes / 1024)} Kio · {licenses[v.license]}</p>
              <label className="label">Version de {asset.versions[0].name}<select aria-label={'Version de ' + asset.versions[0].name} className="input" value={v.id} disabled={busy} onChange={(e) => setVersions((current) => ({ ...current, [asset.id]: e.target.value }))}>{asset.versions.map((version) => <option key={version.id} value={version.id}>v{version.version} — {version.name}</option>)}</select></label>
              {asset.kind === 'image' || asset.kind === 'logo' ? <img className="asset-preview" src={contentUrl(v)} alt={v.name} loading="lazy" /> : asset.kind === 'video' ? <video className="asset-preview" src={contentUrl(v)} controls preload="metadata" aria-label={v.name} /> : asset.kind === 'audio' ? <audio src={contentUrl(v)} controls preload="metadata" aria-label={v.name} /> : null}
              <p className="small asset-provenance">{v.provenance}</p><details><summary className="small">Empreinte SHA-256</summary><code className="mono small asset-hash">{v.sha256}</code></details>
              <a className="text-link" href={contentUrl(v)} download>Télécharger cette version</a>
              {projectId ? <label className="check-row"><input type="checkbox" checked={selected} disabled={busy || selectLoading || !selectionLoaded || v.license === 'unknown' || (usage === 'sponsored' && v.license !== 'commercial')} onChange={(e) => toggle(v, e.target.checked)} />Utiliser la version {v.version}</label> : null}{v.license === 'unknown' ? <p className="hint">Droits à confirmer : cette version ne peut pas être sélectionnée pour un projet. Importez une version avec les droits déclarés.</p> : usage === 'sponsored' && v.license !== 'commercial' && projectId ? <p className="hint">Cette version ne possède pas les droits commerciaux requis pour un usage sponsorisé.</p> : null}
            </article>;
          })}</div>
        </section>
      </div> : null}
    </main>
  </div>;
}
