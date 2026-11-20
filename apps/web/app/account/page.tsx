'use client';
import {useWorkspace} from '../../components/WorkspacePreferences';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, postJson } from '../../lib/api';
import StudioNav from '../../components/StudioNav';
import { ServiceCases, type Ticket } from '../../components/ServiceCases';
type Product = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  regular: number;
  premium: number;
  imageUnits: number;
  videoUnits: number;
  days: number;
  features: string[];
};
type Balance = { available: number; used: number; held: number };
type Order = {
  id: string;
  status: string;
  mode: 'test' | 'live';
  canCancel: boolean;
  canReceipt: boolean;
  createdAt: string;
  expiresAt: string | null;
  refunded: number;
  product: Product;
  regular: Balance;
  premium: Balance;
};
type View = { mode: 'test' | 'live' | null; checkoutAvailable: boolean; commercial: boolean; suspended: boolean; catalog: Product[]; orders: Order[] };
const money = (n: number, c: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c }).format(n / 100);
const labels: Record<string, string> = {
  PENDING: 'En attente du paiement',
  FAILED: 'Paiement échoué',
  CANCELLED: 'Annulé',
  REFUNDED: 'Remboursé — droits retirés',
  REFUND_REVIEW: 'Incident de remboursement — droits gelés',
  PARTIAL_REVIEW: 'Remboursement partiel — droits gelés',
  PAID: 'Payé',
  EXPIRED: 'Expiré',
  INACTIVE_MODE: 'Historique — droits non utilisables dans le mode actif',
};
export default function Account() {
  const {t}=useWorkspace();
  const [view, set] = useState<View>(),
    [tickets, list] = useState<Ticket[]>([]),
    [error, fail] = useState(''),
    [busy, work] = useState(false),
    [note, say] = useState(''),
    [receipts, showReceipt] = useState<Record<string, string>>({});
  const keys = useRef<Record<string, string>>({});
  async function load() {
    const [v, t] = await Promise.all([
      api<View>('/api/billing/account'),
      api<Ticket[]>('/api/billing/tickets'),
    ]);
    set(v);
    list(t);
  }
  useEffect(() => {
    load().catch((e) => fail(e.message));
    if (!new URLSearchParams(location.search).has('return')) return;
    say('Retour de Stripe : seuls les paiements confirmés activent les droits.');
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts >= 5) clearInterval(timer);
      api<View>('/api/billing/account').then(set).catch(() => { /* Manual refresh remains available. */ });
    }, 2500);
    return () => clearInterval(timer);
  }, []);
  async function act(fn: () => Promise<void>) {
    work(true);
    fail('');
    say('');
    try {
      await fn();
      await load();
    } catch (x) {
      fail((x as Error).message);
    } finally {
      work(false);
    }
  }
  return (
    <div className="shell" data-vululu-theme="blue">
      <StudioNav />
      <main className="page stack">
        <header>
          <p className="eyebrow">ESPACE CLIENT{view?.mode ? ` · STRIPE ${view.mode.toUpperCase()}` : ''}</p>
          <h1>{t("Abonnement et assistance","Billing and support")}</h1>
          <p>
            Pass prépayés sans reconduction. {view?.mode === 'test' && 'Mode test : aucun paiement réel.'} Les fournisseurs externes nécessitent aussi une connexion et un budget autorisés.
          </p>
        </header>
        <Link className="btn btn-secondary" href="/account/security">{t('Profil et sécurité', 'Profile and security')}</Link>
        {error && <p role="alert">{error}</p>}
        {note && <p role="status">{note}</p>}
        <button disabled={busy} onClick={() => act(load)}>
          Actualiser mon compte
        </button>
        {view && (
          <>
            {view.suspended && (
              <p role="alert">
                Compte suspendu. Les actions de création sont bloquées. Vos dossiers restent accessibles.
              </p>
            )}
            <section className="card stack">
              <h2>{t("Mes droits et paiements","Entitlements and payments")}</h2>
              {!view.orders.length && <p>Aucun achat enregistré.</p>}
              {view.orders.map((o) => (
                <article key={o.id}>
                  <h3>
                    {o.product.name} · {labels[o.status]}
                  </h3>
                  <p>
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')} ·{' '}
                    {money(o.product.amount, o.product.currency)} · {o.mode === 'test' ? 'Test' : 'Réel'} · référence {o.id}
                  </p>
                  {o.expiresAt && <p>Fin du pass : {new Date(o.expiresAt).toLocaleString('fr-FR')}</p>}
                  {o.refunded > 0 && <p>Remboursement constaté : {money(o.refunded, o.product.currency)}</p>}
                  {(['regular', 'premium'] as const).map((k) => (
                    <p key={k}>
                      {k === 'regular' ? 'Créations' : 'Crédits média'} : {o[k].available} disponibles ·{' '}
                      {o[k].held} réservés · {o[k].used} consommés
                    </p>
                  ))}
                  {o.canReceipt && (receipts[o.id] ? <p><a href={receipts[o.id]} target="_blank" rel="noopener noreferrer">Ouvrir le reçu de paiement Stripe</a></p> :
                    <button type="button" disabled={busy} onClick={() => act(async () => {
                      const { url } = await postJson<{ url: string }>(`/api/billing/orders/${o.id}/receipt`, {});
                      showReceipt((prev) => ({ ...prev, [o.id]: url }));
                    })}>Afficher le lien du reçu Stripe</button>)}
                  {o.canCancel && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          await postJson('/api/billing/orders/' + o.id + '/cancel', {});
                          say('Expiration demandée. Actualisez après confirmation Stripe.');
                        })
                      }
                    >
                      Fermer le paiement
                    </button>
                  )}
                </article>
              ))}
            </section>
            <section className="card stack">
              <h2>{t("Catalogue approuvé","Approved catalog")}</h2>
              {!view.catalog.length && <p>Aucune offre commerciale approuvée.</p>}
              {!view.checkoutAvailable && <p>Les nouveaux paiements sont indisponibles. Votre historique reste accessible.</p>}
              {view.catalog.map((p) => (
                <article key={p.id}>
                  <h3>
                    {p.name} · {money(p.amount, p.currency)}
                  </h3>
                  <p>
                    {p.days} jours · {p.regular} créations · {p.premium} crédits média. Image : {p.imageUnits}{' '}
                    crédits ; vidéo : {p.videoUnits}. Fonctions : {p.features.join(', ')}.
                  </p>
                  <p>
                    Un échec confirmé libère la réservation ; une issue inconnue reste à vérifier.
                    Remboursement intégral : fin des droits. Remboursement partiel : gel pour examen.
                  </p>
                  <button
                    disabled={busy || view.suspended || !view.checkoutAvailable}
                    onClick={() =>
                      act(async () => {
                        const requestKey = (keys.current[p.id] ??= crypto.randomUUID());
                        const res = await postJson<{ url: string }>('/api/billing/checkout', {
                          productId: p.id,
                          requestKey,
                        });
                        window.location.assign(res.url);
                      })
                    }
                  >
                    {view.mode === 'live' ? 'Continuer vers le paiement Stripe' : 'Acheter en mode test'}
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
        <section className="card stack">
          <h2>{t("Contacter l’assistance","Contact support")}</h2>
          <p>Ne transmettez ni numéro de carte ni secret.</p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              void act(async () => {
                await postJson('/api/billing/tickets', {
                  subject: f.get('subject'),
                  message: f.get('message'),
                });
                form.reset();
                say('Demande enregistrée.');
              });
            }}
          >
            <label>
              Objet
              <input name="subject" minLength={2} maxLength={120} required />
            </label>
            <label>
              Message
              <textarea name="message" minLength={2} maxLength={3000} required />
            </label>
            <button disabled={busy}>Ouvrir un dossier</button>
          </form>
        </section>
        <ServiceCases items={tickets} mode="customer" reload={load} />
        <details className="card">
          <summary>Mes données personnelles</summary>
          <p>
            L’export JSON porte sur la rubrique choisie. Les fichiers créatifs sont téléchargeables depuis le
            Studio. La suppression est examinée par un administrateur, jamais immédiate.
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              void act(async () => {
                const password = f.get('password');
                form.reset();
                if (f.get('section') === 'delete') {
                  await postJson('/api/billing/privacy/erasure', { password, confirm: f.get('confirm') });
                  say('Demande de suppression enregistrée.');
                  return;
                }
                const data: unknown[] = [];
                let next: string | null = null;
                do {
                  const page: { data: unknown; next: string | null } = await postJson(
                    '/api/billing/privacy/export',
                    { password, section: f.get('section'), ...(next ? { after: next } : {}) },
                  );
                  data.push(page.data);
                  next = page.next;
                } while (next);
                const url = URL.createObjectURL(
                    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                  ),
                  a = document.createElement('a');
                a.href = url;
                a.download = 'vululu-' + f.get('section') + '.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
              });
            }}
          >
            <label>
              Rubrique
              <select name="section">
                {[
                  'profile',
                  'billing',
                  'projects',
                  'calendar',
                  'campaigns',
                  'contexts',
                  'briefs',
                  'messages',
                  'assets',
                  'tickets',
                  'delete',
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Mot de passe actuel
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <label>
              Pour une suppression uniquement, saisir DELETE
              <input name="confirm" />
            </label>
            <button disabled={busy}>Confirmer la demande</button>
          </form>
        </details>
        <Link href="/">Retour au Studio</Link>
      </main>
    </div>
  );
}
