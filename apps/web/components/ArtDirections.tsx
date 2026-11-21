'use client';

import { useEffect, useRef, useState } from 'react';
import type { CreativeSpec } from '@vululu/contracts';
import { api, apiResponse, postJson } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type Origin = 'generated' | 'refined' | 'alternative' | 'combined' | string;
type Decision = 'retained' | 'rejected';
type Direction = {
  version: number; label: string | null; origin: Origin | null; provenance: unknown;
  spec: CreativeSpec; createdAt: string; approvedAt: string | null;
};
type DirectionsPayload = {
  directions: Direction[]; decisions: Record<string, Decision>; created?: number[];
  selectedVersion: number | null; selectedAt?: string | null;
};
type HistoryRow = { version: number; createdAt: string; approvedAt: string | null };
const originLabels: Record<string, [string, string]> = {
  generated: ['Générée depuis le brainstorming', 'Generated from brainstorming'],
  refined: ['Affinée', 'Refined'],
  alternative: ['Alternative', 'Alternative'],
  combined: ['Combinaison', 'Combined']
};

function firstText(spec: CreativeSpec, role: 'headline' | 'body' | 'cta') {
  for (const scene of spec.scenes) for (const layer of scene.layers) {
    if (layer.type === 'text' && layer.role === role) return layer.text;
  }
  return '';
}

