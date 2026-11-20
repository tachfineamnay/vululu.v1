'use client';
import Link from 'next/link';
import { LanguageControl, useWorkspace } from '../../components/WorkspacePreferences';
export default function Terms() {
  const { t } = useWorkspace();
  return (
    <main className="page stack">
      <LanguageControl />
      <h1>{t('Informations et conditions', 'Information and terms')}</h1>
      <p>
        {t(
          'Informations produit, soumises à validation juridique avant ouverture des ventes. Mon compte indique si les achats sont indisponibles, en test sans débit, ou en mode réel. Les pass ne sont pas renouvelés automatiquement.',
          'Product information, subject to legal review before sales open. My account shows whether purchases are unavailable, in test mode without a charge, or live. Passes do not renew automatically.',
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
