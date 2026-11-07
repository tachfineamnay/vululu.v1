'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { postJson, type MasterVersion, type ProjectBundle, type Scene } from '../lib/api';
import { exactApproval, masterMediaUrl } from '../lib/creationDelivery';

type StudioPreview = { scene: Scene | null; mode: 'scene' | 'video'; onModeChange: (mode: 'scene' | 'video') => void };
type Props = { bundle: ProjectBundle; refresh: () => Promise<void>; blocked?: boolean; correct?: () => void; scenes?: ReactNode; inspector?: ReactNode; studio?: StudioPreview };

function ScenePreview({ projectId, scene }: { projectId: string; scene: Scene | null }) {
  const [failedUrl, setFailedUrl] = useState('');
  const version = scene?.versions[0];
  const url = scene && version ? '/api/projects/' + encodeURIComponent(projectId) + '/scenes/' + encodeURIComponent(scene.sceneKey) + '/image?v=' + version.version : '';
  return <figure className="studio-scene-preview">
    {scene && url && failedUrl !== url ? <img data-testid="scene-preview" src={url} alt={'Image de la scène ' + scene.title} onError={() => setFailedUrl(url)} /> : <div className="studio-empty-preview"><p>{scene ? (url ? 'L’image de cette scène est indisponible.' : 'Aucune image rendue pour cette scène.') : 'Sélectionnez une scène pour afficher son aperçu.'}</p>{scene && url && failedUrl === url ? <button type="button" className="btn btn-secondary" onClick={() => setFailedUrl('')}>Réessayer l’aperçu</button> : null}</div>}
    <figcaption aria-live="polite">{scene ? <>Scène sélectionnée : <strong>{scene.title}</strong> · {scene.sceneKey}. {url && failedUrl !== url ? 'Dernière image disponible.' : 'Aucun aperçu disponible.'}</> : 'Aucune scène sélectionnée.'}</figcaption>
  </figure>;
}

