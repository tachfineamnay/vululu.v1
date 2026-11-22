---
name: vululu-lot-delivery
description: Exécuter un lot Vululu AI conforme à AGENTS.md — exigences PRD/CDC, périmètre V1, tests et preuves honnêtes, ADR, git, checklist de fin et conditions d'arrêt.
whenToUse: Avant d'implémenter, corriger ou documenter un lot sur Vululu AI, ou pour préparer une revue de diff et un rapport de preuve.
---

# Vululu AI — livraison d'un lot

**But** : transformer une demande en lot livrable, testable et réversible, avec des preuves vérifiables, sans violer le périmètre V1 ni les règles du dépôt.

Sources d'autorité : `AGENTS.md` (règles), `docs/PROMPT_DEEPSEEK_HARNESS.md` (cadre de travail), PRD/CDC (exigences), ADR (décisions). Ce skill est la procédure opérationnelle ; AGENTS.md reste prioritaire.

## Quand l'utiliser

- Toute demande d'implémentation, correction, migration, documentation structurante ou audit.
- Préparation d'un rapport de lot, d'un commit, d'une revue de diff.
- Coordination de plusieurs agents ou workstreams sur le même dépôt.

**Ne pas l'utiliser pour** : une simple question de lecture (voir `vululu-project-orientation`) ou l'exécution d'un test isolé (voir `vululu-quality-gates`).

## 0. Campagne P00–P13 : mode BUILD-FIRST (prioritaire)

Depuis le 2026-11-20, la complétion produit suit le [contrat de finition](../../../docs/implementation/VULULU_FINISH_CONTRACT.md) et la [carte des lots P01–P11](../../../docs/implementation/VULULU_COMPLETION_PLAN.md). Pour tout lot de cette campagne :

