'use client';
import {useWorkspace} from './WorkspacePreferences';
import { useEffect, useState } from 'react';
import { MediaGenerationPanel } from './MediaGenerationPanel';
import { CreativeActionPanel } from './CreativeActionPanel';
import { FormatGuide, type Destination } from './FormatGuide';
import { StudioCanvas } from './StudioCanvas';
import { StudioInspector } from './StudioInspector';
import { StudioDelivery } from './StudioDelivery';
import { StudioTimeline } from './StudioTimeline';
import { StudioRegenerate } from './StudioRegenerate';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { useStudioHistory } from '../lib/useStudioHistory';
import { useStudioPreview } from '../lib/useStudioPreview';
import { useStudioVideoPreview } from '../lib/useStudioVideoPreview';
import { clearCreativeDraft, readCreativeDraft, writeCreativeDraft, type CreativeDraft } from '../lib/studioDraftStore';
import { applyChannelPreset, compatiblePresets, defaultPreset, CHANNEL_PRESETS } from '../lib/studioChannels';
import { alignLayers, clampLayer, distributeLayers, specWithLayers } from '../lib/studioGeometry';
import { outputSize, platformSchema, productionCapability, readableInk, studioExportExtension, creativeSpec, isVideoOutput, type CreativeSpec, type CreativeLayer } from '@vululu/contracts';
import { api, apiResponse, postJson, type ProjectBundle } from '../lib/api';
import type { StudioAlignMode, StudioLayerSpec, StudioRevision } from '../lib/studioTypes';

type RenderStatus = { revision: number; state: string; reason: string | null; progress: number };

