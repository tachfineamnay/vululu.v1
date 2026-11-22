# P12-01 — Intégrité de la comptabilité de coût

**Lot :** P12-01 · **Branche :** `campaign/vululu-completion` · **Base :** `253ebc9` (P12-00).
**Date :** 2026-11-21. **Statut :** corrections typées et compilées ; règle de règlement exécutée hors Vitest (sonde Node) ;
suites Vitest et tests broker **NOT_RUN environnemental** (causes §6). Aucun appel fournisseur, aucune modification de tarif,
de produit Stripe, de réglage de facturation ni du gel bêta.

Décision d'architecture associée : [ADR-0046](../adr/0046-provenance-des-couts-et-reglement.md).

---

## 1. Constat d'audit (avant correction, HEAD `253ebc9`)

| # | Défaut | Emplacement | Effet |
|---|---|---|---|
| 1 | Rognage silencieux au plafond | `imageEditing/service.ts:139`, `audio/service.ts:165`, `:219` (`Math.min(result.costCents, job.maxCents)`) | un montant fournisseur au-dessus du plafond devenait un succès `SUCCEEDED` au plafond ; le dépassement n'était jamais audité |
| 2 | Estimation enregistrée comme charge constatée | image, audio, assistant, marketing renvoient une **estimation configurée** ; le broker écrivait `costState: 'REPORTED'` | `results` (`sum(reportedCents) FILTER costState IN ('RECONCILED','REPORTED')`) et `adminCosts.confirmedCents` comptaient une estimation comme un montant vérifié |
| 3 | Appel payé requalifié en échec gratuit | `imageEditing` (sortie trop volumineuse / illisible / dimensions hors bornes), `audio` TTS (taille, illisible, durée) après réponse fournisseur | retour `failed` ⇒ le broker libérait la réservation et enregistrait 0 ¢ alors que le fournisseur avait répondu |
| 4 | Agrégations approximatives | `adminCosts.estimatedCents` (somme des plafonds), `adminCosts` confirmé par outil (tous états), `results.pending` (estimations ignorées) | totaux « estimés » et « confirmés » imprécis |
| 5 | Aucune provenance de coût | `EnginePort` ne portait que `costCents` | impossible de distinguer estimation, montant fournisseur, coût vérifié, coût inconnu |

Invariants existants **conservés** (vérifiés par lecture du code) : réservation sous verrou de compte, refus de budget
(`budget_exhausted`), incident `UNKNOWN` sans libération de réservation, `recover()` sans rejeu d'effet revendiqué,
réconciliation humaine par `super_admin` avec preuve, unicité `(accountId, key)` pour l'idempotence, `owned()` pour la propriété.

## 2. Corrections

1. **Rognage supprimé** : les trois adaptateurs renvoient le montant brut, plus aucun `Math.min(...costCents...)` dans `apps/api/src`.
2. **Provenance explicite** : `costBasis` ∈ {`none`, `configured_estimate`, `provider_reported`} (+ `manual` pour la réconciliation)
   dans `EngineOutcome` ; chaque moteur la déclare (12 sites de la table de dispatch + 8 adaptateurs).
3. **Règle unique de règlement** `settlementFor` (`execution/costBasis.ts`, module pur sans import) :
   hors plafond / négatif / non entier ⇒ jamais réglé ; sinon `provider_reported`→`REPORTED`, `configured_estimate`→`ESTIMATED`,
   `none` + 0→`RELEASED`, `manual`→`RECONCILED`. Provenance inconnue ⇒ `ESTIMATED` (jamais « constaté »).
4. **Dépassement = incident** : compte gelé, audit `execution.invalid_provider_cost` (montant, provenance, plafond),
   `UNKNOWN`, réservation conservée, **sortie payée persistée** pour rapprochement.
5. **Appel payé non gratuit** : nouvelle issue `uncertain` (code + message) pour les échecs postérieurs à une réponse
   fournisseur ; le broker journalise `execution.uncertain` et passe en `UNKNOWN` sans libérer la réservation. `failed`
   reste réservé aux échecs déterministes avant tout appel facturable.
6. **Agrégations honnêtes** : `adminCosts.estimatedCents` = `reportedCents ?? maxCents` des `ESTIMATED` ; confirmé par outil
   limité à `REPORTED`/`RECONCILED` ; `results.pending` inclut une estimation réglée (`ESTIMATED` + `SUCCEEDED`).
