# V1 — INVARIANTS ET PREUVES

- **Date** : 2026-10-25
- **Commit code G** : 0e79c08
- **Base F** : 11e11e5

## 1. Invariants metier

| Invariant | Preuve | Statut |
|---|---|---|
| Identites scene/character stables | tests/domain/identity, scene-character | PASS |
| Position independante de l identite | tests/domain/scene-character | PASS |
| Versions append-only, pas d ecrasement | tests/domain/versions, E versions v1..v11 | PASS |
| Snapshots figes au lancement | tests D, snapshotChecksum, RunRoutingSnapshot | PASS |
| Approbation exacte version + checksum | domain/artifact-approval, transfer, D/E | PASS |
| Invalidation d approbation sur nouveau master | tests domain, correction D | PASS |
| Transitions terminales non reversibles | production-state, transitionJob, completeRun/failRun | PASS |
| Un seul run actif par projet | index partiel JobRun_one_active_per_project + tests D | PASS |
| Outbox et JobRun atomiques | Prisma transaction + E2E D | PASS |
| Artefacts immuables, cle SHA-256 | E storage, keyFor, object conflict | PASS |
| Objet ready => objet reference existe | updateMany count=1 dans finalizeArtifacts (corrige G) | PASS code |
| Acces media proprietaire | auth-security 23 + E isolation | PASS |
| Cout idempotent | CostEvent idempotencyKey, tests D/E | PASS |
| Evenement asynchrone tardif ne rouvre pas un terminal | machine a etats Domain, tests | PASS |
| Budget insuffisant => refus avant media | tests B/D, budget mock | PASS |
| Storage provider historique lisible | registre local/S3 (corrige G), config requise | PASS conditionnel |

## 2. Preuves d execution

- pnpm typecheck : PASS.
- pnpm test : 173 PASS, 2 S3 skipped, 21 fichiers.
- Tests S3 isoles E : 2 PASS.
- pnpm build : PASS.
- LINT_STRICT=1 pnpm lint : PASS, 0 erreur / 0 warning.
- Migrations test/dev : 12 migrations, up to date.
- Backup/restore PostgreSQL dev : 64 JobRun, 240 StepRun, 68 ArtifactVersion, 44 ArtifactObject, 17 RunArtifact restaures ; empreinte SHA-256 identique a la base source.
- Production 10 s : JobRun cmvnhkbxl0004ha8s4z5cggea, local, succeeded.
- Production 50 s : JobRun cmvnhswis000xha8s5dzi1674, local, 793741 octets, succeeded.
- Correction SCENE-003 : JobRun cmvnhuymj001qha8se848if8p, succeeded, versions conservees.
- Production S3 10 s : JobRun cmvnhy2iv0004havwyunhe7w5, succeeded.
- Reprise crash worker S3 : JobRun cmvni3lqt001phavwpfn1pm1g, render attempts=2, 6 objets distincts ready.
- Trace live F : JobRun cmvnmc3pk0004hahky2wqu7jz, traceId f-live-trace-001, workflow d4f5726a-9b88-4a92-99c1-e7ec2875fdb1.
- Media S3 : HTTP 200 image, 206 range, 416 range invalide.
- API G : master?version=0 -> 400 ; master range invalide -> 416.
- Origin malveillante : HTTP 403 origin_invalid.

## 3. Tests de frontiere

- Domain sans Fastify/Prisma/Hatchet/S3/Sharp/Next.
- Application sans HTTP/Prisma/Hatchet/S3/media/process.env.
- Web sans Prisma/Hatchet/S3/worker.
- Composition root unique.
- tests/domain/purity.test.ts 4 PASS.

## 4. NON_RUN

- Redemarrage complet du moteur Hatchet avec run en vol.
- Crash injecte entre Hatchet submit et mise a jour outbox (idempotence dispatch exacte).
- Restauration binaire complete des artefacts S3 et verification de chaque media restaure.
- Charge multi-workers / multi-instances.
- CI GitHub distante.
- TLS/IAM/SSE/policies de production.
- Validation Docker/Linux reelle.

## 5. Conclusion

Les invariants de donnees et de workflow sont couverts par des tests locaux reels et par les campagnes D/E/F. Les deux zones non certifiees restent l exactly-once de dispatch Hatchet et l infrastructure de production.
