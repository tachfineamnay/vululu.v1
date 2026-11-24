# T00B — récupération de l’intégration

Date : 2026-11-24. Base : `ef98855`. Sauvegarde initiale conservée : `stash@{0}` ; copies des six fichiers dans le répertoire temporaire local `vululu-t00b-5903b67a-a031-44b9-a971-0bd88bb8c56c` de la session.

## Résolutions

- `renderJobs.ts` : états, verrouillage et reprise Arena conservés ; diagnostic DSH limité à une liste exacte de codes d’intégrité ou à une catégorie fixe, sans journaliser le message libre potentiellement sensible.
- `CreativeEditor.tsx` : message DSH pendant le chargement et état `waiting` Arena conservés.
- `ProjectStudio.tsx` : rafraîchissement périodique DSH y compris pendant `producing` ; blocages Arena, approbation et message de statut conservés.
- `StudioCanvas.tsx` : message DSH pendant le chargement et état `waiting` Arena conservés.
- `useStudioPreview.ts` et `useStudioVideoPreview.ts` : coordinateur Arena, attente bornée, annulation et conservation de l’aperçu précédent répondent au besoin DSH de reprise des 429, sans imbriquer deux boucles de reprise.

Les autres modifications DSH initialement indexées et non suivies restent en place ; le stash n’a été ni réappliqué ni supprimé. `git ls-files -u` ne renvoie aucune entrée ; recherche des marqueurs dans les six fichiers vide ; `git diff --check` et `git diff --cached --check` : sortie vide, code 0.

## Vérifications locales

- `pnpm exec prisma generate --schema packages/db/prisma/schema.prisma` avec URL locale de génération sur `3193` : code 0. Génération seule, aucune connexion ou migration revendiquée.
- `pnpm typecheck` : code 0, sept projets.
- `pnpm lint` : code 0.
- `pwsh -NoProfile -File scripts/check-secrets.ps1` : code 0, 960 fichiers scannés.
- `pnpm exec vitest run tests/v1/result-payload.test.ts tests/studio-concurrency-ui.test.tsx tests/studio-preview-retry.test.ts tests/publishing-workflow.test.ts tests/publishing-results-ui.test.tsx tests/v1/admin-support-hardening.test.ts tests/admin-support-ui.test.tsx` : 61 réussites, 1 échec ; A01 disque échoue sur `EPERM` lors d’un renommage sous le répertoire temporaire sandbox.
- Avec `TEMP` et `TMP` pointant vers `.v1/tmp`, `pnpm exec vitest run tests/v1/result-payload.test.ts` : 19 réussites, code 0, y compris le test disque précédent.
- Avec le même répertoire temporaire, `pnpm exec vitest run tests/studio-canvas-order.test.tsx` : 2 réussites, code 0.
- A02 `tests/render-concurrency-recovery.test.ts` : **NOT_RUN** ; ce fichier impose `127.0.0.1:55432`, port explicitement interdit pour cette mission. `docker version --format '{{.Server.Version}}'` retourne un refus d’accès au pipe Docker ; la pile QA et sa base n’ont donc pas pu être vérifiées. A03/A04 ci-dessus sont des tests ciblés incluant des mocks ; aucune validation PostgreSQL réelle revendiquée. Tests navigateur et binaires média natifs : **NOT_RUN**, `ffmpeg` et `ffprobe` absents du PATH et environnement QA non vérifié.

Aucun commit de résolution : les validations obligatoires dépendant de la base et de l’environnement restent indisponibles. Aucun push ni déploiement. Rollback des résolutions possible par comparaison avec les entrées du stash conservé et le commit `ef98855`, sans écraser les modifications locales.
