---
name: vululu-project-orientation
description: S'orienter dans Vululu AI avant toute mission — autorités documentaires, carte du dépôt, état réel au HEAD courant (2026-11-20), capacités IMPLEMENTED / PROVIDER_DEPENDENT / MOCK / MISSING, vocabulaire de la campagne P00–P13 et pièges de lecture.
whenToUse: Au démarrage de toute session sur Vululu AI, avant de planifier un lot, répondre à "où en est le projet ?" ou chercher où se trouve une fonctionnalité.
---

# Vululu AI — orientation projet

**But** : donner en quelques minutes la carte fiable du dépôt et l'état réel du projet, pour éviter de travailler sur une base documentaire périmée ou de refaire un travail déjà livré.

## Quand l'utiliser

- Première action d'une session sur Vululu AI (après lecture d'AGENTS.md).
- Avant de proposer un lot, une correction ou une réponse sur l'avancement.
- Pour décider quel skill/quelle zone du dépôt charger ensuite.

**Ne pas l'utiliser pour** : exécuter la pile locale (voir `vululu-local-stack`), choisir les commandes de vérification (voir `vululu-quality-gates`), modifier du code (voir `vululu-architecture-change`), préparer le staging (voir `vululu-ops-readiness`), exécuter un lot (voir `vululu-lot-delivery`).

## État vérifié (2026-11-20, HEAD `f5d515b`)

| Élément | Valeur |
|---|---|
| Branche / remote | `main` / `origin https://github.com/tachfineamnay/vululu.v1.git` ; branche d'intégration de la campagne : `campaign/vululu-completion` (créée en P00 depuis `main`) |
| HEAD | `f5d515b` — merge PR #24 (2026-11-20) ; HEAD précédent notable : `aa935a0` (docs vision) |
| Dépôt | 34 migrations, 66 modèles Prisma, 22 fichiers de routes API, 32 pages web, 23 composants web, 85 fichiers Vitest, 26 specs Playwright |
| Produit | **bêta gratuite** (BETA01) : `VULULU_BETA_MODE` absent ⇒ `1`, commerce gelé, aucun paiement client possible |
| Déploiement | **aucun staging ni production déployé** ; `DEPLOYMENT_NOT_READY` historique **non levé** ; CI GitHub jamais exécutée ⇒ `NOT_RUN` |
| Fournisseurs réels | code présent (Vertex, Replicate, Runway, Postiz, Stripe, Resend) mais **non activés** ; appels réels `NOT_VERIFIED` |
| Statut de référence | [inventaire courant](../../../docs/implementation/VULULU_FEATURE_INVENTORY.md) ; [contrat de finition](../../../docs/implementation/VULULU_FINISH_CONTRACT.md) |

Toute affirmation d'avancement doit être adossée à un fichier du dépôt ou à une commande rejouée. Ne jamais citer « ça marchait avant » comme preuve.

### Hiérarchie de fiabilité

1. **Faits d'exécution** : `git log`, `git status`, code présent, commandes rejouées. Priment sur toute prose.
2. `docs/implementation/VULULU_FEATURE_INVENTORY.md` : état courant, fichier par fichier.
3. `docs/delivery/` (C02–C13, F01–F07, BETA01) : preuves **datées** par lot ; ne valent que pour leur périmètre et leur date.
4. Corpus fondateur (PRD, CDC, architecture, backlog) : autorité sur le **périmètre exigé**, pas sur l'état d'implémentation.
5. `README.md`, `docs/delivery/VULULU_DELIVERY_STATUS.md`, `VULULU_BASELINE.md`, `ARENA_BASELINE.md` : **historisques** (2026-11-04/19), conservés comme preuves ; ne plus les utiliser pour conclure sur l'état courant.

Un conflit entre documents se **signale** (AGENTS.md §1) ; il ne s'arbitre pas en silence.

## Carte du dépôt

