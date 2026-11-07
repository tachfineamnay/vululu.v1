# V1-DEMO — Périmètre d’exécution

- Date : 2026-11-04.
- Décision utilisateur : V1 complète avec compte démo, sans connexion IA, puis « GO ! » sur le plan du 2026-11-04.
- État : exécution autorisée ; recette et déploiement non réalisés.
- Références : PRD-01 à PRD-16, CDC V1.2, E00-01/03/04, ADR-0016.

## Contrat de livraison

La V1-DEMO implémente les parcours du corpus V1 avec des capacités IA déterministes explicitement MOCK. Données, fichiers média, sécurité, workflows, versions, approbations, bibliothèque, campagnes et transport MCP sont réels. Aucun abonnement, embedding, préférence apprise ou fonctionnalité V2 n’est ajouté.

La recette distingue trois choses : comportement applicatif réel ; simulation d’une capacité externe ; intégration réelle non qualifiée. Le mode démo n’autorise pas à annoncer la qualification de fournisseurs IA ou de Postiz. Aucun fournisseur IA n’est nécessaire au démarrage et aucun appel IA payant n’est permis.

Les échantillons de voix démo ne prétendent pas lire un texte libre : cette limite sera affichée dans les options, la provenance et les preuves. Les sorties image/vidéo et le mix restent des fichiers réellement générés et contrôlés.

## Interfaces et critères

| Capacité | Entrées / sorties | Validation / effets / idempotence |
|---|---|---|
| Accès démo | Credentials serveur → utilisateur ordinaire, session et CSRF | Pas d’accès admin ; pas de bypass ; bootstrap répétable sans changer de compte existant |
| Contexte | Saisie et actifs autorisés → révision validée/checksummée | Faits et hypothèses distingués ; URL non consultée jamais présentée comme analysée ; snapshot immuable |
| Actif | Binaire borné + licence/source → version, SHA, clé opaque | Contrôle MIME/contenu, propriétaire, SSRF/upload ; aucune écriture arbitraire ni overwrite |
| Campagne | Nom + projets du propriétaire → regroupement | Refus inter-user ; aucun enrichissement mémoire |
| Brief | Réseau/format/ratio/durée/usage/style/audio → révision confirmée | Compatibilité serveur, licence sponsorisée, estimation MOCK et consentement avant run |
| Agents démo | Brief + configs figées → plan de capacités et résultats MOCK | Adaptateurs sans réseau IA ; fallback borné, échecs explicites, coûts MOCK |
| Rendu | Plan/scènes/échantillons → médias réels et QA | Versions nouvelles, profils mesurés, reprise et correction limitée aux dépendances invalidées |
| Approbation | Version + SHA + acteur → approbation exacte | Propriété, QA PASS, refus divergence, invalidation après correction |
| Remise | Approbation exacte → TransferRecord MOCK | Idempotence et reprise, jamais une publication réseau |
| MCP | HTTPS + identité/scopes + outil typé → résultat du cas d’usage | RBAC commun, aucun SQL/shell, run_id immédiat pour tâches longues |
| Exploitation | Release épinglée + secrets injectés → services supervisés | Migrations sûres, S3 privé, crash/reprise, backup/restore/rollback prouvés |

Les signatures et schémas détaillés sont fixés dans les lots propriétaires avant leur implémentation ; les contrats déjà présents dans packages/application et packages/contracts restent la base. Aucun contrat fournisseur live n’est inventé dans ce document.

## État de référence réconcilié

Le README et la roadmap décrivaient encore la Mission 00 ou un V0 sur une branche séparée. Le code local de main au commit bb0bc3a contient déjà API, Web/Admin, domaine, application, persistance, média, orchestration et tests V1. Les documents historiques restent datés et ne servent plus de statut courant.

La dernière recette historique est un GO local et NO-GO staging (2026-11-01). L’analyse du 2026-11-04 a rejoué 82 tests domaine, typage/lint/frontières et scan de contenu ; elle ne certifie pas l’intégration complète. Les résultats nouveaux sont consignés séparément par lot.

## Exploitation et décisions restantes

- Compte démo privé, données fictives, super-admin distinct ; pas de reset automatique destructif.
- Secrets injectés dans Coolify ; jamais fournis en clair dans un rapport.
- S3 et moteur durable à qualifier ; aucun fournisseur payant choisi implicitement.
- Rétention, auth/clients MCP, droits audio et topologie finale font l’objet de décisions spécifiques avant leurs lots.
- Préparation locale autorisée ; aucune ouverture publique ni publication sociale automatique.
- Si un test obligatoire est impossible, le lot reste non clos et la cause est signalée ; aucune preuve MOCK ne remplace une preuve d’exploitation.

Plan : `docs/superpowers/plans/2026-11-04-v1-demo-complete-coolify.md`. Couverture et preuves : `V1_DEMO_TRACEABILITY.md`.
