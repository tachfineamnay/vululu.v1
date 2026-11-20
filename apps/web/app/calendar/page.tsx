'use client';
import {useWorkspace} from '../../components/WorkspacePreferences';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CalendarItem, Content } from '@vululu/contracts';
import StudioNav from '../../components/StudioNav';
import { api, postJson, type BrandContext, type CampaignSummary, type ProjectSummary } from '../../lib/api';
import { SocialConnections } from './SocialConnections';
import { PublishingPanel } from './PublishingPanel';
import { Editor, labels } from './Editor';
import { dayKey, period, shift } from './dates';
import { suggestions, type Offer } from './suggestions';
import './calendar.css';

const fmt = (d: Date, options: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', options);
const message = (e: unknown) => (e instanceof Error ? e.message : 'Chargement impossible.');
export default function CalendarPage() {
  const {t}=useWorkspace();
  const router = useRouter();
  const [anchor, setAnchor] = useState<Date | null>(null),
    [month, monthly] = useState(false),
    [archived, archives] = useState(false);
  const [refs, resources] = useState<{
    contexts: BrandContext[];
    campaigns: CampaignSummary[];
    projects: ProjectSummary[];
    offers: Offer[];
  } | null>(null);
  const [offerId, select] = useState(''),
    [items, list] = useState<CalendarItem[] | null>(null),
    [draft, edit] = useState<CalendarItem | null>(null);
  const [name, setName] = useState(''),
    [contextId, choose] = useState(''),
    [busy, working] = useState(false),
    [revision, refresh] = useState(0), [connectionsVersion, connectionsChanged] = useState(0);
  const [error, fail] = useState(''),
    [notice, say] = useState('');
  useEffect(() => {
    setAnchor(new URLSearchParams(location.search).get('week')==='next'?shift(period(new Date(),false).start,7):new Date());
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ items: BrandContext[] }>('/api/contexts'),
      api<{ items: CampaignSummary[] }>('/api/campaigns'),
      api<{ items: ProjectSummary[] }>('/api/projects'),
      api<Offer[]>('/api/calendar/offers')
    ])
      .then(([c, g, p, o]) => {
        if (active) {
          resources({ contexts: c.items, campaigns: g.items, projects: p.items, offers: o });
          const project = p.items.find((item) => item.id === new URLSearchParams(location.search).get('project'));
          choose((current) => current || project?.contextId || c.items[0]?.id || '');
          select(
            (current) =>
              current ||
              o.find((offer)=>offer.id===new URLSearchParams(location.search).get('offer'))?.id ||
              o.find((offer) => offer.contextId === project?.contextId)?.id ||
              (!project ? o[0]?.id : '') ||
              ''
          );
        }
      })
      .catch((e) => {
        if (active) fail(message(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const range = anchor && period(anchor, month),
    start = range?.start.toISOString(),
    end = range?.end.toISOString();
  useEffect(() => {
    if (!start || !end) return;
    let active = true;
    list(null);
    api<CalendarItem[]>(`/api/calendar?${new URLSearchParams({ start, end, archived: String(archived) })}`)
      .then((v) => {
        if (active) list(v);
      })
      .catch((e) => {
        if (active) fail(message(e));
      });
    return () => {
      active = false;
    };
  }, [start, end, archived, revision]);
  const selected = refs?.offers.find((o) => o.id === offerId),
    context = refs?.contexts.find((c) => c.id === selected?.contextId);
  function make(data: Content) {
    edit({ ...data, id: crypto.randomUUID(), version: 0, status: 'IDEA', archived: false });
    say('');
  }
  const ideas =
    refs && anchor && selected && context
      ? suggestions(
          period(anchor, false).start,
          selected,
          context,
          refs.projects,
          new URLSearchParams(location.search).get('project')
        )
      : [];
  const nextPlan = !!anchor && new URLSearchParams(location.search).get('week') === 'next';
  if(nextPlan && selected && ideas[0] && new URLSearchParams(location.search).get('angle')==='question') {
    ideas[0]={...ideas[0],title:`Une question sur ${selected.name}`.slice(0,160),objective:'Répondre à une question concrète avec un exemple différent',variants:ideas[0].variants.map(v=>({...v,caption:'',cta:'Posez votre question'}))};
  }
  function blank(day: Date) {
    if (ideas[0])
      make({
        ...ideas[0],
        title: '',
        objective: '',
        plannedAt: new Date(dayKey(day) + 'T10:00').toISOString(),
        variants: [{ platform: 'Instagram', format: 'Affiche', caption: '', cta: '' }]
      });
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!refs || busy) return;
    working(true);
    fail('');
    try {
      const o = await postJson<Offer>('/api/calendar/offers', { contextId, name, confirmed: true });
      resources({ ...refs, offers: [...refs.offers.filter((x) => x.id !== o.id), o] });
      select(o.id);
      setName('');
      say('Offre confirmée.');
    } catch (err) {
      fail(message(err));
    } finally {
      working(false);
    }
  }
  function move(n: number) {
    if (anchor) setAnchor(month ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : shift(anchor, n * 7));
  }
  return (
    <div className="shell" data-vululu-theme="blue">
      <a className="skip-link" href="#calendar-main">
        Aller au calendrier
      </a>
      <StudioNav>
        {!draft && (
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => {
              working(true);
              try {
                await postJson('/api/auth/logout', {});
                router.replace('/login?next=/calendar');
              } catch (err) {
                fail(message(err));
                working(false);
              }
            }}
          >
            Sortir
          </button>
        )}
      </StudioNav>
      <main id="calendar-main" tabIndex={-1} className="page stack cal-page">
        <header>
          <p className="eyebrow">Studio · Planification marketing</p>
          <h1>{t("Calendrier éditorial","Editorial calendar")}</h1>
          <p className="muted">{t("Organisez vos contenus, de la première idée au suivi de publication.","Organize content from your first idea to publication tracking.")}</p>
        </header>
        <SocialConnections onChange={() => connectionsChanged((n) => n + 1)} />
        {error && (
          <div className="error" role="alert">
            {error}{' '}
            <button
              className="btn"
              onClick={() => {
                fail('');
                refresh((r) => r + 1);
              }}
            >
              Réessayer
            </button>{' '}
            <Link href="/login?next=/calendar">{t("Se connecter","Sign in")}</Link>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {draft && refs ? (
          <>
            <Editor
              key={draft.id}
              initial={draft}
              {...refs}
              close={() => edit(null)}
              saved={(d, isArchived) => {
                edit(null);
                archives(isArchived);
                setAnchor(d);
                refresh((r) => r + 1);
                say('Modification enregistrée.');
              }}
            />
            {draft.version > 0 && <PublishingPanel key={`${draft.id}:${draft.version}`} id={draft.id} connectionsVersion={connectionsVersion} />}
          </>
        ) : (
          <>
            {refs && (
              <section className="card stack">
                <h2>{t("Préparer la semaine","Prepare the week")}</h2>
                {!refs.contexts.length ? (
                  <Link href="/contexts/new">{t("Créer un contexte de marque pour commencer","Create a business profile to get started")}</Link>
                ) : (
                  <>
                    <details open={!refs.offers.length}>
                      <summary>{t("Confirmer une offre de votre activité","Confirm a business offer")}</summary>
                      <form className="cal-actions" onSubmit={confirm}>
                        <label>
                          {t("Marque","Brand")}
                          <select className="input" value={contextId} onChange={(e) => choose(e.target.value)}>
                            {refs.contexts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t("Nom de l’offre","Offer name")}
                          <input
                            required
                            maxLength={160}
                            className="input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                          />
                        </label>
                        <button className="btn btn-secondary" disabled={busy}>
                          {t("Confirmer l’offre","Confirm offer")}
                        </button>
                      </form>
                    </details>
                    {!!refs.offers.length && (
                      <>
                        <label>
                          {t("Offre pour les idées de la semaine","Offer for this week\u2019s ideas")}
                          <select className="input" value={offerId} onChange={(e) => select(e.target.value)}>
                            <option value="" disabled>
                              Choisir une offre confirmée
                            </option>
                            {refs.offers.map((o) => (
                              <option key={o.id} value={o.id}>
                                {refs.contexts.find((c) => c.id === o.contextId)?.name} · {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <details open={nextPlan || undefined}>
                          <summary>Suggestions hebdomadaires · {ideas.length} idées</summary>
                          <p>À adapter avant enregistrement. Aucune génération payante.</p>
                          <div className="cal-actions">
                            {ideas.map((i) => (
                              <button className="btn btn-secondary" key={i.title} onClick={() => make(i)}>
                                {fmt(new Date(i.plannedAt), { weekday: 'short', day: 'numeric' })} · {i.title}
                              </button>
                            ))}
                          </div>
                        </details>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
            {range && anchor && (
              <section className="card stack">
                <div className="cal-actions">
                  <div>
                    <p className="eyebrow">{month ? 'Vue mensuelle' : 'Vue hebdomadaire'}</p>
                    <h2>
                      {fmt(range.start, { day: 'numeric', month: 'long' })} –{' '}
                      {fmt(shift(range.end, -1), { day: 'numeric', month: 'long', year: 'numeric' })}
                    </h2>
                  </div>
                  <button className="btn btn-primary" disabled={!ideas.length} onClick={() => blank(anchor)}>
                    Nouveau contenu
                  </button>
                </div>
                <div className="cal-actions">
                  <div className="cal-paging">
                    <button className="btn btn-secondary" onClick={() => move(-1)}>
                      Précédent
                    </button>
                    <button className="btn btn-secondary" onClick={() => setAnchor(new Date())}>
                      Aujourd’hui
                    </button>
                    <button className="btn btn-secondary" onClick={() => move(1)}>
                      Suivant
                    </button>
                  </div>
                  <label>
                    Aller à la date
                    <input
                      className="input"
                      type="date"
                      value={dayKey(anchor)}
                      onChange={(e) => {
                        if (e.target.value) setAnchor(new Date(e.target.value + 'T12:00'));
                      }}
                    />
                  </label>
                  <label>
                    Vue
                    <select
                      className="input"
                      value={month ? 'month' : 'week'}
                      onChange={(e) => monthly(e.target.value === 'month')}
                    >
                      <option value="week">Semaine</option>
                      <option value="month">Mois</option>
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" checked={archived} onChange={(e) => archives(e.target.checked)} />{' '}
                    Archives uniquement
                  </label>
                </div>
                <p className="hint">Heures locales · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                {!items ? (
                  <p role="status">{error ? 'Calendrier indisponible.' : 'Chargement du calendrier…'}</p>
                ) : (
                  <div
                    className="cal-grid"
                    style={{ '--first-day': 1 + ((range.start.getDay() + 6) % 7) } as React.CSSProperties}
                  >
                    {range.days.map((day) => {
                      const rows = items.filter((item) => dayKey(new Date(item.plannedAt)) === dayKey(day));
                      return (
                        <section
                          key={dayKey(day)}
                          className="cal-day"
                          data-today={dayKey(day) === dayKey(new Date())}
                        >
                          <header className="cal-date">
                            <h3>{fmt(day, { weekday: 'short', day: 'numeric' })}</h3>
                            {!archived && ideas.length > 0 && (
                              <button
                                aria-label={'Ajouter un contenu le ' + fmt(day, { dateStyle: 'full' })}
                                className="cal-add"
                                onClick={() => blank(day)}
                              >
                                +
                              </button>
                            )}
                          </header>
                          {!rows.length && <small className="muted">Aucun contenu</small>}
                          {rows.map((item) => (
                            <article className="cal-item" key={item.id}>
                              <small>
                                {new Date(item.plannedAt).toLocaleTimeString('fr', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}{' '}
                                · {labels[item.status]}
                              </small>
                              <button className="cal-title" onClick={() => edit(item)}>
                                {item.title}
                              </button>
                              <small>{item.variants.map((v) => v.platform).join(' · ')}</small>
                              <button
                                className="text-link"
                                onClick={() => make({ ...item, title: ('Copie · ' + item.title).slice(0, 160) })}
                              >
                                Dupliquer
                              </button>
                            </article>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
