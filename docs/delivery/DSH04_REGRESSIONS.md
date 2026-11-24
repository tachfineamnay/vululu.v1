# DSH-04 — Fermeture des régressions réelles (2026-11-22)

**Branche :** `integration/vululu-release-20261121` · **HEAD de départ :** `08e2abb` (arbre propre,
**1 commit d'avance / 0 de retard** sur `origin/integration/vululu-release-20261121`) · **42 migrations** ·
`VULULU_BETA_MODE=1`. Aucun push, merge `main`, déploiement ni fournisseur payant. Lumira non touché.

## 1. Base de mesure

Vitest complet sur base neuve `vululu_dsh04_test` (42 migrations, FFmpeg/FFprobe locaux) :
**10 fichiers / 14 tests en échec**, 664 passés, 15 ignorés — chiffres identiques au rapport DSH-03.
Exécution complète : **1261 s**.

## 2. Causes réelles des 14 échecs

| # | Tests | Cause vérifiée | Nature |
|---|---|---|---|
| 1 | `creative-core`, `multiformat`, `media-generation` (1er) | FFmpeg natif **interdit d'écrire sous `%TEMP%`** sur cet hôte Windows (EACCES même dans un dossier neuf) ; le rendu échouait en `render_failed` et le manifeste restait nul | environnement + code (racine temporaire) |
| 2 | `media-generation` (2e) | fixture vidéo en paysage (`1280:720`) alors que le projet est portrait ; le contrôle serveur `media_ratio_mismatch` s'applique **avant** la référence étrangère (404) | fixture de test |
| 3 | `media-p12-07-regressions` | le test appelait **ffmpeg** avec des arguments **ffprobe** (`-show_entries`) | test |
| 4 | `agent-tool-execution` (2) | l'existence d'une ressource confirmée était vérifiée **avant** la propriété et la clé d'idempotence : un appelant étranger recevait 422 au lieu de 404, une clé réutilisée 422 au lieu de 409 | produit (précédence d'erreurs) |
| 5 | `calendar-persistence` | la création renvoyait la saisie brute (sans `hashtags: []`) alors que le rejeu idempotent renvoyait le snapshot normalisé : deux réponses de formes différentes | produit (DTO) |
| 6 | `creative-direction-selection` | le test appelait `directions.decisions()`, méthode absente du service (l'état complet passe par `list()`) | test |
| 7 | `beta-free-testing` | la file support est paginée (`{ items, total, nextCursor }`), plus un tableau | test |
| 8 | `results`, `project-assistant` (3) | tests antérieurs à la porte `assets_required` (P02) : aucune décision de ressources confirmée avant le plan marketing | test (prérequis produit réel) |

## 3. Correctifs livrés

1. **Précédence d'erreurs du broker** (`apps/api/src/infrastructure/execution/broker.ts`) : la vérification
   de la ressource confirmée intervient désormais **après** la propriété/l'autorisation d'outil et la clé
   d'idempotence. Un appelant étranger reçoit 404, une clé réutilisée 409 ; un nouveau code d'erreur ne fuit
   plus l'état de confirmation d'une ressource.
2. **DTO calendrier cohérent** (`apps/api/src/application/calendarWrite.ts`) : la saisie est normalisée par
   le contrat (`content.parse`) **avant** l'écriture et le retour ; création et rejeu idempotent renvoient
   exactement la même forme.
3. **Racine temporaire média portable** (`packages/media/src/temp.ts`, exportée) : `createMediaTempDir`
   utilise `VULULU_MEDIA_TEMP` quand il est défini, sinon `os.tmpdir()`. Utilisée par le rendu créatif
   (4 emplacements), la vérification média et l'ASR. `vitest.config.ts` pointe les tests vers `.v1/tmp`
   (ignoré par git) : FFmpeg écrit dans un dossier autorisé sur cet hôte, conteneurs et CI inchangés.
4. **Sonde audio réelle** : `probeAudioDuration` est exportée ; le test P12-07 mesure la durée du mix avec
   ffprobe, plus avec ffmpeg.
5. **Fixtures alignées sur le produit** : vidéo portrait `720:1280` (sortie de test 720×1280), file support
   paginée, `directions.list()`, décision de ressources « aucune » confirmée via l'API réelle avant les
   plans marketing.
6. **Observabilité du rendu** : l'échec `studio.render.failed` journalise désormais le détail (code + message
   tronqué), sans secret, pour distinguer un défaut média d'une panne d'infrastructure.

## 4. Vitest après correctifs

Les 10 fichiers / 14 tests en échec : **10 fichiers / 53 tests passent**.
Suite complète sur base neuve `vululu_dsh04b_test` :

| Résultat | Détail |
|---|---|
| `vitest run` | **98 fichiers passés / 0 échoué / 2 ignorés** ; **682 tests passés / 0 échoué / 15 ignorés** (697), exit 0 |

