# AGENTS.md — Instructions de développement pour agents IA

Ce fichier s'applique à tout agent (DeepSeek Harness, Codex, Claude, Cursor, MCP client) qui travaille dans ce dépôt. Il prime sur les habitudes génériques de l'agent.

## 1. Autorité documentaire

Ordre de lecture obligatoire :

1. README.md
2. docs/README.md
3. docs/01_PRD_V1.md
4. docs/02_CAHIER_DES_CHARGES_V1.md
5. docs/03_ARCHITECTURE_V1.md
6. docs/adr/README.md et les ADR applicables
7. docs/11_BACKLOG.md et docs/backlog/ROADMAP_V1.md
8. docs/backlog/P0_0_AUDIT_FONDATIONS.md
9. docs/INAUGURATION_REPORT.md

Les documents de docs/ sont fondateurs ou d'inauguration. Les documents importés (PRD, CDC, architecture, backlog, prompt, note V2) sont **verbatim** : ne jamais les modifier. Une évolution passe par un nouveau document, un ADR ou une révision explicite.

En cas de contradiction entre documents, **arrêter** et signaler le conflit. Ne pas choisir silencieusement.

## 2. Périmètre

- V1 uniquement : outil interne, invitations, contextes, workflow, agents, production média, correction par Scene ID, MCP, contrôle qualité, Postiz.
- **V2 interdit** : Memory Bank, mémoire sémantique, embeddings, apprentissage des préférences, contextes hiérarchiques enrichis, monétisation, abonnements, crédits, marketplace, Everything LLM.
- Les points d'extension V2 sont documentés ; les implémenter serait une violation de périmètre.
- Ne pas ajouter de fonctionnalité non demandée, même « utile ».
- Ne pas créer de structure applicative avant le lot qui la justifie.

## 3. Règles absolues

- **Aucun secret** dans le dépôt : clé API, token, mot de passe, certificat, fichier .env, identifiant privé, donnée client.
- **Jamais de git push --force**, de réécriture d'historique distant, de suppression de commit ou de fichier non demandée.
- **Jamais de publication** (Postiz, réseau social, déploiement public) sans approbation humaine explicite.
- **Aucun succès fictif** : si un test n'a pas tourné, écrire NOT_RUN ; si un fournisseur est mocké, écrire MOCK.
- **Aucune dépendance payante** ou compte externe sans autorisation.
- **Aucune modification silencieuse** du périmètre, des contrats ou des décisions d'architecture.
- **Aucun accès direct** depuis MCP à PostgreSQL, Hatchet ou Postiz.

## 4. Invariants d'architecture

- Domain Core pur : pas de SDK fournisseur, pas de Prisma, pas de Hatchet, pas de Postiz.
- Application Layer : cas d'usage, RBAC, budgets, idempotence, composition.
- Infrastructure : adaptateurs remplaçables derrière des ports.
- PostgreSQL source de vérité ; S3-compatible pour les binaires ; pas de blobs lourds en base.
- Snapshots figés au lancement d'un run : contexte, brief, configs agents, politique fournisseur, workflow.
- Identifiants stables : project_id, scene_id, character_id ; les identifiants fournisseurs sont des bindings facultatifs.
- Artefacts immuables : nouvelle version plutôt qu'écrasement ; checksum et provenance.
- Approbation d'une version exacte (version + checksum) avant transfert.
- Postiz est externe ; le transfert est idempotent et journalisé ; transféré ne signifie pas publié.
- MCP et web partagent les mêmes cas d'usage et le même RBAC.
- Workers désactivables sans casser l'interface ; reprise après crash sans duplication.

## 5. Méthode de travail par lot

Pour chaque lot :

1. Identifier les exigences PRD/CDC concernées et les lister.
2. Définir les interfaces, les contrats et les critères d'acceptation.
3. Implémenter uniquement le périmètre du lot.
4. Exécuter les tests pertinents (unitaires, contrat, intégration, E2E).
5. Fournir les preuves : commandes, résultats, limitations.
6. Vérifier le diff, l'absence de secrets et l'absence de régression.
7. Mettre à jour la roadmap et proposer la suite.

Un lot ne se termine pas sans preuve. Un lot qui échoue doit être reverté ou corrigé avant la suite.

## 6. Tests et preuves

- Tests unitaires sur le domaine et les cas d'usage.
- Tests de contrat sur les adaptateurs (providers, Postiz, stockage, MCP).
- Tests d'intégration sur PostgreSQL et les files.
- Tests E2E sur la verticale concernée.
- Mocks explicites quand un fournisseur réel n'est pas disponible.
- Toute limitation est écrite dans le rapport de lot.
- Les tests de sécurité (IDOR, RBAC, SSRF, upload) sont obligatoires sur les lots concernés.

## 7. Documentation et décisions

- Toute décision structurante devient un ADR dans docs/adr/.
- Ne pas modifier un ADR accepté : en créer un nouveau qui le remplace.
- Les documents importés restent verbatim ; les ajouts vont dans docs/.
- Langue : documentation en français, identifiants de code en anglais. Toute exception doit être justifiée.
- Dates au format ISO 8601. Référencer les IDs PRD-xx, CDC-F-xxx, CDC-N-xxx, E00-xx.

## 8. Git

- Branche de référence : main.
- Commits courts, au présent, préfixés : feat, fix, docs, chore, test, refactor, adr.
- Un commit doit être relisible et réversible.
- Pas de commit de fichiers générés, de secrets ou de dépendances lourdes.
- Avant commit : scripts/check-secrets.ps1, git diff --check, relecture du diff.
- Pas de force push. Pas de réécriture d'une branche partagée.
- Protection de main et PR obligatoire : décision ouverte D-10.

## 9. Sécurité

- RBAC côté serveur, filtrage par propriétaire sur toutes les lectures et écritures, tests IDOR.
- Secrets uniquement côté serveur ; jamais dans le frontend, les logs, les artefacts ou les erreurs.
- Validation des entrées, protection SSRF sur les URLs, contrôle des uploads.
- Journalisation : actor_id, project_id, run_id, scene_id, provider_id, trace_id, versions, coûts, horodatage.
- Ne jamais afficher un secret dans une sortie de commande ou un rapport.

## 10. Definition of Done

- Code typé et documenté, migration si nécessaire.
- Tests unitaires et de contrat verts, intégration/E2E pertinents verts.
- RBAC et isolation vérifiés.
- Coûts et traces mesurés.
- Documentation/ADR mis à jour.
- Diff relu, aucun secret.
- Preuves fournies, limitations écrites.
- Rollback décrit.

## 11. Conditions d'arrêt

Arrêter et demander une décision si :

- une spécification est contradictoire ou manquante ;
- le dépôt distant n'est pas vide alors qu'un premier push est attendu ;
- une action destructive est nécessaire ;
- un secret est détecté ;
- une fonctionnalité V2 est demandée ;
- un coût fournisseur doit être engagé sans budget ;
- l'environnement ne permet pas d'exécuter un test obligatoire.

## 12. Références

- [README](README.md)
- [Index documentaire](docs/README.md)
- [Rapport d'inauguration](docs/INAUGURATION_REPORT.md)
- [Roadmap](docs/backlog/ROADMAP_V1.md)
- [ADR](docs/adr/README.md)
