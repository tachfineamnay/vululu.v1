'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, type BrandContext } from '../lib/api';

type Form = Omit<BrandContext, 'id'>;
type Revision = { id: string; version: number; checksum: string; createdAt: string; snapshot: Form };
type Review = { context: BrandContext; version: number; revisions: Revision[] };
type Proposal = { mode: 'MOCK'; sourceVersion: number; websiteFetched: false; facts: Array<{ field: keyof Form; value: string }>; hypotheses: Array<{ field: 'audience' | 'tone'; value: string; reason: string }> };
const labels: Record<keyof Form, string> = { name: 'Nom', website: 'Site déclaré', description: 'Description', audience: 'Audience', tone: 'Ton', colorPrimary: 'Couleur principale', colorSecondary: 'Couleur secondaire' };
function fullColor(value: string) { return /^#[a-f0-9]{3}$/i.test(value) ? '#' + [...value.slice(1)].map((c) => c + c).join('') : value; }
function formOf(context: BrandContext): Form { const { id: _id, ...form } = context; return { ...form, colorPrimary: fullColor(form.colorPrimary), colorSecondary: fullColor(form.colorSecondary) }; }

export default function ContextReviewPanel({ contextId, onSaved, onBusy }: { contextId: string; onSaved: (context: BrandContext) => void; onBusy: (busy: boolean) => void }) {
  const [review, setReview] = useState<Review | null>(null);
  const [draft, setDraft] = useState<Form | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    let active = true;
    void api<Review>(`/api/contexts/${encodeURIComponent(contextId)}/review`)
      .then((value) => { if (active) { setReview(value); setDraft(formOf(value.context)); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [contextId]);
  function lock(value: boolean) { setBusy(value); onBusy(value); }
  function edit(field: keyof Form, value: string) { setDraft((current) => current ? { ...current, [field]: value } : null); setConfirmed(false); setFeedback(''); }
  async function analyze() {
    lock(true); setError(''); setFeedback('');
    try { setProposal(await api<Proposal>(`/api/contexts/${encodeURIComponent(contextId)}/analyze`, { method: 'POST', body: '{}' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Proposition indisponible.'); }
    finally { lock(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!review || !draft) return;
    lock(true); setError(''); setFeedback('');
    try {
      const value = await api<Review>(`/api/contexts/${encodeURIComponent(contextId)}/review`, { method: 'PUT', body: JSON.stringify({ content: draft, confirmed, expectedVersion: review.version }) });
      setReview(value); setDraft(formOf(value.context)); onSaved(value.context); setProposal(null); setConfirmed(false);
      setFeedback(`Fiche confirmée — révision ${value.version}.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sauvegarde impossible.'); }
    finally { lock(false); }
  }
  if (!draft || !review) return error ? <p className="error" role="alert">{error}</p> : <p role="status">Chargement de la fiche et des révisions…</p>;
  return <div className="stack">
    {error ? <p className="error" role="alert">{error}</p> : null}
    {feedback ? <p className="toast toast--success" role="status">{feedback}</p> : null}
    <div className="stack">
      <h3>Proposition de contexte</h3>
      <p className="hint">La simulation utilise la dernière fiche enregistrée. Elle ne consulte aucun site et ne remplace pas votre brouillon.</p>
      <button className="btn btn-secondary" type="button" onClick={analyze} disabled={busy}>Préparer une proposition démo</button>
      {proposal ? <section className="context-proposal stack" aria-label="Proposition simulée">
        <strong>MOCK — proposition déterministe, à relire</strong>
        <p className="hint">Révision source : {proposal.sourceVersion}. Les informations ci-dessous sont déclarées par vous. Aucune URL consultée, aucune donnée externe vérifiée.</p>
        <h4>Informations saisies</h4><dl className="detail-list">{proposal.facts.map((fact) => <div key={fact.field}><dt>{labels[fact.field]}</dt><dd className="asset-provenance">{fact.value}</dd></div>)}</dl>
        <h4>Hypothèses proposées</h4>
        {proposal.hypotheses.length ? <ul className="list">{proposal.hypotheses.map((h) => <li key={h.field}><strong>{labels[h.field]} : {h.value}</strong><p className="hint">{h.reason}</p></li>)}</ul> : <p className="hint">Les champs sont déjà renseignés ; aucune hypothèse supplémentaire proposée.</p>}
        {proposal.hypotheses.length ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setDraft((current) => current ? { ...current, ...Object.fromEntries(proposal.hypotheses.filter((h) => !current[h.field]?.trim()).map((h) => [h.field, h.value])) } : null); setConfirmed(false); setFeedback('Hypothèses ajoutées aux champs vides du brouillon. Relisez-les avant confirmation.'); }}>Reprendre les hypothèses dans le brouillon</button> : null}
      </section> : null}
    </div>
    <form className="stack" onSubmit={save}>
      <h3>Fiche à valider</h3>
      <p className="hint">Les modifications s’appliquent aux prochains lancements. Les productions déjà lancées conservent leur contexte.</p>
      <label className="label">Nom du contexte<input className="input" value={draft.name} minLength={2} maxLength={160} required disabled={busy} onChange={(e) => edit('name', e.target.value)} /></label>
      <label className="label">Site déclaré (non consulté)<input className="input" value={draft.website ?? ''} maxLength={2048} disabled={busy} onChange={(e) => edit('website', e.target.value)} /></label>
      <label className="label">Description de la marque<textarea aria-label="Description de la marque" className="input textarea" value={draft.description} minLength={5} maxLength={8000} required disabled={busy} onChange={(e) => edit('description', e.target.value)} /></label>
      <label className="label">Audience du contexte<textarea aria-label="Audience du contexte" className="input" value={draft.audience ?? ''} maxLength={2000} disabled={busy} onChange={(e) => edit('audience', e.target.value)} /></label>
      <label className="label">Ton du contexte<input className="input" value={draft.tone ?? ''} maxLength={1000} disabled={busy} onChange={(e) => edit('tone', e.target.value)} /></label>
      <div className="two-col"><label className="label">Couleur principale ({draft.colorPrimary})<input className="input context-color" type="color" value={draft.colorPrimary} disabled={busy} onChange={(e) => edit('colorPrimary', e.target.value)} /></label><label className="label">Couleur secondaire ({draft.colorSecondary})<input className="input context-color" type="color" value={draft.colorSecondary} disabled={busy} onChange={(e) => edit('colorSecondary', e.target.value)} /></label></div>
      <label className="check-row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />J’ai relu les informations et les hypothèses ; je confirme cette fiche.</label>
      <button className="btn btn-primary" disabled={busy || !confirmed}>{busy ? 'Opération en cours…' : 'Confirmer et enregistrer la fiche'}</button>
    </form>
    <section className="stack" aria-label="Historique du contexte"><h3>Historique des révisions</h3>
      {[...review.revisions].reverse().map((r) => <details key={r.id}><summary>Révision {r.version} · {new Date(r.createdAt).toLocaleString('fr-FR')}</summary><code className="mono small asset-hash">{r.checksum}</code><dl className="detail-list">{Object.entries(r.snapshot).map(([field, value]) => <div key={field}><dt>{labels[field as keyof Form] ?? field}</dt><dd className="asset-provenance">{value || 'Non renseigné'}</dd></div>)}</dl></details>)}
    </section>
  </div>;
}
