import Link from 'next/link';
import StudioNav from '../../components/StudioNav';
import { ASSET_CONTRACT_FIELDS, ASSET_CONTRACT_STATUS } from '../../lib/studio';

export default function AssetsPage() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <StudioNav />
        <div className="topbar-actions"><span className="muted small">Studio V1</span></div>
      </header>
      <main className="page" data-testid="assets-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Contrat d interface</p>
            <h1>Actifs de marque</h1>
            <p className="muted">Logos, images, videos, audios, documents et polices par contexte. Aucun backend Asset n existe encore : l interface affiche le contrat, jamais de fausses donnees.</p>
          </div>
          <span className="badge status-draft" data-testid="assets-not-connected">NON CONNECTE — {ASSET_CONTRACT_STATUS}</span>
        </section>

        <section className="card">
          <div className="section-head"><h2>Contrat propose</h2><span className="pill">API future : GET /api/contexts/:id/assets</span></div>
          <div className="table-wrap">
            <table className="history-table">
              <caption className="sr-only">Champs du contrat Asset</caption>
              <thead><tr><th scope="col">Champ</th><th scope="col">Label</th><th scope="col">Regle</th></tr></thead>
              <tbody>
                {ASSET_CONTRACT_FIELDS.map((field) => (
                  <tr key={field.field}><td><code className="mono small">{field.field}</code></td><td>{field.label}</td><td className="muted small">{field.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Aucun upload, aucune validation MIME/taille, aucune URL signee et aucun controle de droits ne sont implementes. Ces fonctions resteront desactivees tant que le backend et la securite ne sont pas livres.</p>
          <Link className="btn btn-secondary" href="/contexts">Voir les contextes</Link>
        </section>

        <section className="card empty-state">
          <h2>Bibliotheque vide par construction</h2>
          <p className="muted">Aucun actif ne peut etre liste ou ajoute aujourd hui. L interface est prete pour le contrat ; le stockage S3 et les validations sont a implementer.</p>
        </section>
      </main>
    </div>
  );
}