export default function CreationDelivery({ bundle, refresh, blocked = false, correct, scenes, inspector, studio }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ versionId: string; masterId: string; text: string } | null>(null);
  const [mediaErrors, setMediaErrors] = useState<number[]>([]);
  const latest = bundle.master;
  const showScene = Boolean(studio?.scene && (studio.mode === 'scene' || !latest));
  const previewSwitch = studio ? <div className="studio-preview-switch" role="group" aria-label="Aperçu du média">
    <button type="button" className="btn btn-ghost" aria-pressed={showScene} disabled={!studio.scene} onClick={() => studio.onModeChange('scene')}>Scène sélectionnée</button>
    <button type="button" className="btn btn-ghost" aria-pressed={!!latest && !showScene} disabled={!latest} onClick={() => studio.onModeChange('video')}>Vidéo complète</button>
  </div> : null;
  function layout(preview: ReactNode, finalization: ReactNode) {
    const panel = <section className="card stack creation-delivery" data-vululu-theme="blue" aria-labelledby="preview-heading" data-testid="creation-delivery">{preview}</section>;
    if (studio) return <><div className="studio-workspace">{panel}{inspector}</div><details className="card studio-finalization" data-testid="studio-finalization"><summary id="finalization-heading" tabIndex={-1}>Finaliser · qualité, approbation et transfert</summary><div className="stack studio-finalization-content">{finalization}</div></details></>;
    return <section className="card stack creation-delivery" data-vululu-theme="blue" aria-labelledby="preview-heading" data-testid="creation-delivery">{preview}{finalization}</section>;
  }
  if (!latest) return layout(<><h2 id="preview-heading" tabIndex={-1}>Votre création</h2>{previewSwitch}{studio ? <><ScenePreview projectId={bundle.project.id} scene={studio.scene} /><p className="hint">La vidéo complète sera disponible après la production.</p></> : <div className="studio-empty-preview"><p>Aucun aperçu disponible pour le moment.</p><p>Préparez le brief et le storyboard pour produire votre création.</p></div>}{scenes}{!correct ? <Link className="text-link" href={'/projects/' + bundle.project.id}>Reprendre le projet</Link> : null}</>, studio ? <p>Produisez une version pour consulter sa qualité, l’approuver et la transférer.</p> : null);
  const versions = bundle.masterVersions;
  const viewed = versions.find((version) => version.version === selected) ?? latest;
  const compared = versions.find((version) => version.version === compare && version.version !== viewed.version) ?? null;
  const isCurrent = viewed.id === latest.id;
  const canAct = !blocked && !busy && bundle.project.status !== 'producing';
  const report = viewed.qaReport as { checks?: Array<{ name: string; status: string; detail: string }> } | null;
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const mediaUrl = (version: number) => masterMediaUrl(bundle.project.id, version);
  function showVersion(version: number) { setSelected(version); setCompare(null); studio?.onModeChange('video'); document.getElementById('preview-heading')?.focus(); }
  async function mutate(action: 'approve' | 'transfer') {
    setBusy(action); setError(''); setMessage(null);
    try {
      await postJson('/api/projects/' + bundle.project.id + '/' + action, action === 'approve' ? { artifactVersionId: viewed.id, checksum: viewed.checksum } : {});
      setMessage({ versionId: viewed.id, masterId: latest!.id, text: action === 'approve' ? 'Approbation acceptée pour la version exacte v' + viewed.version + '.' : 'Demande de transfert Postiz MOCK acceptée pour v' + viewed.version + '. Consultez son état serveur ; aucune publication.' });
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Action non confirmée. Réessayez.'); }
    finally { setBusy(''); }
  }
  async function download() {
    setBusy('download'); setError(''); setMessage(null);
    try {
      const response = await fetch(mediaUrl(viewed.version), { credentials: 'include', cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('video/mp4')) throw new Error('Téléchargement impossible (' + response.status + '). Le résultat consulté et votre sélection sont conservés.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = bundle.project.id + '-v' + viewed.version + '.mp4'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage({ versionId: viewed.id, masterId: latest!.id, text: 'Fichier de la version ' + viewed.version + ' remis au navigateur. Ce téléchargement ne vaut ni approbation ni transfert.' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Téléchargement impossible.'); }
    finally { setBusy(''); }
  }
  function player(version: MasterVersion, comparison = false) { return <div className="stack"><p>{comparison ? 'Comparaison' : 'Version consultée'} : <strong>v{version.version}</strong> · QA {version.qaStatus ?? 'NOT_RUN'}</p><video key={version.id} className="player" controls preload="auto" data-testid={comparison ? 'master-video-compare' : 'master-video'} aria-label={(comparison ? 'Comparaison' : 'Master') + ' version ' + version.version} src={mediaUrl(version.version)} onError={() => setMediaErrors((values) => values.includes(version.version) ? values : [...values, version.version])} />{mediaErrors.includes(version.version) ? <p className="error" role="alert">Lecture indisponible pour la version {version.version}. Les autres versions restent accessibles ; réessayez le téléchargement ou rechargez le projet.</p> : null}</div>; }
  const versionControls = <><div className={studio ? 'two-col studio-version-controls' : 'two-col'}><label className="label">{studio ? 'Version de la vidéo' : 'Version consultée'}<select className="input" data-testid="version-select" value={viewed.version} onChange={(event) => { setSelected(Number(event.target.value)); setCompare(null); studio?.onModeChange('video'); }}>{versions.map((version) => <option key={version.id} value={version.version}>Version {version.version}{studio ? '' : ' · QA ' + (version.qaStatus ?? 'NOT_RUN')}</option>)}</select></label><label className="label">Comparer avec<select className="input" data-testid="compare-version" aria-describedby={versions.length < 2 ? 'compare-help' : undefined} value={compared?.version ?? ''} disabled={versions.length < 2} onChange={(event) => { setCompare(event.target.value ? Number(event.target.value) : null); studio?.onModeChange('video'); }}><option value="">{studio ? 'Aucune' : 'Sans comparaison'}</option>{versions.filter((version) => version.id !== viewed.id).map((version) => <option key={version.id} value={version.version}>Version {version.version}{studio ? '' : ' · QA ' + (version.qaStatus ?? 'NOT_RUN')}</option>)}</select></label></div>{versions.length < 2 ? <p className="hint" id="compare-help">Une deuxième version est nécessaire pour comparer.</p> : null}</>;
  const preview = <>
    <div className="section-head"><div><p className="eyebrow">{bundle.context.name} · {bundle.project.title}</p><h2 id="preview-heading" tabIndex={-1}>{studio ? 'Aperçu de la création' : 'Résultat et livraison'}</h2></div><span className="pill" data-testid="master-version">Master v{viewed.version}</span></div>
    {previewSwitch}
    {!studio ? versionControls : null}
    {studio && showScene ? <ScenePreview projectId={bundle.project.id} scene={studio.scene} /> : <div className={compared ? 'delivery-compare' : 'delivery-preview'}>{player(viewed)}{compared ? player(compared, true) : null}</div>}
    {studio ? versionControls : null}
    {scenes}
  </>;
  const finalization = <>
    <p>Version courante : <strong>v{latest.version}</strong>. Version approuvée courante : <strong data-testid="current-approved-version">{exactApproval(latest) ? 'v' + latest.version : 'aucune'}</strong>. {bundle.project.status === 'producing' ? 'Une nouvelle production est en cours ; le résultat précédent reste disponible.' : ''}</p>
    {!isCurrent ? <p className="context-completeness">Vous consultez une ancienne version. Son éventuelle approbation historique n’autorise pas le transfert du résultat courant.</p> : null}
    {blocked ? <p className="context-completeness">Une modification ou une action est en cours dans le projet. Relisez et enregistrez avant d’approuver ou transférer.</p> : null}
    {error ? <p className="error" role="alert" data-testid="delivery-error">{error}</p> : null}{message?.versionId === viewed.id && message.masterId === latest.id ? <p role="status" data-testid="delivery-message">{message.text}</p> : null}
    {versions.length < 2 ? <p className="hint">Une seule version disponible. Les versions suivantes apparaîtront après une production ou une correction réussie.</p> : null}
    <div className="actions"><button type="button" className="btn btn-primary" data-testid="download-master" disabled={!!busy} onClick={() => void download()}>{busy === 'download' ? 'Préparation du fichier…' : 'Télécharger le MP4 v' + viewed.version}</button><span className="hint">Télécharger conserve l’état d’approbation et de transfert.</span></div>
    <section className="stack" aria-labelledby="qa-heading"><h3 id="qa-heading" tabIndex={-1}>Qualité et approbation</h3><p data-testid="qa-status">QA {viewed.qaStatus ?? 'NOT_RUN'} · version consultée v{viewed.version}</p>
      {viewed.qaStatus !== 'PASS' ? <p className="error" role="alert">La QA de cette version n’est pas validée. Examinez les contrôles et corrigez le résultat avant de l’approuver.</p> : null}
      <details><summary>Contrôles QA de la version consultée</summary><ul className="delivery-checks" data-testid="qa-checks">{checks.map((check, index) => <li key={check.name + index}><strong>{check.status} · {check.name}</strong><p>{check.detail}</p></li>)}</ul>{!checks.length ? <p>Aucun détail QA disponible.</p> : null}</details>
      <p className="hint">La QA est technique. Elle ne certifie pas les licences ni la conformité créative. Les contrôles ne donnent pas de Scene ID structuré : aucune scène à corriger n’est choisie automatiquement.</p>
      {correct ? <button type="button" className="btn btn-ghost" onClick={correct}>Revenir à la correction par Scene ID</button> : <Link className="text-link" href={'/projects/' + bundle.project.id + '#correction-heading'}>Corriger dans le projet</Link>}
      <p data-testid="viewed-approval">Approbation de la version consultée : {viewed.approval?.invalidatedAt ? 'invalidée par une nouvelle version' : exactApproval(viewed) ? (isCurrent ? 'valide pour la version courante' : 'historique uniquement') : 'non approuvée'}.</p>
      {viewed.approval?.invalidatedAt ? <p data-testid="approval-invalidated">Cette approbation est obsolète et ne permet aucun transfert courant.</p> : null}
      {exactApproval(viewed) ? <p data-testid="approval-status">Master approuvé v{viewed.version} · checksum exact {viewed.checksum}</p> : <button type="button" className="btn btn-secondary" data-testid="approve" disabled={!canAct || !isCurrent || viewed.qaStatus !== 'PASS'} onClick={() => void mutate('approve')}>{busy === 'approve' ? 'Approbation…' : 'Approuver le master v' + viewed.version}</button>}
      {!isCurrent ? <p className="hint">Sélectionnez la version courante pour approuver et transférer.</p> : null}
    </section>
    <section className="stack" aria-labelledby="delivery-transfer-heading"><h3 id="delivery-transfer-heading">Transfert et publication</h3>
      {viewed.approval?.transfer ? <p data-testid="transfer-status">Transfert {viewed.approval.transfer.provider} · {viewed.approval.transfer.status}{!isCurrent || !exactApproval(viewed) ? ' · historique, lié à cette version uniquement' : ''}</p> : <p>Aucun transfert enregistré pour cette version.</p>}
      {isCurrent && exactApproval(viewed) && !viewed.approval?.transfer ? <button type="button" className="btn btn-secondary" data-testid="transfer" disabled={!canAct} onClick={() => void mutate('transfer')}>{busy === 'transfer' ? 'Transfert…' : 'Transférer la version approuvée vers Postiz MOCK'}</button> : null}
      <p>Postiz MOCK : aucun envoi réseau ni publication réelle. Un transfert confirmé ne signifie pas publié. La publication n’est pas disponible dans cette version.</p>
    </section>
    <details><summary>Provenance et anciennes versions ({versions.length})</summary><p>Chaque version reste identifiée par son checksum. Les lecteurs et le téléchargement utilisent la version choisie.</p><ol className="delivery-history">{versions.map((version) => <li key={version.id}><div><strong>v{version.version} · QA {version.qaStatus ?? 'NOT_RUN'}</strong><p>{version.createdAt}</p><p>Approbation : {version.approval?.invalidatedAt ? 'invalidée' : exactApproval(version) ? (version.id === latest.id ? 'courante' : 'historique') : 'absente'}</p><code>{version.checksum}</code></div><div className="actions"><button type="button" className="btn btn-ghost" onClick={() => showVersion(version.version)}>Consulter v{version.version}</button>{version.id !== viewed.id ? <button type="button" className="btn btn-ghost" onClick={() => { setCompare(version.version); studio?.onModeChange('video'); document.getElementById('preview-heading')?.focus(); }}>Comparer avec v{version.version}</button> : null}</div></li>)}</ol></details>
    <details><summary>Autres destinations et déclinaisons</summary><p>La génération de déclinaisons et les formats Reel, image unique, carrousel et motion ne sont pas qualifiés. Aucun bouton ne simule leur production.</p><p>Un nouveau projet peut réutiliser ce contexte, mais ne copie ni le média ni le brief et exige sa propre préparation.</p><Link className="text-link" href={'/projects/new?context=' + bundle.context.id}>Préparer un autre projet avec ce contexte</Link></details>
  </>;
  return layout(preview, finalization);
}