1. **Pas de tests, lint, typecheck, build ni gates complets pendant P00–P11** : ils appartiennent à P12–P13. Ne pas les lancer « pour vérifier » et ne jamais les présenter comme certification.
2. Un lot = **un commit** sur la branche d'intégration `campaign/vululu-completion`, message `feat(pXX): ... [BUILD_UNVERIFIED]`.
3. Statut par défaut `BUILD_UNVERIFIED` ; `PASS` est interdit pendant la construction. Vérification manuelle minimale autorisée, jamais appelée certification.
4. Points de départ fichier par fichier dans la carte des lots ; ne pas recréer un concept existant (voir l'[inventaire](../../../docs/implementation/VULULU_FEATURE_INVENTORY.md)).
5. Les sections 1 à 8 ci-dessous restent la procédure de référence pour un lot **vérifié** (P12–P13, maintenance hors campagne).

## 1. Cadrer le lot (avant tout code)

1. **Exigences** : identifier les IDs PRD/CDC concernés (ex. `CDC-F-040`, `CDC-N-001`) et les épics/backlog liés. Sans exigence identifiable, demander une clarification — ne pas inventer un besoin.
2. **Périmètre** : V1 uniquement. Interdit : Memory Bank, mémoire sémantique/embeddings, apprentissage des préférences, contextes hiérarchiques enrichis, marketplace, abonnements, Everything LLM. Le socle commercial F05 (catalogue, ledger, Stripe) existe déjà dans le code mais reste **gelé** par la bêta gratuite : ne pas l'activer, ne pas l'étendre sans décision explicite. La « monétisation » au sens V2 reste interdite.
3. **Contrat d'acceptation** : écrire (même brièvement) interfaces, contrats, critères d'acceptation et preuves attendues avant d'implémenter.
4. **État de preuve existant** : lire `docs/implementation/VULULU_FEATURE_INVENTORY.md` (état courant), les rapports `docs/delivery/` du domaine concerné et, pour l'historique, `docs/certification/`. Ne pas refaire un travail déjà livré ; ne pas recycler une preuve historique comme preuve du jour.
5. **Décision ouverte ?** Si le lot tranche une décision structurante (stack, topologie, contrat, périmètre, sécurité), il exige un **ADR** avant ou avec le code. Les décisions `D-xx` encore ouvertes ne se tranchent pas silencieusement.
6. **Arrêt immédiat** si : spécification contradictoire ou manquante ; action destructive ; secret détecté ; fonctionnalité V2 demandée ; dépense fournisseur sans budget ; push/merge/déploiement/publication sans GO humain explicite.

## 2. Implémenter

- Respecter les couches et invariants : charger `vululu-architecture-change` avant de toucher au domaine, à l'application, aux adaptateurs ou aux migrations.
- Modifier uniquement le périmètre du lot ; aucun refactoring opportuniste, aucune fonctionnalité « utile » non demandée.
- Migrations additives et réversibles ; jamais de blob lourd en base ; artefacts binaires en stockage objet.
- Aucun secret dans le code, les tests, les logs, les rapports ou les commits ; jamais d'appel réseau/coût externe pendant un test.
- Mettre à jour la documentation liée au lot (rapport d'exécution, ADR, index ADR, roadmap) — sans jamais réécrire un document importé VERBATIM.

## 3. Tester et prouver

Utiliser `vululu-quality-gates` pour les commandes. Minimum selon le lot :

- Domain/use cases : tests unitaires.
- Adaptateurs : tests de contrat (provider, Postiz, stockage, MCP).
- Intégration : PostgreSQL/files/outbox, base de test isolée.
- E2E : parcours utilisateur concerné (Playwright), si l'UI change.
- Sécurité : IDOR/RBAC/CSRF/rate-limit/upload/SSRF sur les lots concernés.

**Rapport de preuve obligatoire** (dans `docs/execution/` pour un lot, `docs/reports/` pour une recette) :

```markdown
- Date : AAAA-MM-JJ — Base : HEAD <sha>
- Commande : <commande exacte>
- Résultat : PASS | FAIL | SKIP (motif) | MOCK | NOT_RUN (motif)
- Limitation : <ce qui n'a pas été couvert>
- Rollback : <procédure>
```

Règles : une étape non exécutée s'écrit **NOT_RUN**, jamais PASS ; un fournisseur simulé s'écrit **MOCK** ; un test ignoré s'écrit **SKIP** avec motif. Les chiffres historiques doivent être datés et attribués à leur rapport d'origine. « Transféré vers Postiz » ≠ « publié ».

## 4. Vérifier le diff et le dépôt

1. `git status --short`, `git diff`, `git diff --check`.
2. `pwsh -NoProfile -File scripts/check-secrets.ps1` (scan arbre : doit passer ; en mode `-History`, échec connu de placeholder sur `infra/coolify/.env.coolify.example`, voir `vululu-quality-gates` §3).
3. Rejouer les gates pertinents (voir `vululu-quality-gates`) ; noter les échecs connus sans les masquer : `verify-foundation-docs.ps1` et `check-tracked-files.ps1` échouent sur `infra/coolify/.env.coolify.example` (nommage, pas une fuite).
4. Vérifier l'absence de régression sur la verticale existante et la non-modification des fichiers générés/`.env`/runtime local.
5. Confirmer que le diff ne contient ni secret, ni fichier local ignoré, ni modification d'un document VERBATIM.

## 5. Git et documentation

- Branche de référence : `main`. Campagne P00–P13 : branche d'intégration `campaign/vululu-completion` uniquement, aucun push/merge sans GO explicite. Pas de force push, pas de réécriture d'historique partagé, pas de suppression de commit/fichier non demandée.
- Commits courts au présent, préfixés : `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `adr`. Un commit relisible et réversible.
- Ne pas commiter : `.env*` (hors modèles), secrets, `node_modules`, `data/`, `.v0/`, `.v1/`, `test-results/`, artefacts générés.
- ADR : nouvelle décision ⇒ `docs/adr/NNNN-titre.md` (template `docs/adr/template.md`), index `docs/adr/README.md` mis à jour. Ne jamais modifier un ADR accepté (en créer un qui le remplace).
- Documents importés (PRD, CDC, architecture, backlog, prompt, note V2) : VERBATIM, jamais modifiés. Une évolution = nouveau document daté, ADR ou révision explicite.
- Roadmap/backlog : mettre à jour `docs/backlog/ROADMAP_V1.md` ou le document de statut prévu si le lot change un jalon — sans réécrire l'historique.

## 6. Definition of Done (contrôle final)

> En campagne P00–P11, la DoD applicable est celle du contrat de finition §8 (`BUILD_UNVERIFIED`), pas celle-ci : les tests ne tournent pas pendant la construction. Cette section s'applique aux lots vérifiés (P12–P13 et travaux hors campagne).

- [ ] Exigences PRD/CDC et critères d'acceptation couverts.
- [ ] Code typé, documenté ; migration si nécessaire, additive.
- [ ] Tests unitaires + contrat verts ; intégration/E2E pertinents verts ou NOT_RUN motivé.
- [ ] RBAC et isolation vérifiés sur les lots concernés.
- [ ] Coûts et traces mesurés (MOCK explicite le cas échéant).
- [ ] Documentation/ADR à jour ; roadmap à jour si jalon.
- [ ] Diff relu, aucun secret, aucun fichier interdit.
- [ ] Preuves fournies (commandes + résultats + limitations) ; rollback décrit.
- [ ] Aucun push/merge/déploiement/publication effectué sans GO humain explicite.

## 7. Travail en équipe (Agent Teams)

- Découper par zone à écrire disjointes (domaine / application / infra / web / docs / tests) ; enregistrer les scopes d'écriture dans les tâches partagées.
- Un seul propriétaire par fichier ; le Lead relit le diff final et rejoue les gates.
- Les tâches dépendantes se déclarent `blocked_by` ; un message ne vaut pas preuve de traitement.
- Les skills projet servent de contrat commun : chaque agent charge les skills utiles avant d'écrire.

## 8. Pièges connus

- **Confusion des numérotations** : lots historiques `V1-00`, `V1-01-A..H` vs roadmap `P0-0/P0-A..F` ; vérifier le `git log` et les rapports avant d'annoncer un statut.
- **Preuves en retard** : README/roadmap décrivent un état ancien ; les verdicts datés de certification/recette ne sont pas des preuves du jour.
- **CI** : le workflow existe mais n'a jamais tourné sur runner distant (`NOT_RUN`) ; ne pas écrire « CI verte ».
- **Gates documentaires** : échec de nommage `infra/coolify/.env.coolify.example` à traiter par un lot dédié, pas par suppression/renommage silencieux.
- **Mode local** : `LocalProductionExecutor` n'est pas durable après crash ; ne pas le présenter comme Hatchet.
- **Coûts** : aucun fournisseur réel, aucun budget engagé sans autorisation.

## Références

- `AGENTS.md`, `docs/PROMPT_DEEPSEEK_HARNESS.md`.
- `docs/01_PRD_V1.md`, `docs/02_CAHIER_DES_CHARGES_V1.md`, `docs/11_BACKLOG.md`, `docs/backlog/ROADMAP_V1.md`.
- `docs/adr/README.md`, `docs/adr/template.md`.
- `docs/execution/` (preuves de lots), `docs/certification/`, `docs/reports/`.
- Skills liés : `vululu-project-orientation`, `vululu-quality-gates`, `vululu-architecture-change`, `vululu-local-stack`, `vululu-ops-readiness`.