type Rev = { version: number; approvedAt: string | null };
type Revision = Rev & {
  spec: CreativeSpec;
  manifest: { approvalSha256?: string; master: { sha256: string } } | null;
};
type Source = { assetId?: string; mimeType?: string; license?: string; provenance?: string; sizeBytes?: number; metadata?: { width?: number; height?: number; duration?: number }; id: string; name: string; kind: string };
const copy = (text: string, role: 'headline' | 'body' | 'cta'): CreativeLayer => ({
  type: 'text',
  role,
  text,
  x: 0.08,
  y: role === 'cta' ? 0.82 : 0.59,
  w: 0.84,
  h: role === 'cta' ? 0.12 : 0.2,
  size: role === 'cta' ? 32 : 52,
  bold: true,
  color: '#ffffff',
  opacity: 1
});
const image = (a: Source): CreativeLayer => ({
  type: 'image',
  versionId: a.id,
  x: a.kind === 'logo' ? 0.72 : 0,
  y: a.kind === 'logo' ? 0.04 : 0,
  w: a.kind === 'logo' ? 0.24 : 1,
  h: a.kind === 'logo' ? 0.16 : 0.55,
  fit: a.kind === 'logo' ? 'contain' : 'cover',
  gravity: 'centre',
  opacity: 1
});
function NumberField({
  label,
  value,
  change,
  step = 1
}: {
  label: string;
  value: number;
  change: (n: number) => void;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        className="input"
        type="number"
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
}
export function CreativeEditor({ bundle, serverHead, serverRenders, calendarSource }: {
  bundle: ProjectBundle; serverHead?: number; serverRenders?: { id: string; revision: number; state: string }[]; calendarSource?: Destination
}) {
  const {t}=useWorkspace();
  const base = '/api/projects/' + encodeURIComponent(bundle.project.id) + '/creative';
  const projectId = bundle.project.id;
  const [versions, setVersions] = useState<Rev[]>([]);
  const [view, show] = useState<Revision | null>(null);
  const [expected, setExpected] = useState(0);
  const [assets, allMedia] = useState<Source[]>([]),
    [items, destinations] = useState<Destination[]>([]);
  const [sources, library] = useState<Source[]>([]),
    [confirmed, setConfirmed] = useState<string[]>([]),
    [index, focus] = useState(0),
    [busy, work] = useState(false),
    [error, fail] = useState(''),
    [notice, notify] = useState(''),
    [dirty, mark] = useState(false);
  const [selected, select] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const studio = useStudioHistory(null);
  const spec = studio.spec;
  const scene = spec?.scenes[index] ?? null;
  const { preview, refresh: refreshPreview } = useStudioPreview(base, spec, scene, open);
  const videoOutput = isVideoOutput(spec?.delivery?.kind);
  const { preview: videoPreview, refresh: refreshVideoPreview } = useStudioVideoPreview(base, spec, Boolean(open && spec && videoOutput));
  const [draft, setDraft] = useState<CreativeDraft | null>(null);
  const [draftNotice, setDraftNotice] = useState('');
  const [draftStored, setDraftStored] = useState(false);
  const selectedVersion = view?.version;
  const hasManifest = !!view?.manifest;
  const serverRender = serverRenders?.find((job) => job.revision === selectedVersion);
  const renderSignal = serverRender ? `${serverRender.id}:${serverRender.state}` : '';
  const [render, setRender] = useState<RenderStatus | null>(null);
  const [renderRefresh, refreshRender] = useState(0);
  const renderState = render?.revision === selectedVersion ? render : null;
  const [scenePreview, setScenePreview] = useState<{ url: string; spec: CreativeSpec; index: number } | null>(null);
  const [timeline, travel] = useState<{ head: number; past: number[]; future: number[] }>({
    head: 0,
    past: [],
    future: []
  });
  const channel = spec?.delivery
    ? defaultPreset(spec.delivery.platform, spec.delivery.kind, spec.width, spec.height, spec.safeArea)
    : undefined;
  const presets = compatiblePresets(spec?.scenes.length ?? 1);
  const past = timeline.head === expected ? timeline.past : versions.slice(1).map((v) => v.version);
  const future = timeline.head === expected ? timeline.future : [];

  useEffect(() => {
    if (!selectedVersion || hasManifest || dirty) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const status = await api<Omit<RenderStatus, 'revision'>>(`${base}/${selectedVersion}/render`);
        if (stopped) return;
        setRender({ ...status, revision: selectedVersion });
        if (status.state === 'succeeded') {
          const result = await api<Revision>(`${base}/${selectedVersion}`);
          if (!stopped) show((current) => current?.version === selectedVersion ? result : current);
          return;
        }
        if (status.state === 'idle' || status.state === 'failed' || status.state === 'cancelled') return;
      } catch {
        if (!stopped) setRender({ revision: selectedVersion, state: 'offline', reason: 'Suivi indisponible. Nouvelle tentative automatique.', progress: 0 });
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [base, selectedVersion, hasManifest, dirty, renderRefresh, renderSignal]);
  useEffect(
    () => () => {
      if (scenePreview) URL.revokeObjectURL(scenePreview.url);
    },
    [scenePreview]
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!spec || !dirty) return;
    const timer = setTimeout(() => {
      setDraftStored(writeCreativeDraft(projectId, expected, spec));
    }, 700);
    return () => clearTimeout(timer);
  }, [spec, dirty, expected, projectId]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    work(true);
    fail('');
    try {
      await fn();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      work(false);
    }
  }
  function set(next: CreativeSpec) {
    studio.commit(next);
    mark(true);
    setDraft(null);
  }
  function display(r: Revision) {
    show(r);
    studio.reset(r.spec);
    focus(0);
    select([]);
    mark(false);
  }
  function checkDraft(version: number) {
    setDraft(null);
    setDraftNotice('');
    const stored = readCreativeDraft(projectId, version);
    if (stored.state === 'current') setDraft(stored.draft);
    else if (stored.state === 'stale')
      setDraftNotice(`Une copie locale plus ancienne (v${stored.draft.expectedVersion}, ${new Date(stored.draft.savedAt).toLocaleString('fr-FR')}) n'a pas été appliquée : elle ne correspond pas à la révision affichée.`);
  }
  async function load() {
    const [revs, assets, selectedAssets, linked] = await Promise.all([
      api<Rev[]>(base),
      api<{ items: { kind: string; versions: (Omit<Source, 'kind'> & { mimeType: string })[] }[] }>(
        '/api/contexts/' + bundle.context.id + '/assets'
      ),
      api<{ versionIds: string[] }>(`/api/projects/${bundle.project.id}/assets`),
      api<Destination[]>(base + '/destinations')
    ]);
    const all = assets.items.flatMap((a) =>
      a.versions.filter((v) => v.mimeType.startsWith('image/')).map((v) => ({ ...v, kind: a.kind }))
    );
    destinations(linked);
    allMedia(assets.items.flatMap((a) => a.versions.map((v) => ({ ...v, kind: a.kind }))));
    library(all);
    setConfirmed(selectedAssets.versionIds);
    setVersions(revs);
    setExpected(revs[0]?.version ?? 0);
    if (revs.length) {
      display(await api<Revision>(base + '/' + revs[0].version));
      checkDraft(revs[0].version);
      return;
    }
    const chosen = all.filter((a) => selectedAssets.versionIds.includes(a.id)),
      photos = chosen.filter((a) => a.kind !== 'logo'),
      logos = chosen.filter((a) => a.kind === 'logo');
    const target = (calendarSource && linked.find((item) => item.id === calendarSource.id)) ?? (linked.length === 1 ? linked[0] : undefined);
    const platform = platformSchema.parse(bundle.project.platform);
    const calendarVariant = target?.variants.find((v) => v.platform === platform && v.format === bundle.project.format);
    const kind = productionCapability(bundle.project.format)?.studio ?? (calendarVariant && bundle.project.format === 'Video' ? 'short' : undefined);
    const seed = { sceneKey: 'SCENE-001', title: bundle.project.title,
      durationSeconds: bundle.brief?.settings?.defaultSceneDurationSeconds ?? bundle.project.sceneDurationSeconds };
    const seeds = bundle.scenes.length ? bundle.scenes : [seed,
      ...(kind === 'carousel' || bundle.project.format === 'Video' ? [{ ...seed, sceneKey: 'SCENE-002', title: 'En savoir plus' }] : [])
    ];
    const ratio = bundle.brief?.settings?.ratio ?? '9:16';
    const width = ratio === '16:9' ? 1920 : 1080,
      height = ratio === '9:16' ? 1920 : ratio === '4:5' ? 1350 : 1080;
    studio.reset({
      schemaVersion: 1,
      width: kind ? outputSize[kind][0] : width,
      height: kind ? outputSize[kind][1] : height,
      ...(kind ? { delivery: { kind, platform, ...(target && calendarVariant ? { calendar: { itemId: target.id, version: target.version } } : {}) } } : {}),
      safeArea: 0.05,
      brand: { background: bundle.context.colorPrimary, accent: bundle.context.colorSecondary },
      scenes: (kind === 'square' || kind === 'story' ? seeds.slice(0,1) : seeds).map((s, i) => ({
        key: s.sceneKey,
        seconds: s.durationSeconds,
        layers: [
          ...(photos.length ? [image(photos[i % photos.length])] : []),
          ...logos.slice(0, 1).map(image),
          ...('description' in s && typeof s.description === 'string' && s.description.trim()
            ? [
                { ...copy(s.title, 'headline'), y: 0.57, h: 0.1 },
                { ...copy(s.description, 'body'), y: 0.69, h: 0.11, size: 28, bold: false }
              ]
            : [copy(s.title, 'headline')]),
          copy(bundle.brief?.cta || calendarVariant?.cta || 'Nous contacter', 'cta')
        ]
      }))
    });
    focus(0);
    select([]);
    mark(true);
    checkDraft(0);
  }
  function change(next: CreativeSpec | ((current: CreativeSpec) => CreativeSpec)) {
    if (!spec) return;
    set(typeof next === 'function' ? next(spec) : next);
  }
  function layers(ls: StudioLayerSpec[]) {
    if (spec && scene) change(specWithLayers(spec, index, ls));
  }
  function update(i: number, patch: Partial<CreativeLayer>) {
    if (scene) layers(scene.layers.map((l, j) => (j === i ? ({ ...l, ...patch } as CreativeLayer) : l)));
  }
  async function step(back: boolean) {
    const v = (back ? past : future)[0];
    if (!v) return;
    const r = await postJson<Revision>(`${base}/${v}/restore`, { expectedVersion: expected });
    await sync(r);
    travel({
      head: r.version,
      past: back ? past.slice(1) : [expected, ...past],
      future: back ? [expected, ...future] : future.slice(1)
    });
  }
  async function sync(r: Revision) {
    travel({ head: r.version, past: expected ? [expected, ...past] : [], future: [] });
    display(r);
    setExpected(r.version);
    setVersions(await api<Rev[]>(base));
  }
  function setScene(index2: number) {
    focus(index2);
    select([]);
  }
  function beginGesture() {
    studio.begin();
  }
  function endGesture() {
    studio.end();
    mark(true);
  }
  function canvasChange(next: StudioLayerSpec[], mode: 'gesture' | 'commit') {
    if (!spec) return;
    const value = specWithLayers(spec, index, next);
    if (mode === 'gesture') studio.update(value);
    else { studio.commit(value); mark(true); setDraft(null); }
  }
  function align(mode: StudioAlignMode) {
    if (!spec || !scene || !selected.length) return;
    change(specWithLayers(spec, index, alignLayers(scene.layers, selected, mode, spec.safeArea, false)));
  }
  function distribute(axis: 'x' | 'y') {
    if (!spec || !scene || selected.length < 3) return;
    change(specWithLayers(spec, index, distributeLayers(scene.layers, selected, axis, spec.safeArea)));
  }
  function changeChannel(presetId: string) {
    if (!spec) return;
    const preset = CHANNEL_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    try {
      const result = applyChannelPreset(spec, preset);
      change(result.spec);
      if (result.spec.scenes.length !== spec.scenes.length) setScene(0);
      notify(result.note || `Repère ${preset.label} appliqué : ${preset.width} × ${preset.height}.`);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Repère de canal indisponible.');
    }
  }
  function selectLayer(i: number, additive: boolean) {
    if (i < 0) { select([]); return; }
    if (!additive) { select([i]); return; }
    select((current) => current.includes(i) ? current.filter((value) => value !== i) : [...current, i]);
  }
  function saveRevision() {
    if (!spec) return;
    const valid = creativeSpec.safeParse(spec);
    if (!valid.success) {
      fail(valid.error.issues.map((v) => v.message).join(' · '));
      return;
    }
    void action(async () => {
      const r = await postJson<Revision>(base, { expectedVersion: expected, spec: valid.data });
      clearCreativeDraft(projectId);
      setDraft(null);
      setDraftNotice('');
      await sync(r);
      notify(`Révision v${r.version} enregistrée comme brouillon éditable.`);
    });
  }
  async function renderMaster() {
    if (!view) return;
    const result = await postJson<Omit<RenderStatus, 'revision'>>(`${base}/${view.version}/render`, {});
    setRender({ ...result, revision: view.version });
    refreshRender((n) => n + 1);
  }
  async function cancelRender() {
    if (!view) return;
    const result = await postJson<Omit<RenderStatus, 'revision'>>(`${base}/${view.version}/render/cancel`, {});
    setRender({ ...result, revision: view.version });
    refreshRender((n) => n + 1);
    notify(result.state === 'cancelled'
      ? 'Rendu annulé côté serveur.'
      : 'Annulation demandée : le rendu s’arrêtera à la fin de la scène en cours.');
  }
  async function approveVersion(checksum: string) {
    if (!view) return;
    const r = await postJson<Revision>(`${base}/${view.version}/approve`, { checksum });
    display(r);
    setVersions(await api<Rev[]>(base));
    notify(`Version v${r.version} approuvée pour le checksum exact affiché.`);
  }
  async function viewVersion(version: number) {
    display(await api<Revision>(base + '/' + version));
    checkDraft(version);
  }
  async function restoreVersion(version: number) {
    const r = await postJson<Revision>(`${base}/${version}/restore`, { expectedVersion: expected });
    await sync(r);
    notify(`La révision v${version} a été reprise comme nouvelle révision v${r.version} (aucun écrasement).`);
  }
  function undo() {
    studio.undo();
    mark(true);
    setDraft(null);
  }
  function redo() {
    studio.redo();
    mark(true);
    setDraft(null);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) studio.redo(); else studio.undo();
        mark(true);
      } else if (key === 'y') {
        event.preventDefault();
        studio.redo();
        mark(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, studio.redo, studio.undo]);
  const linked = spec?.delivery?.calendar;
  const calendarTarget = (calendarSource && items.find((item) => item.id === calendarSource.id)) ?? (items.length === 1 ? items[0] : undefined);
  const variant = calendarTarget?.variants.find((v) => v.platform === (spec?.delivery?.platform ?? bundle.project.platform));
  const targetKind = variant?.format === 'Video' ? 'short' : variant && productionCapability(variant.format)?.studio;
  const sameFormat = targetKind && (spec?.delivery?.kind === targetKind || (targetKind === 'square' && spec?.delivery?.kind === 'portrait'));
  // Références admissibles pour une génération de clip (mêmes règles que le panneau média existant).
  const referenceImages = sources.filter((v) => ['image/png', 'image/jpeg'].includes(v.mimeType ?? '') &&
    ['internal', 'commercial'].includes(v.license ?? '') && (v.sizeBytes ?? Infinity) <= 3 * 1024 * 1024 &&
    (v.metadata?.width ?? 0) >= 320 && (v.metadata?.height ?? 0) >= 320 &&
    (v.metadata?.width ?? 0) / (v.metadata?.height ?? 1) >= 0.5 &&
    (v.metadata?.width ?? 0) / (v.metadata?.height ?? 1) <= 2);
  // Le serveur refuse un clip dont le ratio ne suit pas l'orientation du cadre.
  const clipSize: '1280:720' | '720:1280' = spec && spec.width / spec.height >= 1.4 ? '1280:720' : '720:1280';
  const currentRenderState = renderState;
  // P09B : opérations audio réelles, montées dans l'inspecteur pour les sorties vidéo uniquement.
  const audioOperations = {
    project: projectId,
    base,
    revision: expected,
    approvedVersion: view?.approvedAt ? view.version : null,
    ready: !dirty && Boolean(view && view.version === expected),
    run: action,
    onApplied: async (next: StudioRevision) => {
      await sync(next);
      await load();
    }
  };
  return (
    <details
      className="card stack studio-editor"
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open && !spec && !busy) void action(load);
      }}
    >
      <summary id="composition-heading">{t("Composition et versions","Composition and versions")}</summary>
      {linked && <p className="hint">Composition liée au calendrier · <a href={`/calendar?item=${encodeURIComponent(linked.itemId)}`}>Ouvrir le contenu</a></p>}
      {spec && calendarTarget && sameFormat && (linked?.itemId !== calendarTarget.id || linked.version !== calendarTarget.version) &&
        <button type="button" className="btn btn-secondary" onClick={() => change({ ...spec, delivery: { ...spec.delivery!, calendar: { itemId: calendarTarget.id, version: calendarTarget.version } } })}>
          Lier au contenu actuel du calendrier
        </button>}
      {spec&&serverHead!==undefined&&serverHead>expected&&<p role="status">La version v{serverHead} est disponible. Votre saisie reste intacte ; rechargez pour travailler sur la dernière version.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p className="toast toast--success" role="status">{notice}</p>}
      {draftNotice && <p className="hint" role="status">{draftNotice} <button type="button" className="text-link" onClick={() => { clearCreativeDraft(projectId); setDraftNotice(''); }}>Effacer cette copie locale</button></p>}
      {draft && !dirty && (
        <div className="context-completeness" role="status">
          <p><strong>Copie locale non enregistrée</strong> du {new Date(draft.savedAt).toLocaleString('fr-FR')} · base v{draft.expectedVersion}. Elle ne remplace aucune révision serveur.</p>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => { studio.commit(draft.spec); mark(true); setDraft(null); notify('Copie locale chargée comme brouillon à relire.'); }}>Reprendre la copie locale</button>
            <button type="button" className="btn btn-ghost" onClick={() => { clearCreativeDraft(projectId); setDraft(null); }}>Ignorer et effacer</button>
          </div>
        </div>
      )}
      <fieldset disabled={busy} className="stack">
        <div className="studio-editor-head">
          <div>
            <p className="hint" role="status">{dirty ? 'Modifications non enregistrées · copie locale de secours ' + (draftStored ? 'active' : 'en attente') : view ? `Révision v${view.version}${view.approvedAt ? ' · approuvée' : ' · brouillon'}` : 'Nouvelle composition'}</p>
          </div>
          <div className="studio-editor-head-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                if (!dirty || confirm('Abandonner les modifications locales ?')) void action(load);
              }}
            >
              {t("Recharger la dernière version","Reload latest version")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty}
              onClick={() => saveRevision()}
            >
              {t("Enregistrer une nouvelle révision","Save new revision")}
            </button>
          </div>
        </div>
        {spec && scene ? (
          <>
            <div className="studio-toolbar" role="toolbar" aria-label="Édition de la composition">
              <div className="studio-toolbar-group" aria-label="Historique local">
                <button type="button" className="btn btn-ghost btn-small" disabled={!studio.canUndo} onClick={undo} title="Annuler la dernière modification locale (Ctrl+Z)">Annuler</button>
                <button type="button" className="btn btn-ghost btn-small" disabled={!studio.canRedo} onClick={redo} title="Rétablir la modification locale (Ctrl+Maj+Z)">Rétablir</button>
              </div>
              <div className="studio-toolbar-group" aria-label="Alignement">
                {([['left', 'Gauche'], ['hcenter', 'Centre'], ['right', 'Droite'], ['top', 'Haut'], ['vcenter', 'Milieu'], ['bottom', 'Bas']] as [StudioAlignMode, string][]).map(([mode, label]) => (
                  <button key={mode} type="button" className="btn btn-ghost btn-small" disabled={!selected.length} onClick={() => align(mode)}>Aligner {label.toLowerCase()}</button>
                ))}
                <button type="button" className="btn btn-ghost btn-small" disabled={selected.length < 3} onClick={() => distribute('x')}>Répartir horizontalement</button>
                <button type="button" className="btn btn-ghost btn-small" disabled={selected.length < 3} onClick={() => distribute('y')}>Répartir verticalement</button>
              </div>
              <p className="hint studio-toolbar-hint" role="status">{selected.length ? selected.length + ' calque(s) sélectionné(s)' : 'Cliquez un calque sur le canvas pour l’éditer.'}</p>
            </div>
            <div className="studio-workspace studio-editor-workspace">
              <section className="studio-canvas-pane" aria-label="Espace de composition">
                <StudioCanvas
                  spec={spec}
                  sceneIndex={index}
                  selected={selected}
                  sources={sources}
                  channel={channel}
                  preview={preview}
                  busy={busy}
                  onSelect={selectLayer}
                  onGestureStart={beginGesture}
                  onGestureEnd={endGesture}
                  onChange={canvasChange}
                  onRefreshPreview={refreshPreview}
                />
                <StudioTimeline
                  spec={spec}
                  sceneIndex={index}
                  busy={busy}
                  sources={assets}
                  onSpec={change}
                  onSelect={setScene}
                  onNotice={notify}
                />
                {videoOutput ? (
                  <figure className="studio-video-preview" aria-labelledby="studio-video-preview-label">
                    <figcaption id="studio-video-preview-label">Aperçu vidéo · 20 s maximum</figcaption>
                    {videoPreview.url ? (
                      <video
                        controls
                        preload="metadata"
                        src={videoPreview.url}
                        aria-label="Aperçu vidéo borné à 20 secondes, produit par le serveur"
                      />
                    ) : null}
                    <p
                      className="hint"
                      role={videoPreview.state === 'error' || videoPreview.state === 'invalid' ? 'alert' : 'status'}
                    >
                      {videoPreview.state === 'loading'
                        ? 'Préparation de l’aperçu vidéo par le serveur…'
                        : videoPreview.state === 'invalid'
                          ? 'Aperçu vidéo impossible : ' + videoPreview.message
                          : videoPreview.state === 'error'
                            ? 'Aperçu vidéo indisponible : ' + videoPreview.message
                            : videoPreview.state === 'ready'
                              ? 'Aperçu vidéo généré par le serveur' +
                                (videoPreview.message ? ' · ' + videoPreview.message : '') + '.'
                              : 'Aperçu vidéo en attente de la composition.'}
                      {videoPreview.state === 'error' ? (
                        <>
                          {' '}
                          <button type="button" className="text-link" onClick={refreshVideoPreview}>
                            Réessayer
                          </button>
                        </>
                      ) : null}
                    </p>
                    <p className="hint">
                      Cet aperçu n’est pas le rendu final : il est borné à 20 s, ne crée aucune révision et ne
                      remplace pas le master scellé.
                    </p>
                  </figure>
                ) : null}
              </section>
              <div className="studio-editor-side">
                <div className="card studio-inspector-shell">
                  <StudioInspector
                    spec={spec}
                    sceneIndex={index}
                    selected={selected}
                    sources={sources}
                    media={assets}
                    confirmedIds={confirmed}
                    presets={presets}
                    channel={channel}
                    busy={busy}
                    onSpec={change}
                    onSelect={selectLayer}
                    onChannel={changeChannel}
                    onNotice={notify}
                    audio={audioOperations}
                  />
                </div>
                {!dirty && view?.version === expected ? (
                  <StudioRegenerate
                    key={'regenerate:' + expected + ':' + scene.key}
                    project={projectId}
                    revision={expected}
                    sceneKey={scene.key}
                    sceneSeconds={scene.seconds}
                    clipSize={clipSize}
                    video={videoOutput}
                    assets={referenceImages}
                    run={action}
                    onPlaced={async () => {
                      await load();
                    }}
                    onNotice={notify}
                  />
                ) : (
                  <p className="hint">Enregistrez la composition pour activer la régénération ciblée.</p>
                )}
              </div>
            </div>
            <details className="studio-advanced card" open>
              <summary>Outils avancés · scènes, calques et actions ciblées</summary>
              <div className="stack">
                <FormatGuide
                  bundle={bundle}
                  assets={assets}
                  items={items}
                  apply={(fn) =>
                    void action(async () => {
                      const next = fn();
                      studio.reset(next);
                      focus(0);
                      select([]);
                      mark(true);
                    })
                  }
                />
                {bundle.project.campaignId && (
                  <a href={`/api/campaigns/${bundle.project.campaignId}/creative-package`} download>
                    Télécharger le lot de campagne
                  </a>
                )}
                {!dirty && view?.version === expected && (
                  <>
                    <MediaGenerationPanel
                      key={`media:${expected}:${scene.key}`}
                      project={bundle.project.id}
                      revision={expected}
                      sceneKey={scene.key}
                      images={referenceImages}
                      short={videoOutput && scene.seconds <= 5}
                      clipSize={videoOutput ? clipSize : undefined}
                      run={action}
                      reload={async () => {
                        await load();
                        focus(index);
                      }}
                    />
                    <CreativeActionPanel
                      key={`${expected}:${scene.key}`}
                      scene={scene}
                      project={bundle.project.id}
                      assets={sources}
                      version={expected}
                      run={action}
                      applied={async (key) => {
                        const r = await api<Revision>(base + '/' + (expected + 1));
                        await sync(r);
                        focus(r.spec.scenes.findIndex((s) => s.key === key));
                      }}
                    />
                    <div>
                      <button type="button" disabled={!past.length} onClick={() => void action(() => step(true))}>
                        Annuler la révision
                      </button>
                      <button
                        type="button"
                        disabled={!future.length}
                        onClick={() => void action(() => step(false))}
                      >
                        Rétablir la révision
                      </button>
                    </div>
                  </>
                )}
                {dirty && <p>Enregistrez la composition pour activer les actions ciblées.</p>}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    void action(async () => {
                      const response = await apiResponse(base + '/preview', {
                        method: 'POST',
                        body: JSON.stringify({ ...spec, scenes: [scene] })
                      });
                      setScenePreview({ url: URL.createObjectURL(await response.blob()), spec, index });
                    })
                  }
                >
                  Prévisualiser la scène
                </button>
                {scenePreview?.spec === spec && scenePreview.index === index && (
                  <img
                    src={scenePreview.url}
                    alt={'Aperçu du rendu de ' + scene.key}
                    style={{ maxWidth: '100%', maxHeight: 440, objectFit: 'contain' }}
                  />
                )}
                <div className="two-col">
                  <label>
                    Format
                    <select
                      className="input"
                      disabled={!!spec.delivery}
                      value={spec.width + '/' + spec.height}
                      onChange={(e) => {
                        const [width, height] = e.target.value.split('/').map(Number);
                        change({ ...spec, width, height });
                      }}
                    >
                      {['1080/1920', '1080/1350', '1080/1080', '1920/1080', spec.width + '/' + spec.height]
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                    </select>
                  </label>
                  <NumberField
                    label="Marge sûre (0–0,2)"
                    value={spec.safeArea}
                    step={0.01}
                    change={(safeArea) => change({ ...spec, safeArea })}
                  />
                </div>
                {(['background', 'accent'] as const).map((k) => (
                  <label key={k}>
                    {k === 'accent' ? 'Couleur secondaire' : 'Fond'}
                    <input
                      type="color"
                      value={spec.brand[k]}
                      onChange={(e) => {
                        const color = e.target.value;
                        change({
                          ...spec,
                          brand: { ...spec.brand, [k]: color },
                          scenes: spec.scenes.map((s) => ({
                            ...s,
                            layers: s.layers.map((l) =>
                              l.type === 'text' && l.plate === spec.brand[k]
                                ? { ...l, plate: color, color: readableInk(color) }
                                : l
                            )
                          }))
                        });
                      }}
                    />
                  </label>
                ))}
                <label>
                  Timeline
                  <select className="input" value={index} onChange={(e) => setScene(+e.target.value)}>
                    {spec.scenes.map((s, i) => (
                      <option key={s.key} value={i}>
                        {i + 1} · {s.key} · {s.seconds} s
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <button
                    type="button"
                    disabled={!index}
                    onClick={() => {
                      const ss = [...spec.scenes];
                      [ss[index - 1], ss[index]] = [ss[index], ss[index - 1]];
                      change({ ...spec, scenes: ss });
                      setScene(index - 1);
                    }}
                  >
                    Avancer la scène
                  </button>{' '}
                  <button
                    type="button"
                    disabled={!!spec.delivery && spec.delivery.kind !== 'carousel' && !isVideoOutput(spec.delivery.kind)}
                    onClick={() => {
                      const n = Math.max(...spec.scenes.map((s) => Number(s.key.slice(6)))) + 1;
                      change({
                        ...spec,
                        scenes: [...spec.scenes, { ...scene, key: 'SCENE-' + String(n).padStart(3, '0') }]
                      });
                      setScene(spec.scenes.length);
                    }}
                  >
                    Dupliquer la scène
                  </button>{' '}
                  <button
                    type="button"
                    disabled={spec.scenes.length < 2}
                    onClick={() => {
                      change({ ...spec, scenes: spec.scenes.filter((_, i) => i !== index) });
                      setScene(0);
                    }}
                  >
                    Retirer la scène
                  </button>
                </div>
                {studioExportExtension(spec.delivery?.kind) === 'mp4' && <NumberField
                  label="Durée (secondes)"
                  value={scene.seconds}
                  step={0.5}
                  change={(seconds) =>
                    change({ ...spec, scenes: spec.scenes.map((s, i) => (i === index ? { ...s, seconds } : s)) })
                  }
                />}
                {isVideoOutput(spec.delivery?.kind) && (
                  <label>
                    Clip de la bibliothèque
                    <select value={scene.clip?.versionId ?? ''} onChange={(event) => {
                      const versionId = event.target.value;
                      change({ ...spec, scenes: spec.scenes.map((s, i) => i === index
                        ? { ...s, clip: versionId ? { versionId, start: 0, height: s.clip?.height ?? 0.65 } : undefined }
                        : s) });
                    }}>
                      <option value="">Aucun clip</option>
                      {assets.filter((v) => v.mimeType === 'video/mp4' &&
                        (v.id === scene.clip?.versionId || (v.metadata?.duration ?? 0) + 0.001 >= scene.seconds))
                        .map((v) => <option key={v.id} value={v.id}>{v.name} · {v.metadata?.duration ?? '—'} s</option>)}
                    </select>
                  </label>
                )}
                {scene.clip && (
                  <NumberField
                    label="Début du clip (secondes)"
                    value={scene.clip.start}
                    step={0.5}
                    change={(start) =>
                      change({
                        ...spec,
                        scenes: spec.scenes.map((s, i) =>
                          i === index && s.clip ? { ...s, clip: { ...s.clip, start } } : s
                        )
                      })
                    }
                  />
                )}
                {spec.delivery?.audio && (
                  <NumberField
                    label="Volume de la piste (0–1)"
                    step={0.05}
                    value={spec.delivery.audio.gain}
                    change={(gain) =>
                      change({
                        ...spec,
                        delivery: { ...spec.delivery!, audio: { ...spec.delivery!.audio!, gain } }
                      })
                    }
                  />
                )}
                {scene.layers.some((l) => {
                  if (l.type !== 'image') return false;
                  const m = sources.find((a) => a.id === l.versionId)?.metadata;
                  return (
                    m?.width &&
                    m?.height &&
                    Math.max((l.w * spec.width) / m.width, (l.h * spec.height) / m.height) > 2
                  );
                }) && (
                  <p role="status">
                    Image agrandie de plus de 2× : vérifiez sa netteté dans l’aperçu ou choisissez une source plus
                    grande.
                  </p>
                )}
                {scene.layers.map((l, i) => (
                  <details key={scene.key + ':' + i}>
                    <summary>
                      Calque {i + 1} ·{' '}
                      {l.type === 'text' ? l.role : sources.find((s) => s.id === l.versionId)?.name || 'Image'}
                    </summary>
                    <div className="stack">
                      {l.type === 'text' ? (
                        <>
                          <label>
                            Texte
                            <textarea
                              className="input"
                              value={l.text}
                              onChange={(e) => update(i, { text: e.target.value })}
                            />
                          </label>
                          <label>
                            Police
                            <select
                              value={l.family ?? 'sans'}
                              onChange={(e) => update(i, { family: e.target.value as typeof l.family })}
                            >
                              <option value="sans">Sans sérif</option>
                              <option value="serif">Sérif</option>
                              <option value="monospace">Chasse fixe</option>
                            </select>
                          </label>
                          <NumberField
                            label="Corps"
                            value={l.size}
                            change={(size) =>
                              update(i, { size, minSize: l.minSize ? Math.min(size, l.minSize) : undefined })
                            }
                          />
                          <label>
                            Couleur
                            <input
                              type="color"
                              value={l.color}
                              onChange={(e) => update(i, { color: e.target.value })}
                            />
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={l.bold}
                              onChange={(e) => update(i, { bold: e.target.checked })}
                            />{' '}
                            Gras
                          </label>
                        </>
                      ) : (
                        <>
                          <label>
                            Cadrage
                            <select
                              value={l.fit}
                              onChange={(e) => update(i, { fit: e.target.value as typeof l.fit })}
                            >
                              <option value="cover">Remplir</option>
                              <option value="contain">Contenir</option>
                            </select>
                          </label>
                          <label>
                            Ancrage
                            <select
                              value={l.gravity}
                              onChange={(e) => update(i, { gravity: e.target.value as typeof l.gravity })}
                            >
                              {['centre', 'north', 'south', 'east', 'west'].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                        </>
                      )}
                      <div className="two-col">
                        {(['x', 'y', 'w', 'h', 'opacity'] as const).map((k, j) => (
                          <NumberField
                            key={k}
                            label={['X', 'Y', 'Largeur', 'Hauteur', 'Opacité'][j] + ' (0–1)'}
                            value={l[k]}
                            step={0.01}
                            change={(v) => update(i, { [k]: v })}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!i}
                        onClick={() => {
                          const ls = [...scene.layers];
                          [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]];
                          layers(ls);
                        }}
                      >
                        Reculer le calque
                      </button>
                      <button
                        type="button"
                        disabled={scene.layers.length < 2}
                        onClick={() => layers(scene.layers.filter((_, j) => i !== j))}
                      >
                        Retirer le calque
                      </button>
                    </div>
                  </details>
                ))}
                <label>
                  Ajouter une image de marque
                  <select
                    value=""
                    onChange={(e) => {
                      const a = sources.find((s) => s.id === e.target.value);
                      if (a) layers([...scene.layers, image(a)]);
                    }}
                  >
                    <option value="">Choisir une ressource</option>
                    {sources.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => layers([...scene.layers, clampLayer(copy('Votre texte', 'body'), spec.safeArea) as CreativeLayer])}>
                  Ajouter du texte
                </button>
              </div>
            </details>
            {view && !dirty ? (
              <>
                <StudioDelivery
                  base={base}
                  view={view}
                  versions={versions}
                  expectedVersion={expected}
                  dirty={dirty}
                  busy={busy}
                  renderState={currentRenderState}
                  onAction={action}
                  onRender={renderMaster}
                  onApprove={approveVersion}
                  onRestore={restoreVersion}
                  onView={viewVersion}
                  onCancel={() => action(cancelRender)}
                  onNotice={notify}
                />
              </>
            ) : (
              <p className="hint" id="creative-deliver">Enregistrez la composition pour activer le rendu, l’approbation exacte et l’export.</p>
            )}
          </>
        ) : null}
      </fieldset>
      {busy && <p role="status">Traitement en cours…</p>}
    </details>
  );
}