| Chemin | Rôle |
|---|---|
| `apps/api` | API Fastify 5 : 22 fichiers de routes, auth/session/CSRF, composition (`src/application/container.ts`), adaptateurs infra (Prisma, stockage local/S3, média, Postiz, Vertex, Replicate/Runway, Stripe, durable/Hatchet), worker `src/worker` |
| `apps/web` | Next 16.4.2 / React 19 : 32 pages (accueil, comptes, projets, calendrier, créations, résultats, admin), Studio, assistant, éditeur créatif |
| `packages/domain` | Domain Core pur (23 fichiers TS, zéro dépendance runtime) |
| `packages/application` | Ports + 20 cas d'usage (30 fichiers TS), RBAC/budgets/idempotence/snapshots |
| `packages/contracts` | Schémas Zod partagés web/serveur (assistant, créatif, calendrier, marketing, formats, admin) |
| `packages/db` | Prisma 6.19.3 : schéma, **34 migrations**, seed |
| `packages/media` | Rendu Sharp (composition native, texte, assets) + assemblage FFmpeg |
| `tests/` | 85 fichiers Vitest : `domain/`, API/V1, média, sécurité, bêta, fournisseurs |
| `e2e/` | 26 specs Playwright (Studio, calendrier, publication, facturation, comptes, admin…) |
| `scripts/` | Gates PowerShell (secrets, frontières, migrations, docs, fichiers suivis, CI locale) + scripts préprod/arena |
| `docs/` | Corpus fondateur VERBATIM, `adr/` (0001–0034), `delivery/` (preuves datées), `product/`, `implementation/` (état courant), runbooks |
| `infra/` | Compose/Dockerfiles préprod et Coolify ; modèles d'env sans secrets |
| `.v0/`, `.v1/`, `data/`, `test-results/`, `_inbox/` | Runtime local et artefacts, **ignorés par Git** — ne pas versionner, ne pas citer comme preuve commitée |

## Ce qui est réel, dépendant, MOCK ou absent (2026-11-20)

- **IMPLEMENTED (code présent, parcours câblé)** : inscription vérifiée et comptes clients, profils d'activité + offres confirmées, campagnes, projets, briefs versionnés, bibliothèque d'assets (upload, inspection, versions, droits, sélection), compositions créatives versionnées (Sharp/FFmpeg), rendu Studio durable (file, bail, reprise), formats Post/Story/Carrousel/Reel/Vidéo, calendrier éditorial multi-plateformes, approbations d'une version exacte, export/téléchargement et kit manuel de publication, résultats/exports, assistance, admin, audit, health/metrics, bêta gratuite. Détail et fichiers : **inventaire P00**.
- **PROVIDER_DEPENDENT (code écrit, flag off, appels réels `NOT_VERIFIED`)** : assistant Vertex (`infrastructure/assistant/vertex.ts`, repli local déterministe), génération image Replicate (`infrastructure/mediaGeneration/providers.ts`), vidéo Runway, publication Postiz (`infrastructure/publishing/provider.ts`), facturation Stripe (`infrastructure/billing/`, gelée), e-mails de compte (Resend).
- **MOCK / legacy** : `mockCapabilityProvider.ts`, `deterministicProviderAdapter.ts`, `deterministicContextAnalyzer.ts` (registre de capacités historique), `postizMockAdapter.ts` (conservé, ne pas confondre avec le provider Postiz réel).
- **MISSING** : serveur MCP (aucun code serveur ; seules les variables d'env OAuth existent), TTS/voix/audio/mixage, édition avancée de vidéo/audio importés, propositions de directions artistiques comme objet de première classe (à confirmer dans l'inventaire). Ne jamais annoncer une capacité payante non activée comme disponible.
- **Règle de discours** : un rendu local réel (Sharp/FFmpeg) n'est **pas** une génération IA ; un transfert Postiz MOCK n'est **pas** une publication ; un build n'est **pas** une certification.

## Vocabulaire et identifiants

- Produit : **Vululu AI** ; nom technique `vululu-ai` ; dépôt `vululu.v1`. Docs en français, identifiants de code en anglais, dates ISO 8601.
- Campagne courante : **P00–P13** (contrat de finition). `BUILD_UNVERIFIED` = construit non vérifié ; `BUILD_VERIFIED` réservé à P12. En P00–P11, aucun `PASS` n'est déclaré.
- Lots historiques : `V1-00`, `V1-01-A..H`, `P0-0/P0-A..F`, `C02–C13`, `F01–F07`, `BETA01` — vérifier `git log`, `docs/delivery/` et l'inventaire.
- Exigences : `PRD-xx`, `CDC-F-xxx`, `CDC-N-xxx`, épics `E00-xx` ; décisions `ADR-NNNN` (prochain libre : 0035) ; décisions ouvertes `D-xx` (inauguration).
- Statuts de capacité : `IMPLEMENTED` / `PARTIAL` / `MISSING` / `PROVIDER_DEPENDENT` / `MOCK` / `NOT_VERIFIED`.

