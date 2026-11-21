# P12-04 — Qualité et contrats des capacités Python

**Lot :** P12-04 · **Branche :** `campaign/vululu-completion` · **Base :** `daa6f4f`.
**Date :** 2026-11-21. **Statut :** suite Python exécutée (34 tests, smoke 25 contrôles) et **contrat TypeScript
exécuté** sur le client réel compilé contre le service réel (13 contrôles). Vitest et tests base de données
**NOT_RUN** (causes §5). Aucun réseau, aucun modèle, aucun binaire ajouté.

---

## 1. Audit

| Point | Constat | Décision |
|---|---|---|
| Contrats | Pydantic (`contracts.py`), Zod/ToolBroker (`registry.ts`) et adaptateur TS (`adapter.ts`) portaient les mêmes champs, mais **sans test** : l'alignement était une convention | test de parité mécanique (lecture des trois sources) + rejeu du corps exact |
| Formats | seuls PNG et WAV étaient couverts par le smoke | fixtures JPEG (baseline + progressif), PNG (RGB, RGBA, palette tRNS), WebP (opaque + alpha), panorama/poster, fichiers tronqués, WAV mono/stéréo/corrompu |
| Détourage | aucune mesure de qualité ni d'alpha | tests : dimensions du masque = source, alpha réel 0/255, coins transparents, centre opaque, couverture bornée, échec explicite sans sujet |
| Modèles | `models.py` déclarait `usedBy: ("image.segment@1",)` et `verified: true` **sans empreinte épinglée** | corrigé : `usedBy: []`, `active/loaded: false`, `verified` seulement si empreinte épinglée, `sha256Pinned` exposé |
| « IA apprise » | le README et le registre disaient GrabCut, mais aucune garantie machine-lisible | `Capability.learned = False` + `modelUsed: null` dans le catalogue et la description du broker |
| Échecs | pas de test des chemins d'échec explicites | tests : image trop petite, format annoncé faux, empreinte, corruption, sans sujet, audio tronqué — jamais de sortie synthétique |

## 2. Corrections

1. `app/models.py` : détection honnête (présent ≠ actif ≠ vérifié), `purpose` explicite « NON ACTIVÉ », `usedBy: []`.
2. `app/registry.py` : champ `learned` (faux partout) et `modelUsed` exposés dans `/v1/capabilities`.
3. `registry.ts` (broker) : description de `image.segment@1` précise « GrabCut classique, non appris ».
4. `tests/fixtures.py` : corpus média déterministe en mémoire (aucun binaire commité).
5. `tests/test_capability_quality.py` : 18 tests (formats, ratios, corruptions, empreintes, qualité du
   détourage, honnêteté des modèles, disponibilité, parité de contrats, garde-fous de l'adaptateur, rejeu).
6. `tests/v1/python-client-contract.test.ts` : contrat du client TS (config bornée, enveloppe, erreurs) sur
   serveur HTTP local, sans base.

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `python -m pytest tests -q` (venv 3.12.4) | 0 | **34 passed** (16 service + 18 qualité/contrat) | PASS |
| `python scripts/smoke.py` | 0 | `SMOKE_RESULT=PASS checks=25 failures=0` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur | PASS |
| `node node_modules/eslint/bin/eslint.js tests/v1/python-client-contract.test.ts apps/api/src/.../registry.ts` | 0 | 0 erreur | PASS |
| `tsc client.ts --outDir …` + sonde Node sur le **service réel** (uvicorn, port 8097) | 0 | `TS_CONTRACT_RESULT=PASS checks=13` | PASS |
| `docker info` | 1 | démon Docker absent (inchangé depuis P12-03) | NOT_RUN (env.) |
| `vitest run tests/v1/python-client-contract.test.ts` | 1 | `spawn EPERM` (esbuild) | NOT_RUN (env.) |
| Tests base (licence/propriété/persistance de bout en bout) | — | PostgreSQL 55432 absent | NOT_RUN |

Sonde TS exécutée (client réel compilé) : config absente / jeton court refusés, délai borné 1 s–120 s,
URL assainie, analyse 200 avec `data.analysis` et `version`, **401 unauthorized** non rejouable,
**422 source_checksum_mismatch** non rejouable, **413 payload_too_large** non rejouable,
**503 unreachable** rejouable, **502 invalid_response** non rejouable.

## 4. Couverture des exigences

| Exigence | Preuve | Statut |
|---|---|---|
| 1. Contrats identiques Pydantic/Zod/ToolBroker | `test_contract_parity_pydantic_typescript_broker` (champs, bornes, ordre), `test_adapter_body_replay_satisfies_response_contract` | PASS (Python), parité relue mécaniquement |
| 2. Fixtures JPEG/PNG/WebP/transparence/ratios/corrompus/WAV | `test_analyze_real_formats` (7 cas), `test_aspect_ratios_extreme`, `test_corrupted_and_inconsistent_sources`, `test_audio_wav_quality_and_corruption` | PASS |
| 3. SHA-256 source/sortie, licence, propriété, confirmation, persistance immuable | source/sortie : `test_source_and_output_sha256_verification` (PASS) ; licence/propriété/confirmation/persistance : `test_adapter_guards_order_ownership_and_immutable_persistence` (statique, ordre des garde-fous) — comportement de bout en bout **NOT_RUN** (base absente) | PARTIEL |
| 4. Segmentation réelle, alpha/masque, mesure des échecs | `test_segmentation_quality_measures_failures` (3 sujets, échecs listés), `test_segmentation_without_subject_fails_explicitly` | PASS |
| 5. GrabCut jamais présenté comme appris ; ONNX honnête | `test_capabilities_are_classical_and_models_are_not_active` (`learned:false`, `active:false`, `verified:false`) | PASS |
| 6. Échecs déterministes, aucune sortie synthétique | tests corruptions/format/empreinte/sans sujet + absence de `outputs` dans les réponses d'échec | PASS |
| 7. Disponibilité et santé internes | `test_health_and_availability_reporting` (limites, pool, jeton requis, 3 capacités) | PASS |
| 8. Tests Python + TypeScript exécutés localement | 34 pytest + smoke 25 + sonde TS 13 contrôles | PASS (vitest NOT_RUN) |

## 5. NOT_RUN et limites

- **Vitest** ne démarre pas dans cette session (`esbuild` → `spawn EPERM`), donc
  `tests/v1/python-client-contract.test.ts` est écrit mais non exécuté ; la même logique a été **exécutée**
  via le client compilé contre le service réel (13 contrôles PASS).
- **PostgreSQL absent** : les comportements de bout en bout de l'adaptateur (licence refusée, version hors
  sélection confirmée, persistance immuable des versions d'assets) sont vérifiés **statiquement**
  (présence et ordre des garde-fous dans `adapter.ts`) mais pas exécutés.
- **Docker absent** : image et réseau non rejoués dans cette mission (voir P12-03).
- Le corpus de fixtures est synthétique et déterministe : il prouve la robustesse du contrat, pas la qualité
  de segmentation sur des photographies réelles.
- GrabCut reste classique : aucune promesse de qualité « IA ». Un modèle ONNX n'est ni activé ni requis, et
  le déploiement d'un tel modèle n'est pas étudié ici (hors périmètre, contraintes tailles/licence non prouvées).

## 6. Rollback

`git revert <sha>` : retour à `daa6f4f`. Aucune migration, aucune donnée modifiée ; les tests ajoutés sont
supprimés avec le commit.
