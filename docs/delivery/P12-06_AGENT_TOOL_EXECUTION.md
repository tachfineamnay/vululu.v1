# P12-06 — Sécurité et cohérence de l'exécution outillée par l'agent

**Lot :** P12-06 · **Branche :** `campaign/vululu-completion` · **Base :** `128b4e8`.
**Date :** 2026-11-21. **Statut :** code compilé (API + Web), politique de proposition **exécutée** (sonde 7 cas).
Tests Vitest (base) **NOT_RUN** (PostgreSQL absent, §5). Aucun appel payant, aucune orchestration ajoutée.

Décision : [ADR-0050](../adr/0050-agent-proposal-authority.md).

---

## 1. Audit de la chaîne

Chaîne contrôlée : recommandation LLM → validation de schéma → proposition persistée → autorisation humaine
→ réservation budget → claim worker → résultat vérifié.

| # | Trouvé | Emplacement | Effet |
|---|---|---|---|
| 1 | Route agent validant seulement `definition.params` | `routes/execution.ts` | un outil `agentProposable: false` (image.edit, audio.transcribe, audio.tts) pouvait être proposé depuis un tour ancien/forgé |
| 2 | Broker faisant confiance à l'appelant | `broker.proposeTx` | paramètres non revalidés côté serveur, digest calculé sur une valeur non validée |
| 3 | Aucun lien paramètres ↔ sélection confirmée | `broker.proposeTx` | proposition autorisable sur une ressource non confirmée (exécution perdue) |
| 4 | Recommandations filtrées par nom seulement | `assistant/service.ts` | paramètres non conformes persistés et présentés à l'utilisateur |
| 5 | UI affichant un coût estimé comme un débit et un « résultat » d'échec | `ProjectExecutionStatus.tsx` | succès/débit suggérés à tort |

**Invariants déjà sains, vérifiés par lecture** : registre fermé et versionné ; `allowed()` (propriété, outil
autorisé, confirmation des ressources, approbation de contenu pour `WRITE/PUBLISH`) ; verrou de compte
sérialisant propositions et autorisations (donc pas de double réservation) ; `key_payload_conflict` par digest ;
claim unique (`CLAIMED`) empêchant la double exécution ; `failed` ⇒ libération, incertitude ⇒ réservation
conservée ; `recover()` sans rejeu.

## 2. Corrections

1. `application/agentProposalPolicy.ts` (règle pure) : `tool_unknown` (403), `tool_not_proposable` (403),
   `agent_scope_unsupported` (409), sinon accord.
2. `registry.ts` : `isAgentProposable()`, `toolPolicy()` ; `agentTools` construite avec la même règle.
3. `routes/execution.ts` : politique appliquée avant de parser ; erreurs explicites.
4. `broker.proposeTx` : politique + revalidation Zod (valeur validée hachée **et** exécutée) +
   `asset_not_confirmed` pour `versionId` hors sélection confirmée.
5. `assistant/service.ts` : une recommandation n'est persistée que si outil ∈ catalogue agent **et** paramètres
   conformes.
6. `ProjectExecutionStatus.tsx` : libellés de coût par provenance (`ESTIMATED` = « estimation, non facturée »,
   etc.), aucun « résultat structuré » pour `FAILED`, message explicite pour `UNKNOWN`, `RESOLVED` =
   « coût constaté ».

## 3. Invariants vérifiés (état après mission)

| Invariant | Preuve |
|---|---|
| L'agent ne peut proposer un outil réservé à l'utilisateur | politique + sonde `tool_not_proposable` + test DB |
| L'agent ne peut cibler une révision précise | sonde `agent_scope_unsupported` |
| Outil inconnu refusé | sonde `tool_unknown` |
| Paramètres revalidés côté serveur, digest = valeur exécutée | code `proposeTx` + test `agent_params_invalid` |
| Ressource non confirmée refusée | code + test `asset_not_confirmed` |
| Clé d'idempotence réutilisée avec d'autres paramètres refusée | `key_payload_conflict` (existant) + test |
| Propriété/tenant vérifiés | `owned()`/`allowed()` + test « autre propriétaire » |
| Outil non autorisé pour le compte refusé | `allowed()` + test `tool_disabled` |
| Pas de double réservation (verrou compte, approbation idempotente) | `reserve()`/`lock()` + test d'approbation double |
| Effet de bord sans autorisation jamais exécuté | `execute` exige `CLAIMED` + `approvedBy` (test) |
| Échec/incertitude non présentés comme succès | `failed`/`uncertain` (P12-01) + UI |

## 4. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur | PASS |
| `tsc --noEmit -p apps/web/tsconfig.json` | 0 | 0 erreur | PASS |
| `eslint` sur les 6 fichiers touchés | 0 | 0 erreur | PASS |
| Sonde compilée `agentProposalPolicy.ts` + invariants du registre lus dans la source | 0 | `AGENT_POLICY_PROBE_PASS cases=7` | PASS |
| `prisma validate` | 0 | schéma inchangé, valide | PASS |

## 5. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `vitest run tests/v1/agent-tool-execution.test.ts` (9 cas) | PostgreSQL `127.0.0.1:55432` absent **et** `esbuild`/`spawn EPERM` | NOT_RUN |
| `tests/v1/execution-broker.test.ts` (races, timeout, SIGKILL, reprise) | idem | NOT_RUN |
| E2E navigateur (ProjectExecutionStatus) | Playwright non exécutable ici | NOT_RUN |

**Limites assumées :** la concurrence réelle (double autorisation, double message) est écrite en tests mais
non rejouée sur une base ici ; le filtre au stockage fait disparaître une recommandation invalide sans la
signaler à l'utilisateur (repli déterministe) ; aucune nouvelle orchestration, aucun outil ajouté au registre.

## 6. Rollback

`git revert <sha>` : retour à `128b4e8`. Aucune migration, aucune donnée modifiée ; la politique redevient
celle de la route seule.