## Procédure de démarrage recommandée

1. Lire `AGENTS.md` (parties A, B, C) puis ce skill.
2. `git status --short` + `git log --oneline -10` : branche, HEAD, travaux locaux, dernier lot.
3. Lire `docs/implementation/VULULU_FINISH_CONTRACT.md` puis l'inventaire courant ; charger la fiche du lot P01–P11 visé (`VULULU_COMPLETION_PLAN.md`).
4. Identifier l'exigence PRD/CDC et la preuve existante avant d'écrire du code.
5. Vérifier la frontière V1/V2 et les conditions d'arrêt d'AGENTS.md avant toute action coûteuse.
6. Pendant P00–P11 : ne pas exécuter tests/lint/typecheck/build ; livrer en `BUILD_UNVERIFIED`.

## Pièges connus

- **Documents d'état périmés mais toujours cités** : `README.md` (statut 2026-11-04), `VULULU_DELIVERY_STATUS.md` et `VULULU_BASELINE.md` (2026-11-19), `ARENA_BASELINE.md`. Ils décrivent un produit sans composition d'assets, sans publication et sans facturation. L'inventaire courant les remplace ; ils restent des preuves datées.
- **AGENTS.md Partie B** : les compteurs de §14.2 et le constat §13.4 sont datés du 2026-11-19 (note P00 ajoutée). Les règles restent en vigueur ; pas les chiffres.
- **Deux chemins d'exécution** : `LocalProductionExecutor`/mode `local` (en process, non durable après crash) vs `ORCHESTRATOR_MODE=hatchet` (worker séparé). Le rendu Studio F06 a sa propre file durable en base, différente de Hatchet.
- **Fournisseurs derrière flags** : Vertex/Replicate/Runway/Postiz/Stripe ne s'activent que par variables d'environnement explicites ; ne jamais supposer une capacité depuis le code, et ne jamais activer sans autorisation écrite et budget.
- **Bêta gratuite** : par défaut le commerce est gelé au démarrage ; une base migrée est nécessaire au boot. Ne pas « réactiver » la vente pour tester.
- **Index ADR partiel** : 0001–0034 existent, l'index `docs/adr/README.md` est en retard (tableau jusqu'à 0026/0027 ; 0028/0033/0034 hors tableau). Vérifier le dossier, pas l'index seul.
- **Gates documentaires en échec connu** : `verify-foundation-docs.ps1` et `check-tracked-files.ps1` refusent `infra/coolify/.env.coolify.example` (nommage) ; `check-secrets.ps1 -History` signale un placeholder. Pas une fuite ; ne pas contourner par suppression.
- **CI distante** : définie mais jamais exécutée ⇒ `NOT_RUN`. Ne jamais écrire « CI verte ».
- **Aucune action externe sans GO humain** : push, merge, déploiement, publication, activation fournisseur, dépense.

## Checklist avant de proposer un plan

- [ ] Branche, HEAD et arbre connus.
- [ ] Lot P00–P13 identifié et fiche de lot lue ; périmètre borné.
- [ ] Exigence PRD/CDC et preuve existante identifiées ; pas de travail déjà livré refait.
- [ ] Frontière V1/V2 et invariants (RBAC, budgets, approbations, immutabilité, audit) respectés.
- [ ] Statut de preuve honnête (`BUILD_UNVERIFIED`/`NOT_RUN`/MOCK), aucune certification implicite.
- [ ] Skills complémentaires chargés selon la mission.

## Références

- `AGENTS.md` — règles absolues, parties A/B/C, conditions d'arrêt.
- [Contrat de finition](../../../docs/implementation/VULULU_FINISH_CONTRACT.md), [inventaire courant](../../../docs/implementation/VULULU_FEATURE_INVENTORY.md), [carte P01–P11](../../../docs/implementation/VULULU_COMPLETION_PLAN.md).
- `docs/README.md` — index et règles d'intégrité ; `docs/product/VULULU_EXPERIENCE_VISION_2026-11-20.md` — vision produit (révisée P00 : assets avant brainstorming).
- `docs/adr/` (0001–0034), `docs/delivery/C13.md` (dernière revue de livraison), `docs/delivery/F01–F07`, `docs/delivery/BETA01_FREE_TESTING.md`.
- Skills liés : `vululu-lot-delivery`, `vululu-local-stack`, `vululu-quality-gates`, `vululu-architecture-change`, `vululu-ops-readiness`.
