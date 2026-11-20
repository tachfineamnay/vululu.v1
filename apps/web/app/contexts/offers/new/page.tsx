'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import StudioNav from '../../../../components/StudioNav';
import { useWorkspace } from '../../../../components/WorkspacePreferences';
import { api, postJson, type BrandContext } from '../../../../lib/api';

export default function NewOffer() {
  const { t } = useWorkspace();
  const router = useRouter();
  const [context, setContext] = useState<BrandContext>();
  const [name, setName] = useState('');
  const [returnPath, setReturnPath] = useState('/contexts/offers/new');
  const [onboarding, setOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    setOnboarding(query.get('onboarding') === '1');
    setReturnPath(window.location.pathname + window.location.search);
    void api<{ items: BrandContext[] }>('/api/contexts').then(({ items }) => {
      if (active) setContext(items.find((item) => item.id === query.get('context')));
    }).catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const contextQuery = context ? encodeURIComponent(context.id) : '';
  const projectHref = `/projects/new?context=${contextQuery}${onboarding ? '&onboarding=1' : ''}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!context || busy) return;
    setBusy(true); setError('');
    try {
      const offer = await postJson<{ id: string }>('/api/calendar/offers', { contextId: context.id, name: name.trim(), confirmed: true });
      router.push(onboarding ? `${projectHref}&offer=${encodeURIComponent(offer.id)}` : `/calendar?offer=${encodeURIComponent(offer.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Création impossible.', 'Could not create the offer.'));
    } finally { setBusy(false); }
  }
  return <div className="shell" data-vululu-theme="blue">
    <StudioNav />
    <main className="page narrow stack">
      {onboarding && <p className="eyebrow">{t('Bienvenue · Étape 2 sur 3', 'Welcome · Step 2 of 3')}</p>}
      <h1>{onboarding ? t('Créez votre première offre', 'Create your first offer') : t('Ajouter une offre', 'Add an offer')}</h1>
      {loading && <p role="status">{t('Chargement du profil d’activité…', 'Loading your business profile…')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && !context && <>
        <p>{t('Ce profil d’activité n’est pas accessible.', 'This business profile is not accessible.')}</p>
        <Link href="/contexts">{t('Consulter vos profils', 'View your profiles')}</Link>
        <Link href={'/login?next=' + encodeURIComponent(returnPath)}>{t('Se connecter', 'Sign in')}</Link>
      </>}
      {context && <form className="card stack" onSubmit={save} aria-busy={busy}>
        <p className="muted">{t('Nommez un produit ou service de votre activité :', 'Name a product or service from your business:')} <strong>{context.name}</strong></p>
        <label className="label">{t('Nom de l’offre', 'Offer name')}<input className="input" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? t('Enregistrement…', 'Saving…') : onboarding ? t('Confirmer et créer un projet', 'Confirm and start a project') : t('Confirmer l’offre', 'Confirm offer')}</button>
        {onboarding && <Link href={projectHref} className="text-link">{t('Continuer sans offre', 'Continue without an offer')}</Link>}
      </form>}
    </main>
  </div>;
}
