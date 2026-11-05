# ADR 0023 — Propositions de conversation démo et storyboard issu du brief

- Date : 2026-11-05 ; statut : accepté pour la tranche 6D.
- Exigences : PRD-03/06/08/09, CDC-F-024/030/040/042/044, CDC-N-001/003/005.

La conversation utilise des scénarios déterministes identifiés MOCK : aide, proposition de brief, clarification, préparation d’une correction par Scene ID et renvoi vers la confirmation humaine. Les champs saisis sont distingués des valeurs enregistrées et des exemples à valider. Les messages restent limités au projet et ne constituent pas un apprentissage de préférences.

Une colonne JSON facultative Message.proposal conserve une proposition structurée avec sa provenance et ses références de version. Les messages historiques restent inchangés. Le chat ne sauvegarde pas de brief, ne confirme pas de version, ne lance pas de run et ne transfère pas de média. Un bouton explicite copie la proposition dans le formulaire ; les cas d’usage existants assurent ensuite enregistrement, confirmation exacte et lancement.

Une proposition de brief référence la version et le checksum courants, ou leur absence initiale. Une correction référence le Scene ID et sa version/checksum, ainsi que le master relu. Une proposition devenue obsolète reste visible dans l’historique mais son bouton de reprise est désactivé ; aucune ancienne version n’est écrasée.

Le storyboard déterministe reprend objectif, audience et CTA du brief confirmé, avec des formulations génériques de simulation adaptées au ton. Il n’invente pas de preuve commerciale. Les IDs de scènes et de personnage restent stables ; les descriptions exactes sont conservées dans le snapshot. Le comptage des scènes suit le profil de format ; la disponibilité du rendu reste soumise à la qualification média.
