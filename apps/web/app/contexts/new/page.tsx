'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, type BrandContext } from '../../../lib/api';
import { useUnsavedChanges } from '../../../lib/useUnsavedChanges';
import StudioNav from '../../../components/StudioNav';
import ContextFields, { type ContextDraft } from '../../../components/ContextFields';

export default function NewContextPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ContextDraft>({ name: '', website: '', description: '', audience: '', tone: '', colorPrimary: '#2347be', colorSecondary: '#f5d867' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [returnToProject, setReturnToProject] = useState(false);
  useEffect(() => { setReturnToProject(new URLSearchParams(window.location.search).get('returnTo') === 'project'); }, []);
  useUnsavedChanges(!saved && dirty);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { context } = await postJson<{ context: BrandContext }>('/api/contexts', draft);
      setSaved(true); router.push((returnToProject ? '/projects/new?context=' : '/contexts?context=') + encodeURIComponent(context.id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#new-context-main">Aller au contenu</a>
    <header className="topbar"><Link href="/" className="brand" aria-label="Vululu, mes projets">vululu</Link><StudioNav /><Link href={returnToProject ? '/projects/new' : '/contexts'} className="text-link">{returnToProject ? 'Retour au nouveau projet' : 'Retour aux contextes'}</Link></header>
    <main id="new-context-main" tabIndex={-1} className="page narrow stack">
      <p className="eyebrow">Marques et références</p><h1>Créer un contexte</h1><p className="muted">Une marque, une activité, un univers créatif : commencez par ce qui compte. Seuls le nom et la description sont obligatoires.</p>
      <form className="card stack" onSubmit={submit} aria-busy={busy}>
        <ContextFields value={draft} onChange={(field, value) => { setDirty(true); setDraft((current) => ({ ...current, [field]: value })); }} disabled={busy} />
        {error ? <div className="error" role="alert" data-testid="context-error"><p>{error}</p><p>Le contexte n’a pas pu être créé. Votre saisie est conservée ; corrigez-la ou réessayez.</p></div> : null}
        <p className="hint">Ces informations sont déclarées par vous. Les références et les ressources pourront être complétées après l’enregistrement.</p>
        <button className="btn btn-primary" data-testid="context-submit" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Créer le contexte'}</button>
        {busy ? <p role="status">Enregistrement du contexte…</p> : null}
      </form>
    </main>
  </div>;
}
