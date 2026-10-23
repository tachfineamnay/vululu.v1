# V1-01-A — RISQUES, ÉCARTS ET VERDICT

- **Date** : 2026-10-23
- **Branche** : v1-01-a-application-layer
- **Base** : v1-00-foundation, 83abb8e
- **Statut** : GO CONDITIONNEL
- **Interdictions respectées** : aucun merge main, push, déploiement, provider payant, Postiz réel, Hatchet/S3 activés, fonctionnalité V2

## 1. Ce qui est livré

- Routes ciblées migrées vers des use cases injectés.
- Aucune logique métier dans les routes.
- Use cases sans Prisma ; Domain Core pur.
- Ports et adaptateurs pour contexte, projet, brief, scène, production, snapshot, JobRun, audit.
- Adaptateur legacy encapsulé pour les opérations non encore réécrites.
- Snapshots d entrée et outputs séparés, versionnés, checksummés.
- ContextRevision et BriefRevision rattachées au JobRun.
- JobRun + StepRun transactionnels.
- QA d artefact et outputs de run finalisés dans une transaction.
- 132 tests PASS, E2E 10 s PASS, cible 50 s PASS, migration sur copie PASS.
- Préservation des données et artefacts V0.

## 2. Écarts résiduels

| ID | Écart | Impact | Traitement |
|---|---|---|---|
| E-01 | LegacyWorkflowAdapter contient encore les services Prisma/FFmpeg | Architecture applicative en place, mais implémentation interne partiellement legacy | V1-01-B : extraire brief/storyboard/messages/production/approval/transfer en repositories/use cases métier |
| E-02 | Production exécutée in-process | Pas de reprise crash, pas de retry, pas de durabilité | POC Hatchet V1-01-B/V1-02, port Orchestrator |
| E-03 | Capture snapshot et insertion JobRun non atomiques | Les révisions sont immuables, mais la capture est une lecture préalable | Envisager une transaction combinée lecture+insertion ou verrou de révision |
| E-04 | Fichiers médias hors transaction PostgreSQL | Crash entre écriture et DB possible, orphelins possibles | GC d artefacts et checksums, S3 en V1-02 |
| E-05 | Storyboard legacy crée personnage, CharacterVersion et scènes sans transaction unique | Risque de storyboard partiel si arrêt au milieu | V1-01-B : use case transactionnel |
| E-06 | Approbation/transfert passent par l adaptateur legacy | Règles de domaine non encore exécutées directement dans un use case métier | V1-01-B : use cases Approval/Transfer avec domain |
| E-07 | CI GitHub non exécutée | Statut CI réel NOT_RUN | Après autorisation de push humain |
| E-08 | Lint : 35 warnings, 0 erreur | LINT_STRICT=1 échoue encore | Corriger la dette, sans exclure des fichiers |
| E-09 | Rate limit, purge sessions, révocation globale | Sécurité V1 incomplète | V1-01-B/V1-02 |
| E-10 | Pas de S3, MCP, Postiz réel, provider IA réel | Intégrations externes non commencées | Lots ultérieurs |

## 3. Risques

- L adaptateur legacy peut masquer des couplages résiduels ; les greps prouvent qu ils ne sont plus dans les routes/use cases.
- Le snapshot est reproductible au niveau documentaire, pas encore au niveau exécution (pas de rejeu automatique du run).
- Les outputs sont fiables pour les runs exécutés, mais un crash avant finalisation laisse un JobRun succeeded partiel ? Non : le statut est mis à jour après la transaction QA/outputs ; un crash avant finalisation laisse un JobRun running. Le step n est pas repris automatiquement.
- Les tests API utilisent encore la base de test locale Windows ; CI Linux non validée.
- Aucun test de charge ni de sécurité HTTP avancée.

## 4. Verdict

**GO CONDITIONNEL pour V1-01-A.**

Justification :

- l architecture applicative demandée est en place (routes minces, use cases injectés, ports/adaptateurs, pas de Prisma dans domain/application) ;
- les snapshots sont versionnés, checksummés, reliés aux révisions et complétés par les outputs ;
- les transactions critiques sont testées ;
- la régression complète V0/V1 passe en 10 s et 50 s.

Conditions avant V1-01-B :

1. remplacer l intérieur de LegacyWorkflowAdapter par des use cases/repositories métier, sans changement de contrat HTTP ;
2. rendre le storyboard transactionnel et ajouter les tests de rollback correspondants ;
3. exécuter la CI GitHub et le job E2E après autorisation de push humain ;
4. traiter le rate limiting, la purge/révocation des sessions et HTTPS ;
5. documenter la stratégie de reprise des runs et décider du POC Hatchet.

Aucun lot suivant ne doit être engagé sans nouvelle autorisation.

## 5. Livrables associés

- V1_01_A_LEGACY_MIGRATION.md — services legacy et matrice route/use case/port/adaptateur.
- V1_01_A_SNAPSHOTS.md — schéma, versionnement et transactions.
- V1_01_A_TEST_EVIDENCE.md — 132 tests, E2E, 50 s, migration.
- V1_01_A_RISKS_VERDICT.md — ce document.