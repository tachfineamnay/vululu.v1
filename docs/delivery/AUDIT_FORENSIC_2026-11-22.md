# Rapport d audit forensique — Vululu V1

Branche : `arena/50910578-vululu-v1` (base `4b19697`). Date : 2026-11-22.

## Verdict

| Etape | Resultat |
| --- | --- |
| `pnpm -r typecheck` | **PASS** (7 projets) |
| `LINT_STRICT=1 eslint .` | **PASS** (0 erreur, 0 avertissement) |
| Tests unitaires/integration | **337 PASS**, 201 ignores par environnement, 69 echecs **tous** dus a l absence du binaire Prisma Query Engine (reseau `binaries.prisma.sh` bloque dans ce sandbox) |
| Differ entiel de tests vs baseline | **0 nouvelle defaillance**, **12 tests ajoutes** |
| Tests media reels (FFmpeg/ffprobe) | **PASS** (181/181 sur le perimetre `media*`, `domain`, `qa-gate`, regressions) |
| E2E Playwright | **NOT_RUN** — telechargement des navigateurs bloque |

Les 69 echecs restants sont **environnementaux**, pas fonctionnels : le paquet
`@prisma/engines` ne contient que 125 Ko de stubs (`libquery_engine.so.node` fait
5 octets) car `binaries.prisma.sh` n est pas joignable. Consequence mesurable :
`RateLimitCounter` et toutes les tables sont inaccessibles, donc les politiques
`failClosed` renvoient legitimement 429 (d ou les 4 echecs de
`tests/customer-account.test.ts`) et le seed d admin sort en code 1
(`tests/v1/admin-bootstrap.test.ts`). Le meme suite passait 595/325/69/201 hors
de ce blocage. Aucun de ces echecs n est imputable aux corrections ci-dessous.

## Corrections applicatives

### P1 — contournement du controle qualite sur l executeur local

`apps/api/src/infrastructure/production/localProductionExecutor.ts` appelait
`store.finalizeRun({ ...qa })` sans regarder `qa.status`, pour `produce` comme
pour `correction`. Un rapport `FAIL` etait donc persiste avec `qaStatus: 'FAIL'`
alors que le run, le job et le projet passaient en succes et qu une version
d artefact approuvable etait creee — a l inverse du pipeline durable, qui
s arrete sur `qa_failed`.

Correction en trois couches :

1. `qaPassedOrThrow` / `qaFailureReason` exportes par
   `packages/application/src/use-cases/durableProduction.ts` (source unique) ;
2. `guardQa()` dans l executeur local : marque l etape `qa` en `failed` avec le
   detail des controles puis leve `qa_failed` avant toute finalisation ;
3. defense en profondeur dans `productionExecutionStore.finalizeRun` et
   `durableProductionStore.finalizeArtifacts` : une QA non PASS ne peut jamais
   creer de version d artefact, meme si un futur appelant oublie le garde-fou.

Preuve : `tests/local-executor-qa-gate.test.ts` (QA FAIL => `finalizeRun` jamais
appele, `failRun` avec `qa_failed` + `master duration` ; QA PASS => finalisation).

### P1 — fenetre de limitation de debit en millisecondes

`apps/api/src/routes/mediaGeneration.ts` : `windowSeconds: 60000` (seule
occurrence en millisecondes de tout le produit) donnait une fenetre de 16 h 40
et un en-tete `Retry-After: 60000`. Corrige en `windowSeconds: 60`, avec
invariant teste sur toutes les routes (`tests/audit-regressions.test.ts`).

### P1 — horodatages impossibles acceptes

`packages/domain/src/timestamp.ts` validait avec `Date.parse` seul, qui reporte
`2026-02-30` au 2 mars, `2026-04-31` au 1er mai et `2026-02-29` au 1er mars.
Validation calendaire pure ajoutee (bissextile 4/100/400), sans horloge pour
respecter la purete du domaine (`tests/domain/purity.test.ts`).
Preuve : `tests/domain/timestamp.test.ts` (9 refus, 4 acceptations).

### P2 — securite secondaire

- `security/session.ts` : `clearAuthCookies` utilisait `isProduction()` au lieu de
  `cookieSecure()`. Avec `SESSION_COOKIE_SECURE=1` hors production, le cookie
  pose `Secure` n etait pas efface au logout.
- `email/accountMail.ts` : en production sans `ACCOUNT_EMAIL_ORIGIN`,
  `new URL('')` levait un `TypeError` opaque; message explicite et deterministe.
- `observability/logger.ts` : un champ appelant pouvait ecraser `timestamp`,
  `level` ou `event` (spread apres les champs systeme). Les champs systeme
  passent desormais en dernier.
- `marketing/editorial.ts` : `classify` et `sensitive` divergeaient
  (`soins`, `sante` sans accent, `medic`, `dentist`...). Une source unique de
  motifs, accents optionnels, invariant teste : tout secteur range en
  `therapeute` est `sensitive`.

### P2 — robustesse media et migration

- `packages/media/src/index.ts` `probe` : `ffmpeg -i` sort en erreur par
  conception (code ignore), donc un fichier illisible produisait un master
  `0x0 / 0 s`. La sonde echoue maintenant si aucune duree ni flux video n est
  lisible.
- `packages/media/src/index.ts` `appendBounded` : collecte quadratique
  (`Buffer.concat` complet a chaque chunk). Mesure : 20 000 chunks de 1 Kio
  passaient de **5 624 ms** a **94 ms**, forme de sortie inchangee (les tests
  `media-stdio-bound` restent verts) et borne toujours respectee.
- `artifacts/artifactMigration.ts` : dead code `void file;` supprime et manifest
  historique fusionne (`...previousManifest`) au lieu d etre ecrase.

## Faux positifs ecartes apres verification

- `repositionScenes` : la sonde initiale suggerait une perte de stabilite des
  ids ; `tests/domain/scene-character.test.ts` (8/8) prouve le contraire —
  ids, cles et immutabilite preserves. Sonde defectueuse, aucun changement.
- `billing/support.ts` `erase` : refuse deliberement la suppression quand des
  donnees creative/artifact/production/publishing ou des commandes vivantes
  existent (revue manuelle). Comportement conforme, aucun changement.
- `rateLimiter` : 429 `failClosed` sur base inaccessible est le comportement
  attendu, pas un bug.

## Conditions de reproduction

```bash
scripts/arena/pg16-local.sh start && scripts/arena/pg16-local.sh migrate
source /tmp/env.sh          # DATABASE_URL, SESSION_SECRET, APP_ENV=local
pnpm -r typecheck
LINT_STRICT=1 npx eslint .
npx vitest run tests/domain tests/media.test.ts tests/media-duration-integrity.test.ts \
  tests/media-stdio-bound.test.ts tests/qa-gate.test.ts \
  tests/local-executor-qa-gate.test.ts tests/audit-regressions.test.ts
```

`scripts/arena/pg16-local.sh migrate` applique les 35 migrations SQL (67 tables).
