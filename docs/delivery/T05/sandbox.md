# T05 — Environnement de certification (jetable, local)

Tout est local. Aucun crédential payant, aucun compte social, aucun déploiement.
Ce document permet de rejouer chaque commande du rapport `README.md`.

## 1. Versions effectivement utilisées

| Composant | Version | Note |
|---|---|---|
| Node.js | 22.22.3 | `package.json` exige `>=24` ; pnpm émet `WARN Unsupported engine` mais **build, typecheck, lint, vitest et Playwright passent** |
| pnpm | 10.6.1 | |
| PostgreSQL | 16.2 (binaire local, cluster jetable) | `127.0.0.1:55432` |
| Next.js | 16.4.2 | `next build` puis `next start` (shell de release) |
| Fastify (API) | `apps/api` | `127.0.0.1:3101` |
| Chromium | 153 (Playwright 1.64.1) | `CHROMIUM_EXECUTABLE` |
| ffmpeg / ffprobe | n9.0.2 / N-66595 | `scripts/arena/bootstrap-media-tools.sh` |
| Prisma CLI | 6.19.3 | **moteurs absents du sandbox** → voir §4 |

## 2. Base de données

```bash
# cluster jetable (binaires PG 16.2 fournis dans le sandbox)
export PATH=/tmp/t02py/pgserver/pginstall/bin:$PATH
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=vululu psql -d postgres -c 'select version()'
```

Les 29 migrations sont rejouées **en SQL direct**, dans l'ordre :

```bash
for f in packages/db/prisma/migrations/*/migration.sql; do
  psql -Xq -v ON_ERROR_STOP=1 -d "$DATABASE_URL" -f "$f" || exit 1
done
```

Bases utilisées : `vululu_v1_00_test` (application), `vululu_v1_00_t05` (isolation),
`c12_billing_test` (`BILLING_DATABASE_URL_TEST`).

## 3. Variables d'environnement de recette

```bash
DATABASE_URL=postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test
DATABASE_URL_TEST=$DATABASE_URL
BILLING_DATABASE_URL_TEST=postgresql://vululu@127.0.0.1:55432/c12_billing_test
SESSION_SECRET=<32 octets aléatoires>
APP_ENV=local
DEMO_MODE=1                 # mode démonstration explicite (IA simulée, Postiz MOCK)
DEMO_EMAIL / DEMO_PASSWORD  # comptes QA créés localement
V1_BOOTSTRAP_EMAIL / V1_BOOTSTRAP_PASSWORD
API_PORT=3101
API_INTERNAL_URL=http://127.0.0.1:3101   # requis par le shell de production Next
APP_ORIGIN=http://127.0.0.1:3100
FFMPEG_PATH / FFPROBE_PATH
```

Comptes QA (§5) : `t05-demo@example.test` (user), `t05-admin@example.test` (super_admin),
`t05-support@example.test` (**support** — rôle corrigé pendant la recette, voir P2-01).

## 4. Prisma : pourquoi les migrations ne sont pas exécutées par le CLI

Le sandbox n'expose `binaries.prisma.sh` ni l'API GitHub Releases : **aucun moteur Prisma
n'est présent sur disque** et il est impossible de les télécharger.
`prisma migrate deploy` natif est donc **NOT_RUN**.

Contournement de recette (hors dépôt, `node_modules` uniquement, aucun code produit modifié) :
`migrate deploy` est émulé en rejouant les `migration.sql` par `psql`, avec la table
`_prisma_migrations` tenue à jour ; `@prisma/client` reçoit `datasourceUrl` via un adaptateur `pg`.
**Conséquence sur le verdict** : la *migration SQL* est certifiée (29/29, 65 tables),
la *commande CLI* ne l'est pas.

## 5. Démarrage

```bash
# API (tsx watch)
pnpm --filter @vululu/api dev            # :3101

# Web, deux modes testés
pnpm --filter @vululu/web dev            # :3100 — dev (overlay Next présent)
pnpm --filter @vululu/web build && pnpm --filter @vululu/web start   # :3100 — shell de release
```

**Important** : en `next dev`, l'overlay de développement Next (`<nextjs-portal>`,
`--nextjs-dev-tools-scale`) intercepte des clics dans la barre latérale basse
(`elementFromPoint` → `NEXTJS-PORTAL`). Les scénarios navigateur de certification ont donc
été rejoués **sur le build de production** (`next build` + `next start`), qui est aussi le
shell réellement livré.

## 6. Comptes QA

```bash
# insertion directe (bcrypt, coût 4 — comptes jetables de recette uniquement)
node /tmp/t05seed.mjs   # t05-demo / t05-admin / t05-support, mot de passe T05-Passw0rd!
```

## 7. Rejouer les sondes

```bash
export DATABASE_URL=... DEMO_EMAIL=... DEMO_PASSWORD=...
L=docs/delivery/T05/logs
for p in security media calendar production publishing manual-export versions ai webhooks ops; do
  node docs/delivery/T05/probes/probe-$p.mjs | tee "$L/probe-$p.log"
done
CHROMIUM_EXECUTABLE=$CHROMIUM_EXECUTABLE AXE_PATH=.../axe.min.js \
  node docs/delivery/T05/probes/probe-a11y.mjs | tee "$L/probe-a11y.log"
node docs/delivery/T05/probes/probe-i18n.mjs | tee "$L/probe-i18n.log"
```

Chaque sonde crée ses propres comptes aléatoires et n'écrit que par l'API publique ;
elle est idempotente et sans effet sur les données de démonstration existantes.

## 8. Sauvegarde / restauration

```bash
PATH=/tmp/t02py/pgserver/pginstall/bin:$PATH PGHOST=127.0.0.1 PGPORT=55432 PGUSER=vululu \
  bash scripts/release/rehearse-local.sh        # exit 0 — voir logs/backup-restore-rehearsal.log
```

Le script crée une base jetable, applique les 29 migrations, sauvegarde, restaure dans une
**autre** base, vérifie les sommes SHA-256, compare un fichier média canari et contrôle
`BillingControl`. C'est une **vraie restauration**, sur ressources isolées.
