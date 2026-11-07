import StudioNav from '../../components/StudioNav';
import { CAPABILITY_STATUS, FORMAT_CATALOG, NETWORK_PROFILES, StudioAvailability } from '../../lib/studio';

function statusLabel(status: StudioAvailability): string {
  if (status === 'AVAILABLE') return 'DISPONIBLE';
  if (status === 'MOCK') return 'MOCK';
  if (status === 'DECLARED_NOT_IMPLEMENTED') return 'DÉCLARÉ — NON IMPLÉMENTÉ';
  return 'NON CONNECTÉ';
}

function statusClass(status: StudioAvailability): string {
  if (status === 'AVAILABLE') return 'badge status-approved';
  if (status === 'MOCK') return 'badge status-review';
  if (status === 'DECLARED_NOT_IMPLEMENTED') return 'badge status-draft';
  return 'badge status-failed';
}

export default function CatalogPage() {
  return (
    <div className="shell" data-vululu-theme="blue">
      <a className="skip-link" href="#catalog-main">Aller au contenu</a>
      <StudioNav><div className="topbar-actions"><span className="muted small">Studio V1</span></div></StudioNav>
      <main id="catalog-main" tabIndex={-1} className="page" data-testid="catalog-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h1>Réseaux, formats et capacités</h1>
            <p className="muted">Les capacités disponibles sont utilisables. Les autres sont simulées, déclarées ou non connectées.</p>
          </div>
        </section>

        <section className="card" aria-labelledby="networks-heading" data-testid="catalog-networks">
          <div className="section-head"><h2 id="networks-heading">Profils réseaux</h2><span className="pill">Publication MOCK</span></div>
          <div className="catalog-grid">
            {NETWORK_PROFILES.map((profile) => (
              <article className="catalog-card" key={profile.key}>
                <h3>{profile.label}</h3>
                <p className="muted small">Ratios déclarés : {profile.aspectRatios.join(' / ')}</p>
                <p className="muted small">Formats déclarés : {profile.formats.map((format) => format === 'Video' ? 'Vidéo' : format).join(', ')}</p>
                <p className="small">{profile.note}</p>
                <span className="badge status-review">POSTIZ MOCK</span>
              </article>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="formats-heading" data-testid="catalog-formats">
          <div className="section-head"><h2 id="formats-heading">Catalogue des formats</h2><span className="muted small">{FORMAT_CATALOG.length} entrées</span></div>
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
          <div className="section-head"><h2 id="capabilities-heading">Capacités et fonctions futures</h2></div>
          <div className="catalog-list">
            {CAPABILITY_STATUS.map((entry) => (
              <div className="catalog-row" key={entry.key} data-testid={'capability-' + entry.key}>
                <div><strong>{entry.label}</strong><p className="muted small">{entry.detail}</p></div>
                <span className={statusClass(entry.status)}>{statusLabel(entry.status)}</span>
              </div>
            ))}
          </div>
          <p className="hint">Les fonctions futures restent indisponibles tant qu’elles ne sont pas connectées.</p>
        </section>
      </main>
    </div>
  );
}
