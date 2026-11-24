# T01 — certification de régression interrompue

Date : 2026-11-24. HEAD : `ef98855` (fusion T00). Les modifications DSH initiales restent sauvegardées dans `stash@{0}`.

- `git status --short --branch` et `git diff --name-only --diff-filter=U` : six fichiers T00 restent en conflit dans l’index ; l’intégration n’est pas certifiable en l’état.
- `Get-Command psql,ffmpeg,ffprobe,pnpm -ErrorAction SilentlyContinue` : seul `pnpm` est trouvé dans le PATH ; cela ne prouve pas l’absence de binaires ailleurs.
- `Test-NetConnection 127.0.0.1 -Port 55432 -InformationLevel Quiet` : `False` ; le port PostgreSQL de test ne répond pas.
- Suite Vitest complète, A01–A04 sur PostgreSQL réel, validation Prisma, contrôle des 42 migrations, typecheck, lint strict et scan des secrets : **NOT_RUN**, prérequis T00 et environnement non satisfaits. Aucun total PASS/FAIL/SKIP n’est revendiqué.
- Aucun correctif ni commit T01. Terminer T00, rendre PostgreSQL local et les outils natifs disponibles, puis relancer les contrôles demandés.
