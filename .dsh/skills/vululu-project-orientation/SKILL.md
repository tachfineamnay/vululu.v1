---
name: vululu-project-orientation
description: S'orienter dans Vululu AI avant toute mission — autorités documentaires, carte du dépôt, état réel V1 (HEAD, verdicts, MOCK et absences), vocabulaire des exigences et pièges de lecture.
whenToUse: Au démarrage de toute session sur Vululu AI, avant de planifier un lot, répondre à "où en est le projet ?" ou chercher où se trouve une fonctionnalité.
---

# Vululu AI — orientation projet

**But** : donner en quelques minutes la carte fiable du dépôt et l'état réel du projet, pour éviter de travailler sur une base documentaire périmée ou de refaire un travail déjà livré.

## Quand l'utiliser

- Première action d'une session sur Vululu AI (après lecture d'AGENTS.md).
- Avant de proposer un lot, une correction ou une réponse sur l'avancement.
- Pour décider quel skill/quelle zone du dépôt charger ensuite.

**Ne pas l'utiliser** pour : exécuter la pile locale (voir `vululu-local-stack`), choisir les commandes de vérification (voir `vululu-quality-gates`), modifier du code (voir `vululu-architecture-change`), préparer le staging (voir `vululu-ops-readiness`).

## État vérifié (2026-11-04, HEAD `bb0bc3a`)

| Élément | Valeur |
|---|---|
| Branche / remote | `main` / `origin https://github.com/tachfineamnay/vululu.v1.git` |
| HEAD | `bb0bc3a` — dernier commit `docs(release)` recette V1 locale et décision NO-GO staging |
| Arbre | propre au départ ; untracked : `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` |
| Verdict architecture V1 locale | `ARCHITECTURE_GO_CONDITIONNEL` / GO technique local pour poursuivre le développement |
| Verdict déploiement | `DEPLOYMENT_NOT_READY` |
| Staging | NO-GO accès privé STAGING ; NO-GO activation publique ; aucun staging réel déployé |
| CI GitHub Actions | définie (`ci.yml`, 4 jobs) mais **jamais exécutée** sur runner distant ⇒ NOT_RUN |

Ces verdicts sont datés (certification 2026-10-25, recette 2026-11-01). Ne jamais les améliorer sans nouvelle preuve rejouée et datée.

### Lecture de l'état : hiérarchie de fiabilité

1. **Faits d'exécution** : `git log`, `git status`, commandes rejouées, sorties de scripts. Priment sur toute prose.
2. `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` : analyse récente et détaillée de l'existant, des écarts et de la suite recommandée (untracked, à lire en priorité).
3. `docs/certification/` + `docs/reports/` + `docs/reviews/` : constats d'audit datés, avec limitations.
4. Corpus fondateur (PRD, CDC, architecture, backlog) : **autorité sur le périmètre exigé**, pas sur l'état d'implémentation.
5. `README.md` et `docs/backlog/ROADMAP_V1.md` : **en retard** (README statut 2026-10-23 ; roadmap affirme encore que le dépôt ne contient aucune application). Ne pas les utiliser pour conclure sur l'avancement.

Conflit entre documents ⇒ s'arrêter, signaler le conflit, ne pas arbitrer silencieusement (AGENTS.md).

## Carte du dépôt

| Chemin | Rôle |
|---|---|
| `apps/api` | API Fastify 5 : routes, auth/session, composition (`apps/api/src/application/container.ts`), adaptateurs infra (Prisma, storage local/S3, média, Postiz mock, durable/Hatchet), worker (`src/worker`) |
| `apps/web` | Next 16.4.2 / React 19 : Studio V1 et interface `/admin` (super_admin) |
| `packages/domain` | Domain Core pur (20 fichiers TS, aucune dépendance) : identités, contextes, briefs, scènes, personnages, artefacts, approbations, transferts, capacités |
| `packages/application` | Ports + cas d'usage (17 fichiers), RBAC/budgets/idempotence/snapshots au niveau application |
| `packages/contracts` | Schémas Zod partagés web/serveur |
| `packages/db` | Prisma 6.19.3, schéma, 12 migrations, seed |
| `packages/media` | Rendu Sharp + assemblage FFmpeg |
| `tests/` | Vitest : `domain/` (11 fichiers, sans infra), `api.test.ts`, `media.test.ts`, `v1/` (10 fichiers : sécurité, durable, stockage, admin, certification) |
| `e2e/` | Playwright : `v0.spec.ts` (verticale Studio) et `admin.spec.ts` (RBAC admin) |
| `scripts/` | Gates PowerShell (secrets, frontières, migrations, docs, fichiers suivis, CI locale `ci.ps1`) + scripts préprod |
| `docs/` | Corpus fondateur VERBATIM, ADR (`docs/adr`), backlog/roadmap, certification, exécution, rapports, runbooks |
| `infra/` | Compose/Dockerfiles préprod et Coolify ; modèles d'env sans secrets |
| `.v0/`, `.v1/`, `data/`, `test-results/` | Runtime local et artefacts, **ignorés par Git** — ne pas versionner, ne pas citer comme preuve commitée |
| `_inbox/` | Fichiers locaux non publiés, ignorés par Git |

