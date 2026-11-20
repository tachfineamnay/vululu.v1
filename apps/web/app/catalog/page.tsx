'use client';
import Link from 'next/link';
import StudioNav from '../../components/StudioNav';
import { useWorkspace } from '../../components/WorkspacePreferences';
import { betaCopy, useBetaStatus } from '../../lib/beta';
export default function Guide() {
  const { t } = useWorkspace();
  const beta = useBetaStatus();
  const copy = betaCopy(t);
  const steps = [
    [
      '/contexts',
      'Profil métier',
      'Business profile',
      'Confirmez vos références et les droits sur vos fichiers.',
      'Confirm your business details and the rights to your files.',
    ],
    [
      '/calendar',
      'Offres et calendrier',
      'Offers and calendar',
      'Confirmez une offre, choisissez une date et relisez le contenu avant de le planifier.',
      'Confirm an offer, choose a date and review the content before scheduling.',
    ],
    [
      '/projects/new',
      'Studio',
      'Studio',
      'Créez un projet. Ouvrez Composition et versions, choisissez un format, enregistrez une version puis rendez et approuvez son master.',
      'Create a project. Open Composition et versions, choose a format, save a version, then render and approve its master.',
    ],
    [
      '/creations',
      'Créations',
      'Creations',
      'Retrouvez le projet et exportez sa version approuvée. Un export ne publie rien.',
      'Select a project and export its approved version. Exporting does not publish anything.',
    ],
    [
      '/results',
      'Résultats',
      'Results',
      'Une mesure absente n’est pas zéro. Vérifiez la source et la date avant de préparer la semaine suivante.',
      'Missing data is not zero. Check the source and retrieval date before planning next week.',
    ],
    [
      '/account',
      'Accès et assistance',
      'Access and support',
      'Consultez votre accès, votre historique et vos réservations. Ouvrez un dossier pour toute question.',
      'Review your access, history and reservations. Open a ticket if you need help.',
    ],
  ];
  return (
    <div className="shell" data-vululu-theme="blue">
      <a href="#guide" className="skip-link">
        {t('Aller au guide', 'Skip to guide')}
      </a>
      <StudioNav />
      <main id="guide" tabIndex={-1} className="page stack">
        <header>
          <p className="eyebrow">VULULU</p>
          <h1>{t('Guide de création', 'Creation guide')}</h1>
          <p>
            {t(
              'Du profil au résultat : planifiez votre semaine, créez et livrez une version approuvée.',
              'From profile to results: plan your week, create and deliver an approved version.',
            )}
          </p>
          {beta?.beta ? (
            <p className="hint" data-testid="beta-badge">
              <strong>{copy.badge}</strong> · {copy.noPayment} {copy.frozen}
            </p>
          ) : null}
        </header>
        {steps.map(([href, fr, en, frText, enText]) => (
          <article key={href} className="card stack">
            <h2>
              <Link href={href}>{t(fr, en)}</Link>
            </h2>
            <p>{t(frText, enText)}</p>
          </article>
        ))}
        <Link href="/terms">{t('Informations et conditions', 'Information and terms')}</Link>
      </main>
    </div>
  );
}
