'use client';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import type { MarketingContext, MarketingOutput } from '@vululu/contracts';
import { api, postJson } from '../lib/api';
type Revision = {
  version: number;
  context: MarketingContext;
  result: MarketingOutput;
  digest: string;
  approvedAt: string | null;
  origin: string;
  reason: string;
};
function monday(next=false) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (next?7:0) - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function MarketingAssistant({ project, context }: { project: string; context: string }) {
  const base = `/api/projects/${project}/marketing`;
  const [offers, setOffers] = useState<{ id: string; name: string }[]>([]),
    [offer, setOffer] = useState(''),
    [week, setWeek] = useState(()=>monday()),
    [regulated, setRegulated] = useState(false),
    [review, attest] = useState(false),
    [r, show] = useState<Revision>(),
    [versions, list] = useState<{ version: number; origin: string }[]>([]),
    [busy, work] = useState(false),
    [error, fail] = useState('');
  const details=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{const q=new URLSearchParams(location.search);if(q.get('plan')==='next'){setWeek(monday(true));setOffer(q.get('offer')??'');if(details.current)details.current.open=true;}},[project]);
  function display(v: Revision) {
    show(v);
    attest(false);
  }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    work(true);
    fail('');
    try {
      await fn();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      work(false);
    }
  }
  async function load() {
    const all = await api<{ id: string; name: string; contextId: string }[]>('/api/calendar/offers');
    const own = all.filter((o) => o.contextId === context);
    setOffers(own);
    const requested = new URLSearchParams(location.search).get('offer');
    setOffer((old) => own.find((o) => o.id === old)?.id ?? own.find((o) => o.id === requested)?.id ?? own[0]?.id ?? '');
    const h = await api<{ version: number; origin: string }[]>(base);
    list(h);
    if (h.length) display(await api<Revision>(base + '/' + h[0].version));
  }
  return (
    <details ref={details}
      className="card stack"
      onToggle={(e) => {
        if (e.currentTarget === e.target && e.currentTarget.open) void act(load);
      }}
    >
      <summary id="marketing-heading">Assistant marketing · plan de la semaine</summary>
      <fieldset className="stack" disabled={busy}>
        <p>
          Le brouillon local est gratuit. Rien ne sera ajouté au calendrier ni publié sans une action
          distincte.
        </p>
        <label>
          Offre confirmée
          <select className="input" value={offer} onChange={(e) => setOffer(e.target.value)}>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {!offers.length && <a href="/calendar">Confirmer une offre dans le calendrier</a>}
        <label>
          Semaine du lundi (UTC)
          <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={regulated} onChange={(e) => setRegulated(e.target.checked)} /> Mon
          activité est soumise à des règles publicitaires particulières
        </label>
        <button
          type="button"
          disabled={!offer}
          onClick={() =>
            void act(async () => {
              const v = await postJson<Revision>(base, {
                offerId: offer,
                week,
                regulated,
                requestId: crypto.randomUUID()
              });
              display(v);
              list(await api(base));
            })
          }
        >
          Créer un brouillon local
        </button>
        <button type="button" onClick={() => void act(load)}>
          Actualiser les révisions
        </button>
        {versions.length > 0 && (
          <label>
            Historique
            <select
              value={r?.version ?? ''}
              onChange={(e) =>
                void act(async () => display(await api<Revision>(base + '/' + e.target.value)))
              }
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} · {v.origin === 'provider' ? 'modèle' : 'local'}
                </option>
              ))}
            </select>
          </label>
        )}
        {r && (
          <>
            <h3>
              Plan du {r.context.week} · v{r.version}
            </h3>
            <p>
              {r.origin === 'provider' ? 'Structure proposée par le modèle' : 'Composition déterministe'} ·{' '}
              {r.reason} · {r.approvedAt ? 'Approuvé' : 'À relire'}
            </p>
            <h4>Faits issus de vos données</h4>
            <ul>
              {r.result.facts.map((f) => (
                <li key={f.source + f.id}>
                  {f.value} · {f.source}
                </li>
              ))}
            </ul>
            <p>Informations non utilisées comme faits : {r.result.unknowns.join(' ; ')}.</p>
            <h4>Suggestions éditoriales</h4>
            {r.result.suggestions.map((d, index) => (
              <article key={d.angle}>
                <strong>
                  {d.day ?? 'Date à choisir'} · {d.platform}
                </strong>
                <h4>{d.hook}</h4>
                <p>{d.idea}</p>
                <p>{d.caption}</p>
                <p>{d.cta}</p>
                {r.approvedAt && <Link href={`/calendar?${new URLSearchParams({ offer: r.context.offerId, planProject: project, planVersion: String(r.version), idea: String(index) })}`}>
                  Reprendre cette idée dans le calendrier
                </Link>}
                <details>
                  <summary>Variantes et storyboard</summary>
                  {d.variants.map((v) => (
                    <p key={v.platform}>
                      <b>{v.platform}</b> — {v.caption} {v.cta}
                    </p>
                  ))}
                  <ol>
                    {d.storyboard.map((s, i) => (
                      <li key={i}>
                        {s.shot} · Texte : {s.onScreen}
                      </li>
                    ))}
                  </ol>
                </details>
              </article>
            ))}
            <p>{r.result.review.join(' ')}</p>
            {r.context.regulated && (
              <label>
                <input type="checkbox" checked={review} onChange={(e) => attest(e.target.checked)} /> J’ai
                vérifié les règles professionnelles applicables.
              </label>
            )}
            <button
              disabled={!!r.approvedAt || (r.context.regulated && !review)}
              onClick={() =>
                void act(async () =>
                  display(
                    await postJson<Revision>(`${base}/${r.version}/approve`, {
                      digest: r.digest,
                      professionalReview: review
                    })
                  )
                )
              }
            >
              Approuver ce plan uniquement
            </button>
            <p className="hint">Pour une demande personnalisée, ouvrez l’assistant de campagne et composition. Il indique les modes disponibles pour votre compte.</p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </details>
  );
}
