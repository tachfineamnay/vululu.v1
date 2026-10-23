# V1-01-A.1 — PREUVES DE TESTS ET RÉGRESSION

- **Date** : 2026-10-23
- **Branche** : v1-01-a1-consolidation
- **Commit testé** : b1824c1
- **Environnement** : API 3101, Web 3100, PostgreSQL 55432, base vululu_v1_00
- **Aucun push, merge ou déploiement**

## 1. Résultats globaux

| Contrôle | Résultat |
|---|---|
| pnpm typecheck | PASS, 7 projets |
| pnpm test | PASS, 135 tests, 14 fichiers |
| pnpm lint | PASS, 0 erreur / 35 warnings |
| pnpm build | PASS, API + Next.js |
| Playwright E2E final | PASS, 1/1, 1,4 min |
| Production cible 50 s | PASS |
| Migration sur copie V0 | PASS |
| Audit artefacts | PASS, missing=0 |
| GitHub Actions | NOT_RUN |
| Scan secrets | PASS, 189 fichiers |

Détail : 71 Domain, 20 infrastructure, 23 sécurité, 10 API, 1 média, 10 application V1-01-A.1.

## 2. Tests A.1 ajoutés

- brief versionné via BriefStore transactionnel ;
- storyboard atomique (5 scènes + CharacterVersion) ;
- paire de messages ;
- production via run transactionnel + exécutant injecté ;
- échec exécutant -> ProductionJob failed ;
- refus projet non propriétaire ;
- snapshot + JobRun + StepRun + ProductionJob transactionnels ;
- second run actif refusé 409 ;
- deux runs concurrents -> un seul actif ;
- rollback intégral du storyboard ;
- version de brief qui saute refusée.

## 3. Régression 10 s finale

Projet cmvl9ptke0008hazkt7dimn2x.

- E2E PASS, 1/1, 1,4 min ;
- deux JobRun succeeded (produce, correction) ;
- snapshotVersion 1, snapshotChecksum 64 ;
- outputs présents, outputsChecksum 64 ;
- correction SCENE-003 retrouvée dans le snapshot ;
- 4 StepRun succeeded par run ;
- ProductionJob lié à JobRun ;
- QA PASS, approbation, transfert mock acknowledged.

## 4. Régression 50 s

Projet cmvl95ke3001zha40ahfgu937.

- master checksum 98cd0a0bd7b1faa6f825ce2775de31dd4ef6e9b4395d873c9c93aa03e5dad0d9 ;
- QA PASS 49,97 s / attendu 50 s ;
- FFprobe 49,966667 s, H.264 1080x1920 + AAC ;
- hash fichier identique au checksum DB ;
- snapshotVersion 1, snapshotChecksum 64, outputs 49.97 ;
- 4 StepRun succeeded, ProductionJob lié ;
- transfert acknowledged.

## 5. Migrations et compatibilité

Deux migrations additives :

1. 20261023170000_v1_01_a1_active_run_index : index unique partiel JobRun actif.
2. 20261023173000_v1_01_a1_run_integrity : StepRun(jobRunId,name) unique, ProductionJob.jobRunId unique + FK.

Test sur copie V0 restaurée :

- 16 projets ;
- 13 ContextRevision ;
- 12 CharacterVersion ;
- 23 JobRun legacy ;
- colonne ProductionJob.jobRunId présente ;
- index JobRun_one_active_per_project, ProductionJob_jobRunId_key, StepRun_jobRunId_name_key présents ;
- aucune donnée supprimée.

## 6. Contrats HTTP vérifiés

- GET/POST contexts et projects exposent createdAt/updatedAt (restaurés) ;
- bundle GET projet conserve project/context/brief/messages/scenes/characters/master/masterVersions/job ;
- brief conserve revisions ;
- storyboard renvoie le bundle ;
- messages renvoient userMessage/assistantMessage ;
- scène renvoie ses champs et son createdAt ;
- image et master sont streamés via ArtifactAccessPort ;
- approve renvoie approval ; transfer renvoie transfer et passe à acknowledged ; qa renvoie status/report/version.

## 7. Audit artefacts

Rapport read-only :

- dbPaths=207 ;
- files=481 ;
- missingFiles=0 ;
- orphanFiles=274 (intermédiaires FFmpeg, anciens artefacts, essais).

Aucun fichier supprimé. Le script est scripts/audit-artifacts.ps1.

## 8. NOT_RUN / limites

- GitHub Actions : NOT_RUN, pas de push.
- E2E CI : NOT_RUN.
- Provider IA réel, Hatchet, S3, MCP, Postiz réel : NOT_RUN.
- Rate limiting, purge sessions : NOT_RUN.
- Tests de charge, SSRF, uploads : NOT_RUN.
- Lint 35 warnings, aucun fichier exclu.

## 9. Conclusion

Les critères A.1 sont couverts par 135 tests, une régression 10 s, une cible 50 s, deux migrations testées sur copie et un audit d artefacts. Aucun service legacy n est importé par l application.
