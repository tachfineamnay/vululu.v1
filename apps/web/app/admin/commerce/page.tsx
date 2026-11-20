'use client';
import { useEffect, useState } from 'react';
import { api, postJson } from '../../../lib/api';
import { ServiceCases, type Ticket } from '../../../components/ServiceCases';
const features = [
  'creative.render',
  'production.job',
  'marketing.plan@1',
  'assistant.draft@1',
  'media.image@1',
  'media.video@1',
  'postiz.schedule@1',
];
type View = {
  commercial: boolean;
  products: { id: string; name: string; amount: number; currency: string; listed: boolean }[];
  cases: Ticket[];
  incidents: { id: string; userId: string; refunded: number }[];
  holds: { key: string; units: number; bucket: string }[];
};
export default function Commerce() {
  const [v, set] = useState<View>(),
    [unknown, ops] = useState<{ id: string; accountId: string; tool: string }[]>([]),
    [busy, work] = useState(false),
    [err, fail] = useState(''),
    [msg, say] = useState('');
  async function load() {
    set(await api<View>('/api/admin/commerce'));
    ops(await api('/api/admin/execution/incidents'));
  }
  useEffect(() => {
    load().catch((e) => fail(e.message));
  }, []);
  async function send(url: string, data: object) {
    work(true);
    fail('');
    say('');
    try {
      const res = await postJson<{ deleted?: boolean }>(url, data);
      say(res.deleted === false ? 'Examen manuel requis. Compte non supprimé.' : 'Action enregistrée.');
      await load();
    } catch (e) {
      fail((e as Error).message);
    } finally {
      work(false);
    }
  }
  return (
    <div className="stack">
      <h1>Commerce · environnement de test</h1>
      {err && <p role="alert">{err}</p>}
      {msg && <p role="status">{msg}</p>}
      <fieldset disabled={busy} className="stack">
        <section className="card stack">
          <h2>Catalogue</h2>
          <p>
            Pas de prix par défaut. Chaque version publiée est immuable ; masquer une offre ne change pas les
            achats existants.
          </p>
          {v?.products.map((p) => (
            <p key={p.id}>
              {p.name} · {p.amount} unités mineures {p.currency}{' '}
              <button
                onClick={() => send(`/api/admin/commerce/products/${p.id}/list`, { listed: !p.listed })}
              >
                {p.listed ? 'Masquer' : 'Relister'}
              </button>
            </p>
          ))}
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send('/api/admin/commerce/products', {
                name: f.get('name'),
                currency: f.get('currency'),
                evidence: f.get('evidence'),
                ...Object.fromEntries(
                  ['amount', 'days', 'regular', 'premium', 'imageUnits', 'videoUnits'].map((k) => [
                    k,
                    Number(f.get(k)),
                  ]),
                ),
                ownerApproved: f.has('ownerApproved'),
                terms: 'prepaid-v1',
                features: f.getAll('features'),
              });
            }}
          >
            <label>
              Nom
              <input name="name" required />
            </label>
            <label>
              Devise
              <select name="currency">
                <option>eur</option>
                <option>usd</option>
                <option>gbp</option>
              </select>
            </label>
            {[
              ['amount', 'Prix en centimes'],
              ['days', 'Durée en jours'],
              ['regular', 'Créations'],
              ['premium', 'Crédits média'],
              ['imageUnits', 'Crédits par image'],
              ['videoUnits', 'Crédits par vidéo'],
            ].map(([k, label]) => (
              <label key={k}>
                {label}
                <input name={k} type="number" min={['regular', 'premium'].includes(k) ? 0 : 1} required />
              </label>
            ))}
            <fieldset>
              <legend>Fonctions incluses</legend>
              {features.map((f) => (
                <label key={f}>
                  <input type="checkbox" name="features" value={f} />
                  {f}{' '}
                </label>
              ))}
            </fieldset>
            <label>
              Référence de l’accord du propriétaire
              <input name="evidence" required minLength={4} />
            </label>
            <label>
              <input type="checkbox" name="ownerApproved" required /> Le propriétaire a approuvé ces prix,
              limites et règles : prépaiement, consommation au succès, annulation sans dépense, remboursement
              intégral retirant les droits restants, partiel gelant le pass. Sans renouvellement automatique.
            </label>
            <button>Publier cette version test</button>
          </form>
          {!v?.commercial && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send('/api/admin/commerce/enable', {
                  confirm: new FormData(e.currentTarget).get('confirm'),
                });
              }}
            >
              <label>
                Activer les contrôles pour TOUS les comptes : saisir ENABLE TEST ENTITLEMENTS
                <input name="confirm" required />
              </label>
              <button>Activer définitivement sur cette base</button>
            </form>
          )}
        </section>
        <section className="card stack">
          <h2>Comptes et incidents</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send('/api/admin/commerce/accounts/' + encodeURIComponent(String(f.get('user'))), {
                suspended: f.get('action') === 'suspend',
                evidence: f.get('evidence'),
              });
            }}
          >
            <label>
              ID du client
              <input name="user" required />
            </label>
            <label>
              Décision
              <select name="action">
                <option value="suspend">Suspendre</option>
                <option value="resume">Rétablir</option>
              </select>
            </label>
            <label>
              Justificatif
              <input name="evidence" required />
            </label>
            <button>Appliquer</button>
          </form>
          <h3>Remboursements partiels à examiner</h3>
          {!v?.incidents.length
            ? 'Aucun.'
            : v.incidents.map((x) => (
                <p key={x.id}>
                  {x.id} · compte {x.userId} · {x.refunded} unités mineures remboursées
                </p>
              ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send(
                '/api/admin/commerce/orders/' + encodeURIComponent(String(f.get('order'))) + '/reconcile',
                { evidence: f.get('evidence') },
              );
            }}
          >
            <label>
              Commande en examen
              <input name="order" required />
            </label>
            <label>
              Preuve de l’examen
              <input name="evidence" required />
            </label>
            <button>Vérifier les remboursements auprès de Stripe test (lecture seule)</button>
          </form>
          <h3>Coûts fournisseurs inconnus</h3>
          {!unknown.length
            ? 'Aucun.'
            : unknown.map((o) => (
                <p key={o.id}>
                  {o.id} · {o.tool} · {o.accountId}
                </p>
              ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send('/api/admin/execution/' + encodeURIComponent(String(f.get('op'))) + '/resolve', {
                cents: Number(f.get('cents')),
                evidence: f.get('evidence'),
              });
            }}
          >
            <label>
              ID de l’opération à coût inconnu
              <input name="op" required />
            </label>
            <label>
              Coût vérifié (centimes USD)
              <input type="number" name="cents" min={0} required />
            </label>
            <label>
              Référence de preuve (UUID)
              <input name="evidence" required />
            </label>
            <button>Rapprocher le coût fournisseur</button>
          </form>
          <h3>Réservations ouvertes</h3>
          {!v?.holds.length
            ? 'Aucune.'
            : v.holds.map((x) => (
                <p key={x.key}>
                  {x.key} · {x.units} {x.bucket}
                </p>
              ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send(
                '/api/admin/commerce/credits/' + encodeURIComponent(String(f.get('op'))) + '/resolve',
                { consumed: f.get('outcome') === 'used', evidence: f.get('evidence') },
              );
            }}
          >
            <label>
              Opération après rapprochement du coût C05
              <input name="op" required />
            </label>
            <label>
              Issue vérifiée
              <select name="outcome">
                <option value="release">Libérer</option>
                <option value="used">Consommer</option>
              </select>
            </label>
            <label>
              Preuve de l’issue
              <input name="evidence" required />
            </label>
            <button>Rapprocher les crédits</button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void send('/api/admin/commerce/holds/repair', {
                key: f.get('key'),
                evidence: f.get('evidence'),
              });
            }}
          >
            <label>
              Réservation de rendu / production à vérifier
              <input name="key" required />
            </label>
            <label>
              Justificatif
              <input name="evidence" required />
            </label>
            <button>Vérifier la preuve terminale et réparer</button>
          </form>
        </section>
        <ServiceCases items={v?.cases ?? []} mode="admin" reload={load} />
        {v?.cases
          .filter((t) => t.kind === 'ERASURE' && t.status !== 'CLOSED')
          .map((t) => (
            <form
              key={t.id}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send('/api/admin/commerce/erasure/' + t.id, {
                  confirm: f.get('confirm'),
                  evidence: f.get('evidence'),
                });
              }}
            >
              <strong>Examen de suppression : {t.id}</strong>
              <label>
                Justificatif
                <input name="evidence" required />
              </label>
              <label>
                Confirmer : REVIEW DELETE
                <input name="confirm" required />
              </label>
              <button>Examiner et supprimer si admissible</button>
            </form>
          ))}
      </fieldset>
    </div>
  );
}
