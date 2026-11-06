'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type BrandContext } from '../lib/api';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import ContextFields, { type ContextDraft } from './ContextFields';

type Revision = { id: string; version: number; checksum: string; createdAt: string; snapshot: ContextDraft };
type Review = { context: BrandContext; version: number; revisions: Revision[] };
type Proposal = { mode: 'MOCK'; sourceVersion: number; websiteFetched: false; facts: Array<{ field: keyof ContextDraft; value: string }>; hypotheses: Array<{ field: 'audience' | 'tone'; value: string; reason: string }> };
const labels: Record<keyof ContextDraft, string> = { name: 'Nom', website: 'Site déclaré', description: 'Activité, offre ou sujet et contraintes', audience: 'Audience', tone: 'Ton', colorPrimary: 'Couleur principale', colorSecondary: 'Couleur secondaire' };
function fullColor(value: string) { return /^#[a-f0-9]{3}$/i.test(value) ? '#' + [...value.slice(1)].map((c) => c + c).join('') : value; }
function formOf(context: BrandContext): ContextDraft {
  return { name: context.name, website: context.website ?? '', description: context.description, audience: context.audience ?? '', tone: context.tone ?? '', colorPrimary: fullColor(context.colorPrimary), colorSecondary: fullColor(context.colorSecondary) };
}

export default function ContextReviewPanel({ contextId, onSaved, onBusy, onDirty }: {
  contextId: string; onSaved: (context: BrandContext) => void; onBusy: (busy: boolean) => void; onDirty: (dirty: boolean) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState<ContextDraft | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [retry, setRetry] = useState(0);
  const editButton = useRef<HTMLButtonElement>(null);
  const dirty = !!review && !!draft && JSON.stringify(draft) !== JSON.stringify(formOf(review.context));
  useUnsavedChanges(dirty);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    let active = true;
    setError('');
    void api<Review>(`/api/contexts/${encodeURIComponent(contextId)}/review`)
      .then((value) => { if (active) { setReview(value); setDraft(formOf(value.context)); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Fiche inaccessible.'); });
    return () => { active = false; };
  }, [contextId, retry]);
  function lock(value: boolean) { setBusy(value); onBusy(value); }
  function edit(field: keyof ContextDraft, value: string) { setDraft((current) => current ? { ...current, [field]: value } : null); setConfirmed(false); setFeedback(''); }
  function closeEditor() {
    if (dirty && !window.confirm('Abandonner les modifications non enregistrées ?')) return;
    if (review) setDraft(formOf(review.context));
    setEditing(false); setConfirmed(false); setProposal(null); setError('');
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function analyze() {
    lock(true); setError(''); setFeedback('');
    try { setProposal(await api<Proposal>(`/api/contexts/${encodeURIComponent(contextId)}/analyze`, { method: 'POST', body: '{}' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Proposition indisponible.'); }
    finally { lock(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!review || !draft || !confirmed) return;
    lock(true); setError(''); setFeedback('');
    try {
      const value = await api<Review>(`/api/contexts/${encodeURIComponent(contextId)}/review`, { method: 'PUT', body: JSON.stringify({ content: draft, confirmed, expectedVersion: review.version }) });
      setReview(value); setDraft(formOf(value.context)); onSaved(value.context); setProposal(null); setConfirmed(false); setEditing(false);
      setFeedback(`Fiche confirmée — révision ${value.version}.`);
      requestAnimationFrame(() => editButton.current?.focus());
    } catch (e) { setError(e instanceof Error ? e.message : 'Sauvegarde impossible.'); }
    finally { lock(false); }
  }
  if (!draft || !review) return error ? <div className="stack"><p className="error" role="alert">{error}</p><button className="btn btn-secondary" type="button" onClick={() => setRetry((n) => n + 1)}>Réessayer le chargement</button></div> : <p role="status">Chargement de la fiche et des révisions…</p>;
  const current = review.context;
  const missing = [!current.website?.trim() && 'site de référence', !current.audience?.trim() && 'public', !current.tone?.trim() && 'ton'].filter(Boolean);
  return <div className="stack" aria-busy={busy}>
    <div className="section-head context-title"><div><p className="eyebrow">Fiche enregistrée · révision {review.version}</p><h2 id="context-detail-heading">{current.name}</h2></div>
      {!editing ? <button ref={editButton} className="btn btn-secondary" type="button" onClick={() => { setEditing(true); setFeedback(''); requestAnimationFrame(() => document.getElementById('context-name')?.focus()); }}>Modifier la fiche</button> : null}
    </div>
    <p className="hint">{review.version > 1 ? 'Dernière révision relue et confirmée par vous.' : 'Informations déclarées à la création. Vous pouvez les relire et les confirmer.'} Aucun contenu externe vérifié.</p>
    {feedback ? <p className="toast toast--success" role="status">{feedback}</p> : null}
    {error ? <div className="error" role="alert"><p>{error}</p><p>Enregistrement non confirmé. Votre saisie reste dans cette fiche. Réessayez ; en cas de conflit de révision, copiez vos changements avant de recharger la page.</p></div> : null}
    {!editing ? <>
      <p className="context-completeness">{missing.length ? `À compléter si utile : ${missing.join(', ')}.` : 'Identité, description, public, ton et site renseignés.'} Les références restent facultatives.</p>
      <div className="context-overview">
        <section className="context-section stack"><h3>Identité</h3><dl className="detail-list"><div><dt>Nom du contexte</dt><dd>{current.name}</dd></div><div><dt>Couleurs déclarées</dt><dd>{current.colorPrimary} · {current.colorSecondary}</dd></div></dl></section>
        <section className="context-section stack"><h3>Activité, offre ou sujet</h3><p className="context-copy">{current.description}</p><dl className="detail-list"><div><dt>Public</dt><dd>{current.audience || 'À compléter si utile'}</dd></div></dl></section>
        <section className="context-section stack"><h3>Références</h3><p className="context-copy">{current.website || 'Aucun site déclaré'}</p><p className="hint">Adresse déclarée, non consultée et non analysée.</p><Link href={'/assets?context=' + encodeURIComponent(contextId)} data-testid="context-assets-status">Gérer les ressources de ce contexte</Link></section>
        <section className="context-section stack"><h3>Contraintes et consignes</h3><dl className="detail-list"><div><dt>Ton</dt><dd>{current.tone || 'À compléter si utile'}</dd></div></dl><p className="hint">Les autres contraintes se précisent dans la description. Aucun champ de contraintes séparé dans cette version. Droits et provenance se déclarent par ressource.</p></section>
      </div>
    </> : <form className="stack" onSubmit={save}>
      <h3>Modifier les informations</h3>
      <p className="hint">Une confirmation crée une révision si le contenu change. Les productions déjà lancées gardent leur contexte figé.</p>
      <ContextFields value={draft} onChange={edit} disabled={busy} />
      <details className="context-section"><summary>Proposition assistée de démonstration</summary><div className="stack">
        <p className="hint">MOCK : utilise la fiche enregistrée, sans consulter de site ni remplacer votre brouillon.</p>
        <button className="btn btn-secondary" type="button" onClick={analyze} disabled={busy}>Préparer une proposition démo</button>
        {proposal ? <section className="context-proposal stack" aria-label="Proposition simulée">
          <strong>MOCK — proposition déterministe, à relire</strong>
          <p className="hint">Révision source : {proposal.sourceVersion}. Aucune URL consultée, aucune donnée externe vérifiée.</p>
          <h4>Informations saisies</h4><dl className="detail-list">{proposal.facts.map((fact) => <div key={fact.field}><dt>{labels[fact.field]}</dt><dd className="asset-provenance">{fact.value}</dd></div>)}</dl>
          <h4>Hypothèses proposées</h4>
          {proposal.hypotheses.length ? <><ul className="list">{proposal.hypotheses.map((h) => <li key={h.field}><strong>{labels[h.field]} : {h.value}</strong><p className="hint">{h.reason}</p></li>)}</ul><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setDraft((v) => v ? { ...v, ...Object.fromEntries(proposal.hypotheses.filter((h) => !v[h.field]?.trim()).map((h) => [h.field, h.value])) } : null); setConfirmed(false); setFeedback('Hypothèses ajoutées aux champs vides. Relisez-les avant confirmation.'); }}>Reprendre les hypothèses dans le brouillon</button></> : <p>Aucune hypothèse supplémentaire proposée.</p>}
        </section> : null}
      </div></details>
      <p className="hint" role="status">{busy ? 'Opération en cours…' : dirty ? 'Modifications non enregistrées.' : 'Relisez la fiche avant de la confirmer.'}</p>
      <label className="check-row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />J’ai relu les informations et les hypothèses ; je confirme cette fiche.</label>
      <div className="actions"><button type="submit" className="btn btn-primary" disabled={busy || !confirmed}>{busy ? 'Enregistrement…' : 'Confirmer et enregistrer la fiche'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={closeEditor}>Annuler les modifications</button></div>
      {!confirmed ? <p className="hint">La confirmation ci-dessus est nécessaire pour enregistrer.</p> : null}
    </form>}
    <section className="context-section stack" aria-label="Historique du contexte" data-testid="context-revisions-status"><h3>Historique des révisions</h3>
      <p className="hint">Les versions précédentes restent consultables. Les couleurs et les informations sont déclarées par vous.</p>
      {[...review.revisions].reverse().map((r) => <details key={r.id}><summary>Révision {r.version} · {new Date(r.createdAt).toLocaleString('fr-FR')}</summary><code className="mono small asset-hash">{r.checksum}</code><dl className="detail-list">{Object.entries(r.snapshot).map(([field, value]) => <div key={field}><dt>{labels[field as keyof ContextDraft] ?? field}</dt><dd className="context-copy">{value || 'Non renseigné'}</dd></div>)}</dl></details>)}
    </section>
  </div>;
}
