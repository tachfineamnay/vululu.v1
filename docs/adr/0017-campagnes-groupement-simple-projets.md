# ADR-0017 — Campagnes : regroupement simple de projets

- Date : 2026-11-04.
- Statut : Acceptée pour l’implémentation locale V1-DEMO ; revue de release requise.
- Décideur technique : agent d’exécution du plan V1-DEMO autorisé ; aucune validation humaine de production revendiquée.
- Sources : PRD-16, CDC-F-013, CDC-N-001, ADR-0001/0016 et contrat V1_DEMO_CAMPAIGNS_CONTRACT.

## Décision

Campaign est un regroupement explicite appartenant à un utilisateur. Un projet peut appartenir à zéro ou une campagne par une référence nullable ; plusieurs projets du même propriétaire peuvent être regroupés. Le rattachement ou déplacement est indépendant de la production : il ne change aucun brief, scène, run, coût ou snapshot.

Les cas d’usage et le repository filtrent par propriétaire ; un super-admin n’acquiert pas un partage implicite. L’adaptateur revalide les propriétaires des deux ressources dans une transaction. Une affectation répétée ne duplique pas la relation. Les mutations sont auditées et utilisent les mêmes cas d’usage pour les futurs transports Web/MCP.

## Conséquences et alternatives

La migration est additive et compatible avec les projets existants (campaignId null). L’ancienne application peut fonctionner sur ce schéma. Le retrait d’un projet de son groupe ne supprime pas le projet ; aucune fonction de suppression de campagne ou purge n’est livrée ici.

Une relation plusieurs-à-plusieurs n’est pas nécessaire au regroupement simple demandé et ajouterait une gestion supplémentaire sans exigence correspondante. Une campagne comme contexte hiérarchique enrichi ou mémoire sémantique serait hors V1. Un partage inter-user n’est pas prévu par le PRD.

## Preuves

Tests domaine, cas d’usage, API/IDOR/CSRF, migration depuis les 12 versions précédentes, conservation des snapshots et E2E de création/rattachement/retrait. Voir docs/execution/V1_DEMO_05_CAMPAIGNS.md. La validation Linux/Coolify reste distincte de cette décision de modèle.
