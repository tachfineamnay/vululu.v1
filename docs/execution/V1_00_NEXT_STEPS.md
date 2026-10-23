# V1-00 NEXT STEPS — CONDITIONS DE POURSUITE

- **Date** : 2026-10-23
- **Branche** : v1-00-foundation
- **Verdict V1-00** : GO CONDITIONNEL pour V1-01
- **Interdit** : merge main, push, déploiement, publication, provider payant, Postiz réel sans autorisation

## 1. Conditions bloquantes avant V1-01

### C-01 — Terminer la migration Application Layer

- Migrer brief, storyboard, messages, scène, production, approbation et transfert vers des use cases injectés.
- Faire passer ces routes par packages/application ou apps/api/src/application, pas directement par les services Prisma V0.
- Ajouter les ports manquants : CharacterRepository, ProjectBundleQuery, Artifact bootstrap, Brief revision query.
- Supprimer progressivement apps/api/src/services comme dépendance des routes.
- Tests de contrat et intégration pour chaque use case.

### C-02 — Rendre la CI réelle

- Exécuter GitHub Actions après un push humain autorisé ; le statut actuel est NOT_RUN.
- Corriger la configuration Playwright/CI si nécessaire (le webServer est maintenant sur 3100 localement).
- Exécuter le job E2E sur base jetable et le déclarer PASS/FAIL réel.
- Le workflow ne doit jamais produire de faux vert : E2E reste NOT_RUN tant qu'il n'a pas tourné.
- Ajouter une protection de branche et une revue obligatoire avant merge main.

### C-03 — Durcissement sécurité

- Rate limiting login et endpoints coûteux.
- Purge périodique des sessions expirées.
- Révocation globale des sessions d'un utilisateur.
- HTTPS et cookie Secure en préproduction.
- Journalisation des IDOR 404.
- Audit des actions métier (production, approbation, transfert), pas seulement auth/admin.
- Tests de charge login et CSRF.

### C-04 — Snapshots et versions

- Relier BriefRevision et ContextRevision au run (snapshot de production).
- Stocker le snapshot JobRun avec contextRevisionId, briefRevisionId, versions de scène, providerPolicy.
- Ajouter CharacterVersion dans le flux storyboard.
- Corriger l'application layer pour créer revisions et snapshots de façon transactionnelle.

## 2. Priorités V1-01

| Ordre | Chantier | Sortie attendue |
|---|---|---|
| 1 | Use cases production/brief/storyboard/approval/transfer | routes sans services legacy |
| 2 | Snapshots context/brief/run | run reproductible |
| 3 | Rate limit, purge sessions, révocation globale | sécurité V1-01 |
| 4 | CI GitHub exécutée + E2E jetable | preuve CI réelle |
| 5 | ProviderAdapter réel ou mock contractuel avancé | premier provider sans coût |
| 6 | POC Hatchet | durabilité, reprise crash, idempotence |
| 7 | ArtifactStore S3 local/preprod | binaires durables |
| 8 | Postiz adapter réel ou limitation acceptée | handoff idempotent |
| 9 | MCP read-only puis mutations | parité web/MCP |
| 10 | Audit/cost/trace_id | observabilité P0 |

## 3. Ce qui ne doit pas être fait maintenant

- Ne pas activer Hatchet en production sans POC de reprise.
- Ne pas brancher de provider IA payant sans budget, contrat et fallback.
- Ne pas publier via Postiz réel.
- Ne pas merger la V0 ou la V1-00 dans main.
- Ne pas créer de fonctionnalité V2 (Memory Bank, embeddings, préférences apprises, monétisation).
- Ne pas supprimer les anciennes versions ou artefacts.
- Ne pas déclarer un test PASS sans exécution réelle.
- Ne pas masquer la dette lint en excluant des fichiers.

## 4. Dette lint à corriger avant LINT_STRICT=1

- apps/api/src/types.d.ts : import FastifyRequest signalé inutilisé.
- tests/e2e : any tolérés en warning.
- tests API : any tolérés en warning.
- Vérifier les warnings restants après la migration des services legacy.
- Objectif : 0 warning puis LINT_STRICT=1.

## 5. Definition of Done V1-01

- Routes API sans logique métier et sans accès Prisma direct.
- Use cases testés, ports/adapters utilisés.
- Snapshots de run et revisions liées.
- Sessions/RBAC/CSRF tests verts.
- CI GitHub verte, E2E exécuté sur base jetable.
- Aucun secret, aucun push non autorisé, aucun déploiement.
- Documentation et preuves à jour.
- Rollback : V0 et V1-00 conservées sur branches séparées.

## 6. Décisions ouvertes

- Branche V1-01 depuis v1-00-foundation ou depuis main après revue.
- Provider réel choisi et budget.
- Hatchet POC : GO/NO-GO.
- S3 local/preprod.
- Postiz réel vs limitation acceptée.
- Auth MCP (OAuth 2.1 ou token signé).
- Politique de rétention/backup.

## 7. Statut final

V1-00 est une fondation réelle : sessions révocables, RBAC, domaine pur, ports, adaptateurs, migrations, régression 10 s/50 s, 125 tests. Elle est **GO CONDITIONNEL** pour V1-01, pas GO pour une V1 complète ou une production.

Aucun push, merge, déploiement ou publication n'a été effectué.
