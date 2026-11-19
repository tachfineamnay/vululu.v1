'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { nextStages, variant, type CalendarItem, type Content, type Stage } from '@vululu/contracts';
import { api, postJson, type CampaignSummary, type ProjectSummary } from '../../lib/api';
import type { Offer } from './suggestions';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { instants, localInput } from './dates';

export const labels: Record<Stage, string> = {
  IDEA: 'Idée',
  DRAFT: 'Brouillon',
  READY_FOR_REVIEW: 'En relecture',
  APPROVED: 'Approuvé',
  SCHEDULED: 'Planifié',
  PUBLISHED: 'Publication déclarée',
  FAILED: 'Échec déclaré'
};
export function Editor({
  initial,
  offers,
  projects,
  campaigns,
  close,
  saved
}: {
  initial: CalendarItem;
  offers: Offer[];
  projects: ProjectSummary[];
  campaigns: CampaignSummary[];
  close: () => void;
  saved: (date: Date, archived: boolean) => void;
}) {
  const [draft, set] = useState(initial);
  const [local, setLocal] = useState(localInput(new Date(initial.plannedAt)));
  const [late, setLate] = useState(instants(local)[1]?.toISOString() === initial.plannedAt);
  const [busy, working] = useState(false),
    [error, fail] = useState('');
  const [history, setHistory] = useState<{ version: number; snapshot: CalendarItem; createdAt: string }[] | null>(
    null
  );
  const dirty =
    draft !== initial ||
    local !== localInput(new Date(initial.plannedAt)) ||
    late !== (instants(local)[1]?.toISOString() === initial.plannedAt);
  useUnsavedChanges(dirty);
  async function showHistory() {
    try {
      setHistory(await api(`/api/calendar/${initial.id}/history`));
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Historique inaccessible.');
    }
  }
  const retry = useRef({ body: '', key: '' });
  function patch<K extends keyof Content>(k: K, v: Content[K]) {
    set((d) => ({ ...d, [k]: v }));
  }
  const available = instants(local),
    context = offers.find((o) => o.id === draft.offerId)?.contextId;
  const locked = !['IDEA', 'DRAFT'].includes(initial.status) && draft.status !== 'DRAFT';
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const instant = available[late && available.length > 1 ? 1 : 0];
    if (!instant) {
      fail('Heure locale inexistante. Choisissez une autre heure.');
      return;
    }
    working(true);
    fail('');
    try {
      const { id, version, ...fields } = draft;
      const data = {
        ...fields,
        plannedAt: instant.toISOString(),
        timeZone:
          instant.toISOString() === initial.plannedAt
            ? initial.timeZone
            : Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      const body = JSON.stringify(data);
      if (retry.current.body !== body) retry.current = { body, key: crypto.randomUUID() };
      await postJson('/api/calendar', { id, expectedVersion: version, requestId: retry.current.key, data });
      saved(instant, draft.archived);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      working(false);
    }
  }
  return (
    <form className="card stack cal-editor" onSubmit={submit}>
      <h2>{draft.version ? 'Modifier le contenu' : 'Nouveau contenu'}</h2>
      <fieldset className="stack" disabled={busy}>
        <label>
          Titre
          <input
            className="input"
            autoFocus
            required
            maxLength={160}
            readOnly={locked}
            value={draft.title}
            onChange={(e) => patch('title', e.target.value)}
          />
        </label>
        <fieldset className="stack" disabled={locked}>
          <legend>Brief marketing</legend>
          <label>
            Offre confirmée
            <select
              className="input"
              required
              value={draft.offerId}
              onChange={(e) => set({ ...draft, offerId: e.target.value, projectId: null })}
            >
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Public cible
            <input
              className="input"
              required
              maxLength={2000}
              value={draft.audience}
              onChange={(e) => patch('audience', e.target.value)}
            />
          </label>
          <label>
            Objectif marketing
            <input
              className="input"
              required
              maxLength={2000}
              value={draft.objective}
              onChange={(e) => patch('objective', e.target.value)}
            />
          </label>
          <label>
            Campagne
            <select
              className="input"
              value={draft.campaignId || ''}
              onChange={(e) => set({ ...draft, campaignId: e.target.value || null, projectId: null })}
            >
              <option value="">Sans campagne</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projet Studio
            <select
              className="input"
              value={draft.projectId || ''}
              onChange={(e) => patch('projectId', e.target.value || null)}
            >
              <option value="">Sans projet</option>
              {projects
                .filter((p) => p.contextId === context && (!draft.campaignId || p.campaignId === draft.campaignId))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>
        {draft.projectId && <Link href={'/projects/' + draft.projectId}>Ouvrir le projet dans le Studio</Link>}
        <fieldset disabled={locked} className="stack">
          <legend>Déclinaisons par plateforme</legend>
          {draft.variants.map((v, i) => {
            function update(change: Partial<typeof v>) {
              patch(
                'variants',
                draft.variants.map((x, j) => (j === i ? { ...x, ...change } : x))
              );
            }
            return (
              <div className="stack" key={i}>
                <label>
                  Plateforme
                  <select
                    className="input"
                    value={v.platform}
                    onChange={(e) => update({ platform: e.target.value as typeof v.platform })}
                  >
                    {variant.shape.platform.options.map((p) => (
                      <option disabled={draft.variants.some((x, j) => j !== i && x.platform === p)} key={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Format
                  <select
                    className="input"
                    value={v.format}
                    onChange={(e) => update({ format: e.target.value as typeof v.format })}
                  >
                    {variant.shape.format.options.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Légende
                  <textarea
                    className="input"
                    required
                    maxLength={2200}
                    value={v.caption}
                    onChange={(e) => update({ caption: e.target.value })}
                  />
                </label>
                <label>
                  Appel à l’action
                  <input
                    className="input"
                    required
                    maxLength={240}
                    value={v.cta}
                    onChange={(e) => update({ cta: e.target.value })}
                  />
                </label>
                {draft.variants.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      patch(
                        'variants',
                        draft.variants.filter((_, j) => i !== j)
                      )
                    }
                  >
                    Retirer {v.platform}
                  </button>
                )}
              </div>
            );
          })}
          {draft.variants.length < 3 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                patch('variants', [
                  ...draft.variants,
                  {
                    ...draft.variants[0],
                    platform: variant.shape.platform.options.find(
                      (p) => !draft.variants.some((v) => v.platform === p)
                    )!
                  }
                ])
              }
            >
              Ajouter une plateforme
            </button>
          )}
        </fieldset>
        <label>
          Date et heure ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          <input
            type="datetime-local"
            className="input"
            required
            disabled={initial.status === 'PUBLISHED'}
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              setLate(false);
            }}
          />
        </label>
        {available.length > 1 && (
          <label>
            <input type="checkbox" checked={late} onChange={(e) => setLate(e.target.checked)} /> Utiliser la
            seconde occurrence de cette heure
          </label>
        )}
        <label>
          État éditorial
          <select
            className="input"
            value={draft.status}
            onChange={(e) => patch('status', e.target.value as Stage)}
          >
            {[initial.status, ...(initial.version ? nextStages[initial.status] : [])].map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Suivi manuel : aucun contenu ne sera publié automatiquement.</p>
        {!!draft.version && (
          <label>
            <input
              type="checkbox"
              checked={draft.archived}
              onChange={(e) => patch('archived', e.target.checked)}
            />{' '}
            Archivé
          </label>
        )}
        {!!initial.version && (
          <details
            onToggle={(e) => {
              if (e.currentTarget.open && !history) void showHistory();
            }}
          >
            <summary>Historique · version {initial.version}</summary>
            {history ? (
              <ol>
                {history.map((r) => (
                  <li key={r.version}>
                    <strong>
                      v{r.version} · {r.snapshot.title}
                    </strong>{' '}
                    — {labels[r.snapshot.status]}
                    {r.snapshot.archived ? ' · Archivé' : ''} · {new Date(r.createdAt).toLocaleString('fr')}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Chargement…</p>
            )}
          </details>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="cal-actions">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (!dirty || window.confirm('Abandonner les modifications non enregistrées ?')) close();
            }}
          >
            Fermer
          </button>
        </div>
      </fieldset>
    </form>
  );
}
