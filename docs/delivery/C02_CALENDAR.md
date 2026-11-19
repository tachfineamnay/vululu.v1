# C02 — Marketing planning & content calendar

**2026-11-19 · base `066f2595` · implementation `b5833457` · branch `arena/4f202ffb-vululu-v1`.**

**Acceptance: PASS on the disposable stack.** Starting from a Studio project, a solo user confirmed an offer, saved three weekly suggestions linked to its campaign, changed copy and time, added a second platform, duplicated and archived a post. After actual logout/login, the posts, revised time, variants, revision history and archive were still available.

- **Model:** S00 found no offer entity. `/calendar` adds explicit, context-owned `ConfirmedOffer`; descriptions are never converted into offers. A plan is a dated view of `ContentItem` records, not a duplicate campaign. Audience, objective and typed platform variants belong to each revision. Campaign and Studio project links use existing IDs.
- **Scheduling:** calendar inputs use the browser’s IANA zone; the database stores the UTC instant and entry zone. Missing DST minutes are rejected and repeated minutes are selectable. Account-serialized transactions guard overlapping scheduled platform/minute slots, stale versions and mutation retries. Editorial status does not change project production status. `PUBLISHED` and `FAILED` are manual declarations, not provider receipts.
- **Suggestions:** Monday/Wednesday/Friday drafts use the confirmed offer, profile audience and matching project brief fields. No provider call or write occurs until the user saves.

| Check | Result |
|---|---|
| `pnpm exec vitest run tests/calendar.test.ts tests/v1/calendar-persistence.test.ts` with a migrated local `DATABASE_URL_TEST` | **PASS** 7/7: transitions, DST, stable suggestions, owner isolation (including real session/CSRF requests), simultaneous retries and contested bookings. |
| `playwright test -c .c02-sandbox.config.ts calendar.spec.ts` (temporary local Chromium executable override) | **PASS** 1/1, including acceptance above and month-layout overflow checks at 390/768/1024/1440 px. Reproduce against a disposable test instance with `pnpm exec playwright test -c playwright.external.config.ts calendar.spec.ts`, `E2E_BASE_URL` and fixture login env. |
| `pnpm -r typecheck`; ESLint on changed TS/TSX; `pnpm --filter @vululu/web build`; `prisma validate --schema packages/db/prisma/schema.prisma` | **PASS** |
| Full unrelated suites, production-image migration/rollback | **NOT_RUN** — scoped run; no release or deployment requested. |

**Environment / release gate:** real Next + Fastify, PostgreSQL 18.7, Chromium, Node 22.22.3. The sandbox applied repository migration SQL in order and used a temporary Prisma 6.19.3 JS driver adapter; neither the adapter nor sandbox tools ship. Before release, repeat the migration and acceptance test on the supported Node 24 / PostgreSQL 17 stack with the standard generated Prisma client. Migration `20261119180000_marketing_calendar` only adds tables/indexes. Roll back the application if needed; leave additive tables intact to preserve plans and revisions.