7. **Rapprochement sans second appel** : la sortie est conservée sur les chemins d'incident ; `apply` image/audio accepte
   aussi `RESOLVED` (coût constaté par un administrateur), donc l'utilisateur exploite la sortie déjà payée.

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `cd packages/domain; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/contracts; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/application; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/media; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd packages/db; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd apps/api; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `cd apps/web; pnpm exec tsc --noEmit` | 0 | 0 erreur | PASS |
| `pnpm lint` | 0 | 0 erreur, 5 avertissements préexistants (fichiers non touchés) | PASS |
| `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | 0 | schéma valide (aucune migration) | PASS |
| `pwsh -NoProfile -File scripts/check-migrations.ps1` | 0 | `MIGRATIONS=39`, `MIGRATION_CHECK_PASS` | PASS |
| `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | 0 | `BOUNDARY_CHECK_PASS` (23 / 31 fichiers) | PASS |
| `git diff --check` | 0 | propre | PASS |
| `pnpm exec tsc costBasis.ts --outDir .tmp-cost ... ; node .tmp-cost/probe.cjs` | 0 | `COST_RULE_PROBE_PASS cases=12` (règle compilée, exécutée hors Vitest) | PASS |

La sonde exécutée couvre : montant fournisseur sous plafond et au plafond (REPORTED), estimation (ESTIMATED),
travail local nul (RELEASED), constat humain (RECONCILED), dépassement (above_ceiling, y compris plafond 0), négatif,
non entier, NaN.

## 4. Tests ajoutés (écrits, non exécutés ici)

- `tests/v1/cost-basis.test.ts` — 6 cas purs sur `settlementFor` (normal, zéro, estimation, vérifié, hors plafond, invalide).
- `tests/v1/execution-broker.test.ts` — 5 nouveaux cas : provenance distincte (ESTIMATED / REPORTED / RELEASED + audit),
  montant hors plafond (UNKNOWN, compte gelé, réservation conservée, sortie gardée, réconciliation `RECONCILED`),
  absence d'usage fournisseur (réservation conservée), reprise après bail expiré sans rejeu ni libération,
  sortie payée inexploitable (`execution.uncertain` puis `UNKNOWN`). Les doubles de test existants déclarent désormais `costBasis`.
- Les cas **timeout**, **exécution dupliquée** et **reprise SIGKILL** existaient déjà dans ce fichier (lignes 70, 144, 183) et
  restent inchangés hormis la provenance déclarée.

## 5. Coûts encore fondés sur une estimation (pas sur une facture)

Aucune intégration de ce dépôt ne renvoie de facture. Après cette mission :

| Fournisseur / outil | Nature réelle du montant | `costBasis` |
|---|---|---|
| `gemini-image@1` (`media.image.edit@1`) | prix configuré (`GEMINI_IMAGE_COST_CENTS`), jamais un reçu | `configured_estimate` |
| `gemini-audio@1` (`audio.transcribe@1`) | prix configuré (`AUDIO_TRANSCRIBE_COST_CENTS`) | `configured_estimate` |
| `gemini-tts@1` (`audio.tts@1`) | prix configuré (`AUDIO_TTS_COST_CENTS`) | `configured_estimate` |
| `vertex-gemini@1` (`assistant.draft@1`) | jetons annoncés × tarif configuré | `configured_estimate` |
| `editorial-recipe@1` (`marketing.plan@1`) | jetons annoncés × tarif configuré | `configured_estimate` |
| `replicate@1` / `runway@1` (`media.image@1`, `media.video@1`) | crédits renvoyés par l'API (`b.cost.credits`) — montant fournisseur, **pas** une facture | `provider_reported` |
| `sandbox.generate@1`, `sandbox.publish@1` | unités synthétiques de démonstration | `configured_estimate` |
| outils Python internes, studio, publication Postiz | aucun débit fournisseur | `none` |

Conclusion : **aucun montant du système n'est une charge vérifiée par facture**. Le seul niveau « vérifié » est humain
(`RECONCILED`, preuve obligatoire) ; tout le reste est explicitement estimé ou déclaré par le fournisseur.

## 6. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `pnpm exec vitest run tests/v1/cost-basis.test.ts` | démarrage Vite/esbuild → `spawn EPERM` (sandbox DSH Windows) | NOT_RUN |
| `pnpm exec vitest run tests/v1/execution-broker.test.ts` | idem + PostgreSQL 127.0.0.1:55432 absent | NOT_RUN |
| Toute autre suite Vitest / Playwright | idem | NOT_RUN |
| `prisma migrate status` | PostgreSQL absent | NOT_RUN |

**Limites assumées :** les 5 tests broker ajoutés et les 6 cas purs Vitest n'ont pas été exécutés ici ; la règle de
règlement, elle, l'a été par sonde Node (12 cas). L'affichage web du coût (`costState` brut, libellés « comptabilisés »)
n'a pas été adapté : une estimation s'affiche désormais `ESTIMATED`, mais la formulation reste perfectible (suivi).
`ESTIMATED` couvre deux situations distinguées par `state`/`reportedCents` (proposition ; estimation réglée).
Le ledger de droits (`billing_hold`/`billing_finish`) reste inchangé : une opération réconciliée manuellement garde son
droit « HELD » — comportement antérieur, hors périmètre (facturation gelée, aucune modification demandée).

## 7. Rollback

`git revert <sha>` : retour à `253ebc9`. Aucune migration, aucune donnée réécrite ; les opérations déjà réglées gardent
leur `costState` historique (`REPORTED` inclus), qui reste lisible.
