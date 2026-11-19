'use client';
import Link from 'next/link';
import { LanguageControl, useWorkspace } from '../../components/WorkspacePreferences';
export default function Terms() {
  const { t } = useWorkspace();
  return (
    <main className="page stack">
      <LanguageControl />
      <h1>{t('Conditions du programme de test', 'Test programme terms')}</h1>
      <p>
        {t(
          'Projet de texte soumis à validation juridique. Ce programme sur invitation ne constitue pas une offre commerciale finale. Les pass utilisent Stripe test, sans paiement réel ni renouvellement automatique.',
          'Draft for legal review. This invitation-only programme is not a final commercial offer. Passes use Stripe test with no real payment or automatic renewal.',
        )}
      </p>
      <h2>{t('Contenus et diffusion', 'Content and publication')}</h2>
      <p>
        {t(
          'N’importez que les contenus dont vous détenez les droits. Vérifiez chaque version et sa destination avant de publier. Une approbation ou un téléchargement ne prouve pas une publication, un prospect ou une vente.',
          'Only upload content you have the rights to use. Review each version and destination before publication. Approval or download is not evidence of publication, a lead or a sale.',
        )}
      </p>
      <h2>{t('Données et assistance', 'Data and support')}</h2>
      <p>
        {t(
          'Dans Mon compte, consultez vos dossiers, exportez vos données par rubrique ou demandez un effacement après confirmation du mot de passe. Les dossiers fermés sont éligibles à la purge après 90 jours. Les paiements non résolus, médias externes et sauvegardes nécessitent un examen séparé.',
          'In My account, review support tickets, export data by category or request erasure after confirming your password. Closed tickets are eligible for removal after 90 days. Unresolved payments, external media and backups require separate review.',
        )}
      </p>
      <Link href="/account">{t('Mon compte et assistance', 'Account and support')}</Link>
      <Link href="/catalog">{t('Guide', 'Guide')}</Link>
    </main>
  );
}
