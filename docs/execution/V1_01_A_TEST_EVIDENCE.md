# V1-01-A — RÉSULTATS DE TESTS ET RÉGRESSION

- **Date** : 2026-10-23
- **Branche** : v1-01-a-application-layer
- **Services** : API 3101, Web 3100, PostgreSQL 55432, base vululu_v1_00
- **Code antérieur** : 83abb8e (V1-00), migration et code V1-01-A
- **Aucun push, merge ou déploiement**

## 1. Résultats globaux

| Contrôle | Résultat |
|---|---|
| pnpm typecheck | PASS, 7 projets |
| pnpm lint | PASS, 0 erreur / 35 warnings |
| pnpm test | PASS, 132 tests, 14 fichiers |
| pnpm build | PASS, API + Next.js |
| Playwright E2E 10 s | PASS, 1/1, 1,6 min |
| Production cible 50 s | PASS |
| Migration sur copie | PASS |
| Scan secrets | PASS, 174 fichiers |
| GitHub Actions | NOT_RUN |

Détail des 132 tests :

- Domain Core : 71 ;
- Infrastructure/ports : 20 ;
- Sécurité sessions/RBAC : 23 ;
- API HTTP : 10 ;
- Média : 1 ;
- Application V1-01-A : 7.

## 2. Tests V1-01-A ajoutés

Fichier tests/v1/v1-01-application.test.ts :

1. capture un snapshot et passe le jobRunId à l exécutant ;
2. marque le JobRun failed si l exécutant échoue ;
3. refuse un projet non propriétaire ;
4. délègue le brief et journalise l action ;
5. capture contexte, brief, scènes, personnages et politiques provider/render ;
6. crée JobRun et StepRun dans une transaction ;
7. rollback le JobRun si la transaction échoue.

## 3. Découplage vérifié

    grep services/ apps/api/src
    -> uniquement infrastructure/legacy/legacyWorkflowAdapter.ts

    grep @vululu/db packages/application/src
    -> 0

    grep @vululu/db packages/domain/src
    -> 0

    grep services apps/api/src/routes
    -> 0

Les routes ciblées appellent un use case et ne contiennent plus de logique métier.

## 4. Régression 10 s

Projet E2E : cmvl65teb0008hask98puyafk.

- statut transferred ;
- 5 scènes ;
- master produce checksum b319d38416ad99af00b0d26d725dfaf2a4a0d901b386cedba420cbb26da1038c ;
- master correction checksum c829e992e7267b543f6e0976738222ae886c4f43ec5183388ba1c9fd502da830 ;
- QA PASS ;
- 4 StepRun succeeded par job ;
- snapshotVersion 1, snapshotChecksum 64, outputsChecksum 64 ;
- snapshot sans outputs, outputs séparés ;
- approbation v1 invalidée, approbation v2 valide, transfert acknowledged ;
- IDs scène/personnage stables ;
- autres scènes inchangées après correction.

## 5. Régression 50 s

Projet : cmvl690kf002hhasko6ar8vnl.

- 5 scènes x 10 s ;
- master checksum feba893dbb22c945ccb2c41d5eb2021360a3d7c73cddb43e1ef21347941496b8 ;
- QA PASS 49,97 s / attendu 50 s ;
- FFprobe 49,966667 s, H.264 1080x1920, AAC ;
- hash fichier identique au checksum DB ;
- snapshotVersion 1, snapshotChecksum 64, outputsChecksum 64 ;
- outputs.master.duration 49.97 ;
- transfert acknowledged.

## 6. Migration et préservation

- Migration 20261023160509_v1_01_a_snapshot_versioning appliquée.
- Copie de la base V0 restaurée puis migrée : 16 projets, 13 ContextRevision, 12 CharacterVersion, 23 JobRun, colonnes snapshot/outputs présentes.
- Projet V0 cmvkrhp730007habgpols3mq5 toujours lisible avec master checksum 6931914274335a4080adaf16f0a2dfc0e08a605cb5667e71d5d905b7f95f2e94 et hash identique.
- Aucun artefact écrasé, aucune donnée supprimée.

## 7. Tests manquants / NOT_RUN

- GitHub Actions : NOT_RUN, aucun push.
- E2E dans GitHub Actions : NOT_RUN.
- Provider IA réel : NOT_RUN.
- Hatchet/reprise crash : NOT_RUN.
- S3 : NOT_RUN.
- MCP : NOT_RUN.
- Postiz réel : NOT_RUN.
- Rate limiting, purge sessions, révocation globale : NOT_RUN.
- Tests de charge, SSRF, uploads, accessibilité : NOT_RUN.

## 8. Conclusion

Les migrations, snapshots et routes migrées sont couverts par 132 tests et par deux régressions réelles (10 s et 50 s). Les warnings lint restent visibles ; aucun fichier n a été exclu pour les masquer. Le lot est GO CONDITIONNEL : le remplacement interne de l adaptateur legacy reste le travail V1-01-B.