'use client';
import Link from 'next/link';
import { LanguageControl, useWorkspace } from './WorkspacePreferences';
import { betaCopy, useBetaStatus } from '../lib/beta';

export function PublicLanding() {
  const { t } = useWorkspace();
  const beta = useBetaStatus();
  const copy = betaCopy(t);
  return <div data-vululu-theme="blue">
    <main className="page stack">
      <header className="actions"><strong className="brand">vululu</strong><LanguageControl /><Link href="/login">{t('Se connecter', 'Sign in')}</Link></header>
      <section className="card stack">
        <p className="eyebrow">{t('Le studio marketing des indépendants', 'The marketing studio for solo businesses')}</p>
        {beta?.beta ? (
          <p className="hint" data-testid="beta-badge">
            <strong>{copy.badge}</strong> · {copy.noPayment}
          </p>
        ) : null}
        <h1>{t('De votre offre à votre prochaine publication', 'Take your offer from idea to publication')}</h1>
        <p>{t('Préparez votre semaine, créez vos contenus et approuvez la version à partager, dans un seul espace.', 'Plan your week, create your content and approve the version you want to share, in one workspace.')}</p>
        <div className="actions"><Link className="btn btn-primary" href="/register">{t('Créer un compte', 'Create an account')}</Link><Link href="/login">{t('Retrouver mon studio', 'Open my studio')}</Link></div>
      </section>
      <section className="card stack">
        <h2>{t('Préparer, créer, publier et suivre', 'Plan, create, publish and track')}</h2>
        <ol className="stack">
          <li>{t('Enregistrez votre profil d’activité et vos offres, puis choisissez vos idées dans le calendrier hebdomadaire.', 'Save your business profile and offers, then choose ideas from your weekly calendar.')}</li>
          <li>{t('Transformez une idée en brief, aidez-vous des suggestions locales ou de l’IA si elle est disponible, puis composez un post, une story, un carrousel ou une vidéo.', 'Turn an idea into a brief, use local suggestions or AI when available, and compose a post, story, carousel or video.')}</li>
          <li>{t('Téléchargez le fichier approuvé et sa légende. La programmation directe demande une connexion Postiz compatible et votre autorisation.', 'Download the approved file and caption. Direct scheduling requires a compatible Postiz connection and your authorization.')}</li>
          <li>{t('Retrouvez vos exports et, lorsqu’ils sont disponibles, les reçus et mesures des publications. Gérez vos crédits et demandes d’assistance depuis Mon compte.', 'Find exports and, when available, publication receipts and measurements. Manage credits and support requests in My account.')}</li>
        </ol>
        <p className="hint">{beta?.beta
          ? t('Pendant la bêta, l’accès est gratuit : aucun pass ni carte bancaire. Les fonctions externes payantes restent soumises à une autorisation et à un budget configurés. Un téléchargement ne publie rien.', 'During the beta, access is free: no pass and no credit card. Paid external features still require explicit authorization and a configured budget. Downloading does not publish anything.')
          : t('Les fonctions payantes dépendent de la configuration et des droits affichés dans votre compte. Un téléchargement ne publie rien.', 'Paid features depend on configuration and the entitlements shown in your account. Downloading does not publish anything.')}</p>
      </section>
      <footer><Link href="/terms">{t('Informations et conditions', 'Information and terms')}</Link></footer>
    </main>
  </div>;
}
