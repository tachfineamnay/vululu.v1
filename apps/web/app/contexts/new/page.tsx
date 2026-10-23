'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '../../../lib/api';

export default function NewContextPage() {
  const router = useRouter();
  const [name, setName] = useState('Atelier V0');
  const [website, setWebsite] = useState('https://example.com');
  const [description, setDescription] = useState('Une marque de test pour la verticale V0.');
  const [audience, setAudience] = useState('Createurs et petites marques');
  const [tone, setTone] = useState('Chaleureux, direct, premium');
  const [colorPrimary, setColorPrimary] = useState('#6C5CE7');
  const [colorSecondary, setColorSecondary] = useState('#00D2FF');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson('/api/contexts', { name, website, description, audience, tone, colorPrimary, colorSecondary });
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <Link href="/" className="text-link">Retour</Link>
      </header>
      <main className="page narrow">
        <p className="eyebrow">Contexte de marque</p>
        <h1>Une fiche reutilisable</h1>
        <p className="lead">Vululu utilise ce contexte pour produire sans te redemander les memes informations.</p>
        <form className="card stack" onSubmit={submit}>
          <label className="label">Nom de la marque
            <input className="input" data-testid="context-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="label">Site web
            <input className="input" data-testid="context-website" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          <label className="label">Description
            <textarea className="input textarea" data-testid="context-description" value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          <div className="two-col">
            <label className="label">Audience
              <input className="input" data-testid="context-audience" value={audience} onChange={(event) => setAudience(event.target.value)} />
            </label>
            <label className="label">Ton
              <input className="input" data-testid="context-tone" value={tone} onChange={(event) => setTone(event.target.value)} />
            </label>
          </div>
          <div className="two-col">
            <label className="label">Couleur principale
              <input className="input color-input" data-testid="context-color-primary" type="color" value={colorPrimary} onChange={(event) => setColorPrimary(event.target.value)} />
            </label>
            <label className="label">Couleur secondaire
              <input className="input color-input" data-testid="context-color-secondary" type="color" value={colorSecondary} onChange={(event) => setColorSecondary(event.target.value)} />
            </label>
          </div>
          {error ? <p className="error" data-testid="context-error">{error}</p> : null}
          <button className="btn btn-primary" data-testid="context-submit" type="submit" disabled={busy}>
            {busy ? 'Enregistrement...' : 'Valider le contexte'}
          </button>
        </form>
      </main>
    </div>
  );
}
