# P12-02 — Résultats d'outils sans perte et reprise sûre

**Lot :** P12-02 · **Branche :** `campaign/vululu-completion` · **Base :** `2100819` (P12-01).
**Date :** 2026-11-21. **Statut :** code compilé (typecheck 7/7) et logique de payload **exécutée hors Vitest** (sonde Node,
11 cas). Suites Vitest et tests broker **NOT_RUN environnemental** (§6). Aucune migration, aucun nouveau service,
aucun appel fournisseur.

Décision : [ADR-0047](../adr/0047-resultats-outils-volumineux-hors-base.md).

---

## 1. Constat d'audit (avant correction, HEAD `2100819`)

`apps/api/src/infrastructure/execution/broker.ts` bornait la colonne `ExecutionOperation.result` à 32 Kio :

```ts
const json = JSON.stringify(result);
return json.length <= 32768 ? JSON.parse(json) : { truncated: true, sizeBytes: json.length };
```

Conséquences constatées par lecture du code :

| # | Défaut | Effet |
|---|---|---|
| 1 | Troncature silencieuse **avant règlement** | une transcription (`audio.transcribe@1`, 200 segments ≈ 40 Kio), une analyse Python (`image.analyze@1`) ou une liste d'assets volumineuse perdaient leur contenu ; `{truncated:true}` était persisté comme résultat |
| 2 | Troncature aussi sur les incidents | la sortie d'un appel payé en `UNKNOWN` était perdue, donc non rapprochable sans rejouer le fournisseur |
| 3 | Aucune relecture possible | le contenu d'origine n'était stocké nulle part |
| 4 | `apply` cassé sur gros résultat | `applyAudioResult` lit `result.segments` en base → tableau absent → 422 `audio_result_missing` alors que l'appel avait été payé |

Vérifié aussi : `python/adapter.ts` (résultats JSON), `runtime.ts` (dispatch), `audio/service.ts` (transcription/TTS),
`ExecutionOperation` (colonne `result Json?`), stockage d'assets (inchangé : le payload n'est pas un binaire, il reste
dans la bibliothèque d'assets pour les fichiers et dans le stockage d'artefacts pour ce JSON).

## 2. Corrections

1. **Borne inline conservée** : ≤ 32 768 caractères → `result` inchangé (aucun consommateur ne voit de différence).
2. **Payload immuable au-delà** : écriture dans le stockage durable existant
   (`ArtifactStoragePort`, local ou S3) sous `execution-results/<compte>/<opération>/v1.json`, avec SHA-256 et taille
   vérifiés par le port à l'écriture.
3. **Référence bornée** en base : `{ __resultPayload: 1, provider, key, sha256, sizeBytes, contentType }` (< 512 octets).
4. **Plus aucune troncature** : `{truncated:true}` n'est plus produit ; un échec d'écriture du payload remonte
   explicitement et l'opération devient un incident (`UNKNOWN`, réservation conservée), jamais un résultat partiel.
5. **Ordre crash-safe** : payload écrit **avant** le règlement ; une panne entre la réponse fournisseur et le
   règlement laisse l'opération `CLAIMED` → `recover()` → incident, sans réinvocation du moteur (aucun appel payé dupliqué).
6. **Résolution transparente** : `loadOperationResult` (détail, apply) et `resolveOperationRows` (historiques) relisent la
   valeur d'origine ; en cas d'échec, une liste renvoie `result: null` **+** `resultUnavailable: true` (jamais un silence).
7. **Contrôles de lecture** : préfixe de propriété du compte, fournisseur identique à la référence, taille et SHA-256
   recalculés sur les octets lus, borne 16 Mio, JSON relisible ; erreurs typées
   `result_payload_foreign | _missing | _corrupt | _unavailable` (HTTP 409).
