import Link from 'next/link';
import StudioNav from '../../components/StudioNav';
import { CAPABILITY_STATUS, FORMAT_CATALOG, NETWORK_PROFILES, StudioAvailability } from '../../lib/studio';

function statusLabel(status: StudioAvailability): string {
  if (status === 'AVAILABLE') return 'DISPONIBLE';
  if (status === 'MOCK') return 'MOCK';
  if (status === 'DECLARED_NOT_IMPLEMENTED') return 'DECLARE — NON IMPLEMENTE';
  return 'NON CONNECTE';
}

function statusClass(status: StudioAvailability): string {
  if (status === 'AVAILABLE') return 'badge status-approved';
  if (status === 'MOCK') return 'badge status-review';
  if (status === 'DECLARED_NOT_IMPLEMENTED') return 'badge status-draft';
  return 'badge status-failed';
}

export default function CatalogPage() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <StudioNav />
        <div className="topbar-actions"><span className="muted small">Studio V1</span></div>
      </header>
      <main className="page" data-testid="catalog-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Catalogue reel</p>
            <h1>Reseaux, formats et capacites</h1>
            <p className="muted">Seules les capacites marquees DISPONIBLE sont reellement traversees par le pipeline actuel. Tout le reste est declare, mocke ou non connecte.</p>
          </div>
        </section>

        <section className="card" aria-labelledby="networks-heading" data-testid="catalog-networks">
          <div className="section-head"><h2 id="networks-heading">Profils reseaux</h2><span className="pill">Publication MOCK</span></div>
          <div className="catalog-grid">
            {NETWORK_PROFILES.map((profile) => (
              <article className="catalog-card" key={profile.key}>
                <h3>{profile.label}</h3>
                <p className="muted small">Ratios declares : {profile.aspectRatios.join(' / ')}</p>
                <p className="muted small">Formats declares : {profile.formats.join(', ')}</p>
                <p className="small">{profile.note}</p>
                <span className="badge status-review">POSTIZ MOCK</span>
              </article>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="formats-heading" data-testid="catalog-formats">
          <div className="section-head"><h2 id="formats-heading">Catalogue des formats</h2><span className="muted small">{FORMAT_CATALOG.length} entrees</span></div>
          <div className="catalog-list">
            {FORMAT_CATALOG.map((entry) => (
              <div className="catalog-row" key={entry.key} data-testid={'format-' + entry.key}>
                <div><strong>{entry.label}</strong><p className="muted small">{entry.detail}</p></div>
                <span className={statusClass(entry.availability)}>{statusLabel(entry.availability)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="capabilities-heading" data-testid="catalog-capabilities">
          <div className="section-head"><h2 id="capabilities-heading">Capacites et fonctions futures</h2></div>
          <div className="catalog-list">
            {CAPABILITY_STATUS.map((entry) => (
              <div className="catalog-row" key={entry.key} data-testid={'capability-' + entry.key}>
                <div><strong>{entry.label}</strong><p className="muted small">{entry.detail}</p></div>
                <span className={statusClass(entry.status)}>{statusLabel(entry.status)}</span>
              </div>
            ))}
          </div>
          <p className="hint">Aucun bouton n est propose pour les fonctions futures : elles n ont pas de backend ou de garantie serveur.</p>
        </section>
      </main>
    </div>
  );
}
