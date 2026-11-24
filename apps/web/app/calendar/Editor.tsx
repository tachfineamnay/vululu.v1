'use client';
import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { availableFormats, nextStages, productionCapability, variant, type CalendarItem, type Content, type Stage } from '@vululu/contracts';
import { api, postJson, type CampaignSummary, type ProjectSummary } from '../../lib/api';
import type { Offer } from './suggestions';
import { useUnsavedChanges } from '../../lib/useUnsavedChanges';
import { instants, localInput } from './dates';

const hashtagPattern = /^#[a-z0-9_]{2,49}$/i;
const maxHashtags = 10;
const hashtagHint =
  'Format : # suivi de 2 à 49 lettres, chiffres ou tirets bas (ex. #atelier). Maximum 10, sans doublon. Ils rejoignent la légende publiée et le kit manuel.';

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
  saved: (row: CalendarItem) => void;
}) {
  const router = useRouter();
  const [draft, set] = useState(initial);
  const [platform, selectPlatform] = useState(initial.variants[0].platform);
  const [local, setLocal] = useState(localInput(new Date(initial.plannedAt)));
  const [late, setLate] = useState(instants(local)[1]?.toISOString() === initial.plannedAt);
  const [busy, working] = useState(false),
    [error, fail] = useState('');
  const [tagDraft, setTagDraft] = useState<Record<number, string>>({}),
    [tagError, setTagError] = useState<Record<number, string>>({});
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
  const inFlight = useRef(false);
  function patch<K extends keyof Content>(k: K, v: Content[K]) {
    set((d) => ({ ...d, [k]: v }));
  }
  function tagMessage(index: number, message: string) {
    setTagError((current) => ({ ...current, [index]: message }));
  }
  function addHashtag(index: number) {
    const raw = (tagDraft[index] ?? '').trim();
    if (!raw) return;
    const tag = raw.startsWith('#') ? raw : '#' + raw;
    const tags = draft.variants[index]?.hashtags ?? [];
    if (!hashtagPattern.test(tag)) {
      tagMessage(index, 'Hashtag invalide. Utilisez # suivi de 2 à 49 lettres, chiffres ou tirets bas (ex. #atelier).');
      return;
    }
    if (tags.length >= maxHashtags) {
      tagMessage(index, 'Maximum ' + maxHashtags + ' hashtags pour cette déclinaison.');
      return;
    }
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      tagMessage(index, 'Ce hashtag est déjà présent.');
      return;
    }
    patch(
      'variants',
      draft.variants.map((current, j) => (j === index ? { ...current, hashtags: [...tags, tag] } : current))
    );
    setTagDraft((current) => ({ ...current, [index]: '' }));
    tagMessage(index, '');
  }
  function removeHashtag(index: number, tag: string) {
    patch(
      'variants',
      draft.variants.map((current, j) =>
        j === index ? { ...current, hashtags: (current.hashtags ?? []).filter((t) => t !== tag) } : current
      )
    );
    tagMessage(index, '');
  }
  const available = instants(local),
    context = offers.find((o) => o.id === draft.offerId)?.contextId;
  const locked = !['IDEA', 'DRAFT'].includes(initial.status) && draft.status !== 'DRAFT';
  const projectHref = (projectId: string) => `/projects/${encodeURIComponent(projectId)}?${new URLSearchParams({ item: initial.id, offer: initial.offerId })}`;
  async function start() {
    if (inFlight.current || busy || dirty) return;
    inFlight.current = true;
    working(true); fail('');
    try {
      const project = await postJson<{ projectId: string }>(`/api/calendar/${initial.id}/project`, { expectedVersion: initial.version, platform });
      router.push(projectHref(project.projectId));
    } catch (error) { fail(error instanceof Error ? error.message : 'Le projet n’a pas pu être créé.'); }
    finally { inFlight.current = false; working(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || busy) return;
    const instant = available[late && available.length > 1 ? 1 : 0];
    if (!instant) {
      fail('Heure locale inexistante. Choisissez une autre heure.');
      return;
    }
    const invalid = draft.variants.flatMap((v) => (v.hashtags ?? []).filter((tag) => !hashtagPattern.test(tag)));
    const duplicates = draft.variants.find((v) => {
      const tags = (v.hashtags ?? []).map((tag) => tag.toLowerCase());
      return new Set(tags).size !== tags.length;
    });
    if (invalid.length || duplicates) {
      fail(
        duplicates
          ? 'Hashtags en double dans la déclinaison ' + duplicates.platform + '. Retirez le doublon avant d’enregistrer.'
          : 'Hashtags invalides : ' + invalid.join(', ') + '. Utilisez # suivi de 2 à 49 lettres, chiffres ou tirets bas.'
      );
      return;
    }
    inFlight.current = true;
    working(true);
    fail('');
    try {
      const { id, version, ...fields } = draft;
      const data = {
        ...fields,
        variants: draft.variants.map((v) => ({ ...v, hashtags: v.hashtags ?? [] })),
        plannedAt: instant.toISOString(),
        timeZone:
          instant.toISOString() === initial.plannedAt
            ? initial.timeZone
            : Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      const body = JSON.stringify(data);
      if (retry.current.body !== body) retry.current = { body, key: crypto.randomUUID() };
      saved(await postJson<CalendarItem>('/api/calendar', { id, expectedVersion: version, requestId: retry.current.key, data }));
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      inFlight.current = false;
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
        {initial.projectId && <Link href={projectHref(initial.projectId)}>Ouvrir le projet dans le Studio</Link>}
        {!!initial.version && !initial.projectId && !initial.archived && ['IDEA', 'DRAFT'].includes(initial.status) && <div className="stack">
          {initial.variants.length > 1 && <label>Plateforme à créer <select className="input" value={platform} onChange={(event) => selectPlatform(variant.shape.platform.parse(event.target.value))}>
            {initial.variants.map((v) => <option key={v.platform}>{v.platform}</option>)}
          </select></label>}
          <button type="button" className="btn btn-secondary" disabled={dirty || busy} onClick={() => void start()}>Créer le projet dans le Studio</button>
          {dirty && <p className="hint">Enregistrez vos modifications avant d’ouvrir le Studio.</p>}
        </div>}
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
                    onChange={(e) => {
                      const platform = variant.shape.platform.parse(e.target.value);
                      const formats = availableFormats[platform];
                      update({ platform, format: (formats as readonly string[]).includes(v.format) ? v.format : formats[0] });
                    }}
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
                    {!(availableFormats[v.platform] as readonly string[]).includes(v.format) && (
                      <option value={v.format}>{v.format} (non pris en charge · ancien choix)</option>
                    )}
                    {availableFormats[v.platform].map((f) => (
                      <option key={f} value={f}>
                        {productionCapability(f)?.label}
                        {v.platform === 'TikTok' || f !== 'Affiche' ? ' · kit manuel' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {!productionCapability(v.format) ? (
                  <p className="hint cal-error" role="status">
                    Format « {v.format} » non pris en charge pour le rendu et la programmation directe. Sélectionnez un format compatible.
                  </p>
                ) : v.platform === 'TikTok' || v.format !== 'Affiche' ? (
                  <p className="hint">
                    Format pris en charge au Studio en kit manuel uniquement (la programmation directe Postiz ne couvre que les posts image compatibles).
                  </p>
                ) : null}
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
                <div className="cal-hashtags-editor" role="group" aria-labelledby={`hashtag-title-${i}`}>
                  <p className="label" id={`hashtag-title-${i}`}>
                    Hashtags (facultatif)
                  </p>
                  <p className="hint" id={`hashtag-hint-${i}`}>
                    {hashtagHint}
                  </p>
                  {(v.hashtags ?? []).length ? (
                    <ul className="cal-hashtags" aria-label={'Hashtags de ' + v.platform}>
                      {(v.hashtags ?? []).map((tag) => (
                        <li key={tag}>
                          <span>{tag}</span>
                          <button
                            type="button"
                            className="text-link"
                            aria-label={'Retirer le hashtag ' + tag + ' de ' + v.platform}
                            onClick={() => removeHashtag(i, tag)}
                          >
                            Retirer
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint">Aucun hashtag pour cette déclinaison.</p>
                  )}
                  <div className="cal-hashtag-add">
                    <label htmlFor={'hashtag-input-' + i}>Ajouter un hashtag</label>
                    <input
                      id={'hashtag-input-' + i}
                      className="input"
                      value={tagDraft[i] ?? ''}
                      maxLength={50}
                      placeholder="#atelier"
                      aria-describedby={'hashtag-hint-' + i}
                      aria-invalid={tagError[i] ? true : undefined}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addHashtag(i);
                        }
                      }}
                      onChange={(event) => {
                        setTagDraft((current) => ({ ...current, [i]: event.target.value }));
                        tagMessage(i, '');
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={(v.hashtags ?? []).length >= maxHashtags}
                      onClick={() => addHashtag(i)}
                    >
                      Ajouter
                    </button>
                  </div>
                  {tagError[i] && (
                    <p className="hint cal-error" role="alert">
                      {tagError[i]}
                    </p>
                  )}
                  <p className="hint">
                    {(v.hashtags ?? []).length} / {maxHashtags} hashtags
                  </p>
                </div>
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
                    ...(() => { const platform = variant.shape.platform.options.find((p) => !draft.variants.some((v) => v.platform === p))!;
                      return { platform, format: availableFormats[platform][0] }; })(),
                    hashtags: []
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
        <p className="hint">
          Passez de l’idée au brouillon, puis à la relecture et à l’approbation. L’état éditorial n’envoie rien au réseau
          {draft.status === 'PUBLISHED'
            ? ' : « Publication déclarée » reste une note interne et ne crée aucune preuve réseau vérifiée dans Résultats.'
            : '.'}
        </p>
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