8. **Surfaces recâblées** : `GET /api/projects/:projectId/execution`, `GET /api/execution/:id`,
   `GET /api/admin/ops/execution/:id`, historique audio, historique image, `applyAudioResult`, `applyImageEdit`.
   Les marqueurs historiques `{truncated:true}` restent renvoyés tels quels (aucune réécriture de données).

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `pnpm exec tsc --noEmit` × 7 projets (domain, contracts, application, media, db, api, web) | 0 | 0 erreur | PASS |
| `pnpm lint` | 0 | 0 erreur, 5 avertissements préexistants (fichiers non touchés) | PASS |
| `pwsh -NoProfile -File scripts/check-migrations.ps1` (`MIGRATIONS=39`) | 0 | aucune migration ajoutée | PASS |
| `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | 0 | schéma valide, colonne `result` inchangée | PASS |
| `git diff --check` | 0 | propre | PASS |
| `tsc resultPayload.ts --outDir .tmp-payload --module commonjs …` puis `node .tmp-payload/probe.cjs` | 0 | `RESULT_PAYLOAD_PROBE_PASS cases=11` | PASS |

La sonde exécute réellement le module compilé (seul `require` émis : `node:crypto`) contre un stockage en mémoire
implémentant `ArtifactStoragePort`, et couvre : 1 Kio inline, 32 Kio pile inline, 32 769 caractères → payload,
40 Kio aller-retour avec empreinte stockée, transcription de 200 segments, marqueur `truncated` historique intact,
payload corrompu (même taille), taille incohérente, payload absent, référence d'un autre compte (refus **sans lecture**),
fournisseur de stockage non concordant, clés hors espace propriétaire.

## 4. Tests ajoutés (écrits, non exécutés ici)

- `tests/v1/result-payload.test.ts` — 11 cas, stockage mémoire : 1 Kio, 32 Kio, 32 Kio + 1, 40 Kio, transcription
  volumineuse, corrompu, taille incohérente + absent, cross-tenant (aucune lecture), fournisseur non concordant,
  marqueur historique, clés invalides. Vérifie aussi que la référence en base reste < 512 octets.
- `tests/v1/execution-broker.test.ts` — 2 cas supplémentaires : résultat > 32 Kio persisté en payload puis résolu
  à l'identique (état `SUCCEEDED`, 2 ¢), et résultat > 32 Kio avec montant hors plafond (incident `UNKNOWN`, réservation
  conservée, payload toujours résolu). Les cas **timeout** et **recovery** demandés existent déjà dans ce fichier.

## 5. Invariants préservés

- Transitions d'état du broker, incident `UNKNOWN` sans libération de réservation, `recover()` sans rejeu : inchangés.
- Frontière d'effet externe exactement-une-fois : la revendication (`CLAIMED`) reste le seul ticket d'invocation ; le
  payload est écrit après la réponse fournisseur et avant le règlement, donc une panne ne crée ni second appel ni
  double écriture comptable.
- Coûts (P12-01) : `costBasis` et `settlementFor` inchangés ; la référence de payload voyage dans le règlement comme
  n'importe quelle valeur bornée.
- Aucune migration, aucun JSON illimité en base, aucun nouveau moteur de workflow.

## 6. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `pnpm exec vitest run tests/v1/result-payload.test.ts` | Vite/esbuild → `spawn EPERM` (sandbox DSH Windows) | NOT_RUN |
| `pnpm exec vitest run tests/v1/execution-broker.test.ts` | idem + PostgreSQL 127.0.0.1:55432 absent | NOT_RUN |
| Toute autre suite Vitest / Playwright / `prisma migrate status` | idem | NOT_RUN |

**Risques résiduels :**

1. **Payloads orphelins** : une panne dure entre l'écriture du payload et le règlement laisse un objet sous une clé
   déterministe (`<compte>/<opération>/v1.json`), écrasé de façon inoffensive en cas de reprise ; la clé étant
   reconstituable depuis l'identifiant d'opération, un opérateur peut réattacher la référence lors du rapprochement ;
   aucune purge ni rattachement automatique n'est ajouté dans ce lot.
2. **Coût de lecture** : les historiques résolvent jusqu'à 30 payloads par requête (lecture stockage sans cache).
3. **Indisponibilité du stockage** : les détails échouent en 409 explicite et les listes marquent `resultUnavailable` ;
   l'utilisateur doit réessayer après rétablissement.
4. **Résultats d'avant P12-02 déjà tronqués** : ils restent tronqués (donnée perdue à l'époque) ; aucune reconstruction
   n'est tentée et rien n'est réécrit.
5. **Pas de compression** : les gros JSON sont stockés tels quels (borne 16 Mio).
6. **Validé par typecheck et sonde, pas par Vitest** : les tests DB (dont les deux nouveaux cas broker) n'ont pas pu
   s'exécuter ici.

## 7. Rollback

`git revert <sha>` : retour à `2100819`. Aucune migration ni écriture de données à défaire ; les références déjà
persistées deviendraient illisibles (les routes les traitaient de toute façon comme un résultat opaque), les objets
stockés resteraient inertes.