## Ce qui est réel, MOCK ou absent (constat 2026-11-04)

- **Réel et testé localement** : invitations/sessions/CSRF/RBAC/IDOR, contextes, projets, briefs versionnés, storyboard déterministe 5 scènes, rendu PNG 1080×1920 + master MP4, QA technique, correction ciblée par Scene ID, versions/checksums, approbation exacte, transfert Postiz **MOCK**, admin, audit, outbox/durable (reprise applicative), stockage local/S3 (S3 local validé, production non certifiée).
- **MOCK / partiel** : fournisseurs IA (adaptateur déterministe, `mock: true`), Postiz, coûts, conversation assistant (réponses programmées), orchestration Hatchet complète (runtime non certifié), QA de marque/licences.
- **Absent** : MCP, audio/voix/musique/mix, actifs de marque utilisables, campagnes, formats avancés réels (carrousel/motion/Reel dédiés), uploads, fournisseurs réels.
- Ne jamais présenter un rendu déterministe/MOCK comme une génération IA, ni un transfert MOCK comme une publication.

## Vocabulaire et identifiants

- Produit : **Vululu AI** ; nom technique `vululu-ai` ; dépôt `vululu.v1`. Docs en français, identifiants de code en anglais, dates ISO 8601.
- Exigences : `PRD-xx`, `CDC-F-xxx` (fonctionnel), `CDC-N-xxx` (non fonctionnel), épics `E00-xx`.
- Décisions : `ADR-NNNN` (`docs/adr/`) ; décisions ouvertes `D-xx` (rapport d'inauguration) ; lots historiques `V1-00`, `V1-01-A..H`, puis P0-0/P0-A..F (roadmap) — la correspondance n'est pas triviale, vérifier dans `git log` et les rapports.
- Défauts : `D-07-xx`, `P1-xx` (registre de dette / certification).

## Procédure de démarrage recommandée

1. Lire `AGENTS.md` puis ce skill ; charger ensuite les skills utiles à la mission.
2. `git status --short` + `git log --oneline -10` : repérer HEAD, travaux locaux, dernier lot.
3. Lire `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` (état réel, écarts, priorités).
4. Identifier l'exigence PRD/CDC et le verdict de preuve existant avant d'écrire du code.
5. Vérifier la frontière V1/V2 et les conditions d'arrêt d'AGENTS.md avant toute action coûteuse.

## Pièges connus

- **README/roadmap périmés** : ne pas conclure "pas d'application" ni "V1 non commencée".
- **Deux chemins d'exécution** : `LocalProductionExecutor` (défaut, en process, pas durable) vs Hatchet (`ORCHESTRATOR_MODE=hatchet`, worker séparé). Ne pas présenter le mode local comme durable après crash.
- **Index ADR incomplet** : 0001–0015 existent, `docs/adr/README.md` s'arrête en pratique à 0013. Vérifier le dossier, pas l'index seul.
- **Gates documentaires en échec connu** : `verify-foundation-docs.ps1` et `check-tracked-files.ps1` refusent `infra/coolify/.env.coolify.example` (nommage) ; `check-secrets.ps1` passe en mode arbre mais échoue en mode `-History` sur le placeholder `SESSION_SECRET` du même fichier (6 détections). Ce n'est pas une fuite de secret ; ne pas contourner en supprimant le fichier. La CI distante, jamais exécutée, serait rouge sur ces étapes.
- **Rapport d'analyse untracked** : présent localement mais non commité ; il ne fait pas partie de l'historique distant.
- **V0 comme référence** : le prototype V0 a servi de référence fonctionnelle, mais la V1 a été reconstruite ; ne pas réintroduire du code V0 couplé.
- **Aucune action externe sans GO humain** : push, merge, déploiement, publication Postiz, compte externe, dépense fournisseur.

## Checklist avant de proposer un plan

- [ ] HEAD, branche et arbre connus.
- [ ] Exigence PRD/CDC et preuve existante identifiées.
- [ ] Frontière V1/V2 respectée ; aucune fonctionnalité V2 introduite.
- [ ] Contradictions documentaires signalées, pas arbitrées.
- [ ] Skills complémentaires chargés selon la mission.

## Références

- `AGENTS.md` — règles absolues, autorité documentaire, méthode par lot.
- `docs/README.md` — index, provenance, règles d'intégrité.
- `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` — état réel et suite recommandée.
- `docs/certification/V1_FINAL_CERTIFICATION.md`, `docs/reports/VULULU_STAGING_ACCEPTANCE.md`.
- `docs/adr/README.md`, `docs/backlog/ROADMAP_V1.md` (à lire avec recul).
- Skills liés : `vululu-local-stack`, `vululu-quality-gates`, `vululu-architecture-change`, `vululu-ops-readiness`, `vululu-lot-delivery`.
