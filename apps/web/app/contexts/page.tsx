'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, BrandContext } from '../../lib/api';
import StudioNav from '../../components/StudioNav';

export default function ContextsPage() {
  const [items, setItems] = useState<BrandContext[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api<{ items: BrandContext[] }>('/api/contexts');
        setItems(data.items);
        if (data.items.length > 0) setSelectedId(data.items[0].id);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement impossible.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const selected = items.find((item) => item.id === selectedId) || null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <StudioNav />
        <div className="topbar-actions">
          <Link className="btn btn-primary btn-small" href="/contexts/new" data-testid="contexts-new">Nouveau contexte</Link>
        </div>
      </header>
      <main className="page" data-testid="contexts-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Bibliotheque de marque</p>
            <h1>Contextes</h1>
            <p className="muted">Fiches reutilisables pour preparer briefs et productions. Les revisions et actifs ne sont pas encore exposes par l API.</p>
          </div>
        </section>

        {loading ? <p className="muted" role="status">Chargement des contextes...</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <section className="card empty-state" data-testid="contexts-empty">
            <h2>Aucun contexte</h2>
            <p className="muted">Commencez par une fiche de marque reutilisable : nom, description, audience, ton et couleurs.</p>
            <Link className="btn btn-primary" href="/contexts/new">Creer le premier contexte</Link>
          </section>
        ) : null}

        {items.length > 0 ? (
          <div className="contexts-layout">
            <section className="card" aria-labelledby="contexts-list-heading">
              <div className="section-head"><h2 id="contexts-list-heading">Vos contextes</h2><span className="muted small">{items.length}</span></div>
              <div className="contexts-list" data-testid="contexts-list" role="list">
                {items.map((context) => (
                  <button key={context.id} type="button" role="listitem" className={'context-card' + (context.id === selectedId ? ' is-active' : '')} data-testid={'context-card-' + context.id} onClick={() => setSelectedId(context.id)} aria-pressed={context.id === selectedId}>
                    <span className="color-dot" style={{ background: context.colorPrimary }} aria-hidden="true" />
                    <span>
                      <strong>{context.name}</strong>
                      <span className="muted small">{context.audience || 'audience non renseignee'} / {context.tone || 'ton non renseigne'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="card" aria-labelledby="context-detail-heading" data-testid="context-detail">
              <div className="section-head"><h2 id="context-detail-heading">Detail</h2>{selected ? <span className="pill">{selected.name}</span> : null}</div>
              {selected ? (
                <dl className="detail-list">
                  <div><dt>Description</dt><dd>{selected.description}</dd></div>
                  <div><dt>Site</dt><dd>{selected.website || 'non renseigne'}</dd></div>
                  <div><dt>Audience</dt><dd>{selected.audience || 'non renseignee'}</dd></div>
                  <div><dt>Ton</dt><dd>{selected.tone || 'non renseigne'}</dd></div>
                  <div><dt>Couleurs</dt><dd><span className="color-dot" style={{ background: selected.colorPrimary }} aria-hidden="true" /> {selected.colorPrimary} / <span className="color-dot" style={{ background: selected.colorSecondary }} aria-hidden="true" /> {selected.colorSecondary}</dd></div>
                </dl>
              ) : <p className="muted">Selectionnez un contexte.</p>}
              <div className="studio-banners">
                <span className="studio-banner studio-banner--warn" data-testid="context-revisions-status">Revisions de contexte : backend present, lecture UI non exposee</span>
                <Link className="studio-banner studio-banner--info" href="/assets" data-testid="context-assets-status">Actifs : contrat defini, backend non connecte</Link>
              </div>
              <p className="hint">La creation d un projet reste disponible depuis l accueil ou le formulaire projet.</p>
              <Link className="btn btn-secondary" href="/projects/new">Preparer une creation</Link>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
