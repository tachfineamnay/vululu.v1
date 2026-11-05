# V1-DEMO — Composition et complétude du texte

- Date : 2026-11-05 ; tranche 7A, ADR 0026.
- Exigences : PRD-03/04/08/14, CDC-F-020/040/042/050, CDC-N-005/007/008.

Le renderer utilise la taille réelle du profil : 1080×1920, 1080×1350, 1080×1080 ou 1920×1080. Marque, titre, description et mention DÉMO MOCK ont des zones sans chevauchement. La composition paysage utilise deux colonnes. Le texte est passé comme texte échappé au moteur Pango ; un lien, une balise ou une instruction dans le contenu ne déclenche aucun accès réseau.

Les tailles minimales, à l’échelle de référence 1080 pixels pour le petit côté, sont de 22 pour la marque, 32 pour le titre, 24 pour la description et 20 pour la mention. Une réduction conserve tout le contenu ; une impossibilité de tenir dans la zone provoque media_text_overflow avec le champ concerné, sans exposer son contenu. La limite du formulaire de brief reste inchangée : un long texte valide peut nécessiter une réduction éditoriale avant production. La QA ne compte pas un texte coupé comme succès.

L’audit de disposition lie les zones, empreintes de contenu et version de composition au checksum du PNG. Il est conservé dans les versions et repris lors des corrections ; un audit absent, hors limites ou rattaché à un autre checksum fait échouer le contrôle de disposition. Les snapshots de nouveaux runs contiennent la version de composition. Les anciennes images et historiques restent lisibles ; une correction issue de l’ancienne composition exige un nouveau rendu complet.

Acceptation : changement de fin de texte visible dans les pixels au-delà des anciennes quatre lignes, quatre ratios natifs et limites vérifiées, mots longs/retours à la ligne/accents/balisage littéral, dépassement refusé sans fichier ni version, audit altéré refusé, correction avec audits conservés, compatibilité des snapshots explicite et E2E avec MP4/QA réels. Aucun appel IA ou réseau ni nouveau format rendu disponible par cette tranche.

Référence du moteur natif vérifiée : [constructeur Sharp, options text](https://sharp.pixelplumbing.com/api-constructor/), version locale 0.35.5. La qualification Linux est distincte de cette preuve locale.