/** Directions artistiques persistées comme révisions (ADR-0035) : comparables, éditables, jamais approuvées par défaut. */
export default function ArtDirections({ projectId, onDirections, onSelected }: {
  projectId: string; onDirections?: (count: number) => void; onSelected?: (version: number | null) => void;
}) {
  const { t, locale } = useWorkspace();
  const base = '/api/projects/' + encodeURIComponent(projectId) + '/creative';
  const [directions, setDirections] = useState<Direction[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  /** P12-05 — pointeur serveur : seule source de la composition éditable du Studio. */
  const [chosen, setChosen] = useState<number | null>(null);
  const [head, setHead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false); setError('');
    void Promise.all([
      api<DirectionsPayload>(base + '/directions'),
      api<HistoryRow[]>(base)
    ]).then(([payload, history]) => {
      if (!active) return;
      setDirections(payload.directions); setDecisions(payload.decisions);
      setChosen(payload.selectedVersion ?? null);
      setHead(history[0]?.version ?? 0);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [base, reload]);
  useEffect(() => { onDirections?.(directions.length); }, [directions.length, onDirections]);
  useEffect(() => { onSelected?.(chosen); }, [chosen, onSelected]);
  useEffect(() => () => { Object.values(previewUrls.current).forEach((url) => URL.revokeObjectURL(url)); }, []);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(''); setNote('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t('Action impossible.', 'Action failed.')); }
    finally { setBusy(''); }
  }
  function generate(mode: 'generate' | 'alternative') {
    return act(mode, async () => {
      const payload = await postJson<DirectionsPayload>(base + '/directions', { requestId: crypto.randomUUID(), mode });
      setDirections(payload.directions); setDecisions(payload.decisions); setReload((value) => value + 1);
      setNote(mode === 'generate' ? t('Directions créées comme brouillons éditables.', 'Directions created as editable drafts.') : t('Nouvelles alternatives créées.', 'New alternatives created.'));
    });
  }
  function refine(version: number) {
    return act('refine-' + version, async () => {
      const payload = await postJson<DirectionsPayload>(base + '/directions', { requestId: crypto.randomUUID(), mode: 'refine', baseVersion: version });
      setDirections(payload.directions); setDecisions(payload.decisions); setReload((value) => value + 1);
      setNote(t('Direction affinée ajoutée à l’historique.', 'Refined direction appended to the history.'));
    });
  }
  function combine() {
    return act('combine', async () => {
      if (selected.length < 2) return;
      const payload = await postJson<DirectionsPayload>(base + '/directions', { requestId: crypto.randomUUID(), mode: 'combine', combineFrom: selected.slice(0, 2) });
      setDirections(payload.directions); setDecisions(payload.decisions); setSelected([]); setReload((value) => value + 1);
      setNote(t('Combinaison créée (structure et palette des deux directions).', 'Combination created (structure and palette from both directions).'));
    });
  }
  function decide(version: number, decision: Decision) {
    return act('decide-' + version, async () => {
      const payload = await postJson<{ decisions: Record<string, Decision> }>(base + '/' + version + '/direction', { decision });
      setDecisions(payload.decisions);
      setNote(decision === 'retained' ? t('Direction marquée comme retenue. Utilisez « Choisir cette direction » pour définir la composition du Studio.', 'Direction marked as retained. Use “Choose this direction” to define the Studio composition.') : t('Direction écartée ; elle reste dans l’historique et ne peut plus être choisie.', 'Direction rejected; it remains in the history and can no longer be chosen.'));
    });
  }
  function choose(version: number) {
    return act('choose-' + version, async () => {
      const payload = await postJson<DirectionsPayload>(base + '/directions/select', { version, expectedSelection: chosen });
      setDirections(payload.directions); setDecisions(payload.decisions); setChosen(payload.selectedVersion ?? null);
      setNote(t('Direction choisie : c’est désormais la composition éditée dans le Studio.', 'Direction chosen: it is now the composition edited in the Studio.'));
      setTimeout(() => document.getElementById('composition-heading')?.scrollIntoView({ block: 'start' }), 50);
    });
  }
  function revisit(version: number) {
    return act('revisit-' + version, async () => {
      if (version === head) { document.getElementById('composition-heading')?.scrollIntoView({ block: 'center' }); return; }
      await postJson(base + '/' + version + '/restore', { expectedVersion: head });
      setReload((value) => value + 1);
      setNote(t('Direction reprise dans l’éditeur comme nouvelle révision.', 'Direction restored in the editor as a new revision.'));
      setTimeout(() => document.getElementById('composition-heading')?.scrollIntoView({ block: 'center' }), 50);
    });
  }
  async function preview(direction: Direction) {
    if (previews[direction.version]) return;
    await act('preview-' + direction.version, async () => {
      const single = { ...direction.spec, scenes: [direction.spec.scenes[0]] };
      const response = await apiResponse(base + '/preview', { method: 'POST', body: JSON.stringify(single) });
      const url = URL.createObjectURL(await response.blob());
      previewUrls.current[direction.version] = url;
      setPreviews((current) => ({ ...current, [direction.version]: url }));
    });
  }
  function toggleSelected(version: number) {
    setSelected((current) => current.includes(version) ? current.filter((v) => v !== version) : current.length >= 2 ? [current[1], version] : [...current, version]);
  }
  const compared = selected.map((version) => directions.find((direction) => direction.version === version)).filter((direction): direction is Direction => !!direction);

  return <section className="card stack art-directions" data-vululu-theme="blue" data-testid="art-directions" aria-labelledby="art-directions-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Directions artistiques', 'Art directions')}</p>
        <h2 id="art-directions-heading">{t('Propositions créatives comparables', 'Comparable creative proposals')}</h2>
      </div>
      <div className="actions">
        {directions.length ? <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => void generate('alternative')}>{t('Nouvelles alternatives', 'New alternatives')}</button> : null}
        <button type="button" className="btn btn-primary btn-small" data-testid="directions-generate" disabled={!!busy} onClick={() => void generate('generate')}>{busy === 'generate' ? t('Création…', 'Creating…') : t('Proposer des directions', 'Propose directions')}</button>
      </div>
    </div>
    <p className="muted">{t('Chaque direction est un brouillon éditable, ancré dans votre dernier brainstorming, votre identité et vos ressources confirmées. Elle n’est ni approuvée ni publiée.', 'Each direction is an editable draft grounded in your latest brainstorming, identity and confirmed assets. It is neither approved nor published.')}</p>
    {error ? <div className="error" role="alert"><p>{error}</p><p className="hint">{t('Aucune direction partielle n’est enregistrée en cas d’échec.', 'No partial direction is saved on failure.')}</p></div> : null}
    {note ? <p className="toast toast--success" role="status">{note}</p> : null}
    {loading ? <p role="status">{t('Chargement des directions…', 'Loading directions…')}</p> : failed ? <div className="stack" role="alert"><p className="error">{t('Directions indisponibles.', 'Directions unavailable.')}</p><button type="button" className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('Réessayer', 'Retry')}</button></div> : !directions.length ? <div className="empty-state stack" data-testid="directions-empty">
      <h3>{t('Aucune direction pour l’instant', 'No direction yet')}</h3>
      <p className="muted">{t('Lancez le brainstorming, confirmez vos ressources, puis demandez deux à trois directions : elles apparaîtront ici, comparables et éditables.', 'Run brainstorming, confirm your assets, then request two or three directions: they will appear here, comparable and editable.')}</p>
      <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => void generate('generate')}>{busy === 'generate' ? t('Création…', 'Creating…') : t('Créer mes premières directions', 'Create my first directions')}</button>
    </div> : <>
      {selected.length === 2 ? <div className="card stack art-directions-compare" data-testid="directions-compare">
        <h3>{t('Comparaison côte à côte', 'Side-by-side comparison')}</h3>
        <div className="art-directions-compare-grid">
          {compared.map((direction) => <article key={direction.version} className="stack">
            <p className="eyebrow">{t('v', 'v')}{direction.version} · {direction.label ?? t('Sans libellé', 'Untitled')}</p>
            <p><span className="pill">{specKind(direction.spec)}</span> {direction.spec.width}×{direction.spec.height} · {direction.spec.scenes.length} {t('scène(s)', 'scene(s)')}</p>
            <p className="context-copy">{t('Titre : ', 'Headline: ')}{firstText(direction.spec, 'headline')}</p>
            <p className="hint">{t('Appel à l’action : ', 'Call to action: ')}{firstText(direction.spec, 'cta')}</p>
            <p className="hint">{t('Palette : ', 'Palette: ')}{direction.spec.brand.background} / {direction.spec.brand.accent}</p>
          </article>)}
        </div>
        <button type="button" className="btn btn-primary btn-small" disabled={!!busy} onClick={() => void combine()}>{t('Combiner ces deux directions', 'Combine these two directions')}</button>
        <p className="hint">{t('La combinaison reprend la structure de la première et la palette de la seconde.', 'The combination takes the first structure and the second palette.')}</p>
      </div> : null}
      <div className="asset-grid">
        {directions.map((direction) => <article key={direction.version} className="card stack art-direction" data-testid={'direction-' + direction.version}>
          <div className="section-head">
            <div>
              <p className="eyebrow">{t('Version ', 'Version ')}{direction.version} · {t(originLabels[direction.origin ?? 'generated']?.[0] ?? 'Direction', originLabels[direction.origin ?? 'generated']?.[1] ?? 'Direction')}</p>
              <h3>{direction.label ?? t('Sans libellé', 'Untitled')}</h3>
            </div>
            <div className="actions">
              {chosen === direction.version ? <span className="pill" data-testid="direction-chosen">{t('Composition du Studio', 'Studio composition')}</span> : null}
              {decisions[String(direction.version)] ? <span className="pill">{decisions[String(direction.version)] === 'retained' ? t('Retenue', 'Retained') : t('Écartée', 'Rejected')}</span> : null}
            </div>
          </div>
          <p className="muted small">{specKind(direction.spec)} · {direction.spec.width}×{direction.spec.height} · {direction.spec.scenes.length} {t('scène(s)', 'scene(s)')} · {new Date(direction.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
          <div className="art-direction-swatches" aria-label={t('Palette', 'Palette')}><span style={{ background: direction.spec.brand.background }} /><span style={{ background: direction.spec.brand.accent }} /></div>
          <p className="context-copy">{firstText(direction.spec, 'headline')}</p>
          <p className="hint">{t('Appel à l’action : ', 'Call to action: ')}{firstText(direction.spec, 'cta')}</p>
          <details><summary>{t('Provenance', 'Provenance')}</summary><pre className="art-direction-provenance">{JSON.stringify(direction.provenance, null, 2)}</pre></details>
          {previews[direction.version] ? <figure className="art-direction-preview"><img src={previews[direction.version]} alt={t('Aperçu réel de la direction', 'Real direction preview')} /><figcaption className="hint">{t('Aperçu rendu localement (première scène). Ce n’est pas une génération IA ni une publication.', 'Locally rendered preview (first scene). Not an AI generation nor a publication.')}</figcaption></figure> : null}
          <div className="actions">
            <button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => void preview(direction)}>{t('Aperçu réel', 'Real preview')}</button>
            <button type="button" className="btn btn-secondary btn-small" disabled={!!busy || decisions[String(direction.version)] === 'retained'} onClick={() => void decide(direction.version, 'retained')}>{t('Retenir', 'Retain')}</button>
            <button type="button" className="btn btn-ghost btn-small" disabled={!!busy || decisions[String(direction.version)] === 'rejected'} onClick={() => void decide(direction.version, 'rejected')}>{t('Écarter', 'Reject')}</button>
            <button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => void refine(direction.version)}>{t('Affiner', 'Refine')}</button>
            <button type="button" className={selected.includes(direction.version) ? 'btn btn-secondary btn-small' : 'btn btn-ghost btn-small'} aria-pressed={selected.includes(direction.version)} disabled={!!busy} onClick={() => toggleSelected(direction.version)}>{selected.includes(direction.version) ? t('Sélectionnée pour comparer', 'Selected to compare') : t('Comparer', 'Compare')}</button>
            <button type="button" className="btn btn-primary btn-small" data-testid={'direction-choose-' + direction.version} disabled={!!busy || chosen === direction.version || decisions[String(direction.version)] === 'rejected'} onClick={() => void choose(direction.version)}>{chosen === direction.version ? t('Direction choisie', 'Chosen direction') : t('Choisir cette direction', 'Choose this direction')}</button>
            <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => void revisit(direction.version)}>{direction.version === head ? t('Ouvrir dans l’éditeur', 'Open in editor') : t('Reprendre dans l’éditeur', 'Restore in editor')}</button>
          </div>
        </article>)}
      </div>
      <p className="hint">{t('Une seule direction alimente le Studio : celle que vous choisissez. Changer de choix ne supprime ni les autres directions ni les versions déjà éditées ; éditer la direction choisie crée une nouvelle révision et déplace le pointeur sur celle-ci.', 'Only the direction you choose feeds the Studio. Changing the choice deletes neither the other directions nor the versions already edited; editing the chosen direction creates a new revision and moves the pointer to it.')}</p>
    </>}
  </section>;
}

function specKind(spec: CreativeSpec) {
  return spec.delivery ? spec.delivery.kind + ' · ' + spec.delivery.platform : 'Composition';
}