## 5. 429 `creative_busy` — reproduction et attente bornée

**Reproduction réelle** (`scripts/qa/dsh04-creative-busy.ts`, 3 requêtes d'aperçu concurrentes sur le même
projet) : `BURST_STATUSES=200,429,200`, `BUSY_429=1`. La limite serveur de **2 rendus simultanés** est
conservée (aucune modification de `withSlot`).

**Attente bornée côté client** (`withBusyRetry`, `apps/web/lib/api.ts`) : 4 reprises maximum avec délais
400/900/1600/2500 ms, uniquement sur **429** ; l'aperçu précédent reste affiché et l'état annonce
« Rendu en cours — nouvel essai automatique n sur 4… ». Deux rendus maintenus occupés + une requête
retardée : `WAITS=1` puis `RETRY_FINAL=200` (sortie réelle ci-dessous). Une erreur de contrat **422
n'est jamais rejouée** (`CONTRACT_NOT_RETRIED=422`). Tests unitaires : `tests/studio-preview-retry.test.ts`
**4/4**. Test navigateur déterministe : `e2e/qa-preview-busy.spec.ts` (deux 429 forcés puis succès sans
clic « Actualiser »).

```
BURST_STATUSES=200,429,200
BUSY_429=1
WAIT attempt=1/5
RETRY_FINAL=200 WAITS=1
CONTRACT_NOT_RETRIED=422
```

## 6. 409 `job_running` — état réel, verrou et retour utilisateur

Sonde `scripts/qa/dsh04-job-lock.ts` (production réelle, approbation immédiate puis correction) :

```
PRODUCE=202
MASTER_V1=1 QA=PASS
APPROVE_V1=200
CORRECT_IMMEDIATE=409
RUN_TIMELINE=waiting_approval+0s>succeeded+45s
RUN_FINISHED_AFTER_S=45
CORRECT_AFTER_RUN=202
MASTER_V2=2 QA=PASS CHECKSUM=dfa050e0d3b8
APPROVE_V2=200
EXPORT_STATUS=200 BYTES=159097 CHECKSUM_OK=true
```

**Verdict :** le run était en **état d'approbation en vol** (attente de l'approbation du master v2),
pas bloqué ; il s'est terminé en 24 à 45 s selon la charge. Le verrou `job_running` est donc **correct**
et n'est jamais contourné : après la fin du run, la même correction est acceptée (202) et le master v2
est rendu, approuvé et exporté avec un checksum exact vérifié sur les octets.

**Retour utilisateur (sans lever le verrou) :** `ProjectStudio` rafraîchit le bundle toutes les 2,5 s tant
qu'un run est actif, désactive « Corriger » et affiche `correction-run-wait` (« Production en cours
(statut) : … la page s'actualise automatiquement ») ; dès que le run finit, le bouton se réactive.
Aucune requête de correction n'est envoyée pendant le verrou. Assertions navigateur dans `e2e/v0.spec.ts`
(état forcé `jobRun.status=running`, message visible et bouton désactivé, puis réactivation après
levée de l'interception).

## 7. Playwright — suites affectées

À compléter après exécution (Studio, parcours client, verrou de run, 429 navigateur, V0).

## 8. Stockage bêta

Stratégie retenue : **stockage local** (`ARTIFACT_STORAGE_BACKEND=local`, `ARTIFACT_DIR=/data/artifacts`,
volume `vululu-qa_artifacts`, 19 Mio d'artefacts existants), `VULULU_BETA_MODE=1`. `S3_ENDPOINT` est vide :
S3 n'est pas requis par le contrat de déploiement bêta. Le registre Docker/MinIO reste injoignable
(échec de pull constaté en DSH-03) : les tests S3 restent ignorés et ne bloquent aucune correction.

## 9. Rollback

`git revert <sha>` ; aucune migration ni volume modifié. Les images QA peuvent être reconstruites depuis
`08e2abb`. Base `vululu_dsh04b_test` jetable.

## 10. Reproduction

```powershell
# Vitest complet (base jetable, FFmpeg local, racine média .v1/tmp via vitest.config.ts)
pnpm exec vitest run

# 429 : concurrence réelle + attente bornée
$env:DEMO_EMAIL="<qa>"; $env:DEMO_PASSWORD="<qa>"
pnpm exec tsx scripts/qa/dsh04-creative-busy.ts

# 409 : approbation puis correction immédiate, timeline du run, artefact v2
pnpm exec tsx scripts/qa/dsh04-job-lock.ts

# Playwright (pile QA déjà démarrée)
pnpm exec playwright test --config playwright.qa.config.ts e2e/qa-studio-editor.spec.ts \
  e2e/qa-preview-busy.spec.ts e2e/qa-customer-journey.spec.ts e2e/v0.spec.ts
```
