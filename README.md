# Vululu AI

**Studio de création et de marketing assisté par l'IA pour les entrepreneurs.**

Vululu accompagne un entrepreneur non designer de l'objectif à la publication : il précise l'intention, le canal et le format, réunit les assets de l'utilisateur, brainstorme avec lui, propose des directions artistiques, laisse un choix humain, produit une création éditable et versionnée, la fait relire et approuver, puis l'exporte ou la programme — et suit les résultats.

> **Statut — 2026-11-20.** L'application est construite et fonctionne en **bêta gratuite** : aucun paiement client, commerce gelé, fournisseurs payants non activés. Les lots C02–C13, F01–F07 et BETA01 sont livrés ; la campagne de complétion P00–P13 est en cours et ses lots restent `BUILD_UNVERIFIED` jusqu'à la vérification finale (P12–P13). **Aucun déploiement public, aucune publication réelle, aucune certification.** L'état courant fait foi dans [l'inventaire des fonctionnalités](docs/implementation/VULULU_FEATURE_INVENTORY.md) ; les règles de la campagne sont dans le [contrat de finition](docs/implementation/VULULU_FINISH_CONTRACT.md).

## Parcours produit

```text
Objectif → Canal → Format → Assets utilisateur → Brainstorming IA
→ Directions artistiques → Choix humain → Création éditable
→ Revue → Approbation → Export / Publication → Résultats
```

- **Les assets de l'utilisateur sont disponibles avant le brainstorming principal** : l'IA ne propose pas d'angles sans savoir quelles photos, quel logo, quelles couleurs et quelles offres sont autorisés.
- **L'IA simplifie l'expérience, elle ne multiplie pas les écrans.** L'interface propose des choix concrets ; les paramètres techniques restent accessibles sans être imposés.
- **Tout reste un brouillon éditable et versionné** jusqu'à l'approbation d'une version exacte (version + checksum). Rien n'est téléchargé, payé ou publié par simple proposition.
- **Le contrôle humain est réel** : choisir, corriger, refuser, comparer, approuver.

## Ce qui est construit aujourd'hui

Statuts de présence de code, **pas** des certifications (aucun test complet exécuté pendant P00–P11). Détail et preuves fichier par fichier : [inventaire](docs/implementation/VULULU_FEATURE_INVENTORY.md).

| Domaine | État |
|---|---|
| Comptes clients (inscription vérifiée, session, mot de passe, RGPD), RBAC et isolation propriétaire | IMPLEMENTED |
| Profils d'activité, offres confirmées, contextes de marque versionnés | IMPLEMENTED / PARTIAL (offres = référentiel de nom) |
| Campagnes et projets, briefs versionnés, plan marketing | IMPLEMENTED / PARTIAL |
| Bibliothèque d'assets : upload borné, inspection, versions, droits, sélection | IMPLEMENTED |
| Studio : compositions natives, révisions append-only, rendu Sharp/FFmpeg, rendu durable en file | IMPLEMENTED (édition multiscène = pipeline historique démo) |
| Formats Post / Story / Carrousel / Reel / Vidéo, export et téléchargement | IMPLEMENTED |
| Calendrier éditorial, variantes par plateforme, approbation éditoriale | IMPLEMENTED |
| Revue, approbation d'une version exacte, audit, résultats/exports, assistance, admin, observabilité | IMPLEMENTED |
| Bêta gratuite : gel commercial serveur, accès sans pass, retours bêta typés | IMPLEMENTED |

## Ce qui dépend d'un fournisseur (flags désactivés, appels réels NON VÉRIFIÉS)

Assistant Vertex (`ASSISTANT_VERTEX_ENABLED`, repli local déterministe), génération image Replicate et vidéo Runway (`MEDIA_GENERATION_ENABLED`), publication Postiz (`POSTIZ_PUBLISH_ENABLED`), facturation Stripe (`BILLING_STRIPE_MODE`, gelée par la bêta), e-mails de compte (Resend). **Aucun n'est activé** et aucun appel réel n'est prouvé ; l'activation exige une autorisation humaine explicite, un budget et les procédures des livraisons F03/F04/F05.

## Ce qui est absent à ce stade

Serveur MCP, TTS/voix/audio/mixage, motion design, propositions de directions artistiques comme objet de première classe, édition avancée de vidéo/audio importés, MFA, analytique leads/ventes. Un pipeline historique MOCK reste présent à côté des fournisseurs réels (transfert Postiz mock, registre de capacités déterministe) : ne jamais le présenter comme opérationnel.

## Stack et architecture

Next.js 16 / React 19 (web), Fastify 5 (API), TypeScript, PostgreSQL + Prisma 6.19.3, Hatchet (orchestration durable optionnelle), Sharp + FFmpeg (média), Postiz (publication externe), stockage local ou S3-compatible. Monolithe modulaire : Domain Core pur → Application (cas d'usage, RBAC, budgets, idempotence) → Infrastructure (adaptateurs derrière ports) → API/Web. PostgreSQL source de vérité, artefacts immuables versionnés, approbation d'une version exacte avant tout effet externe. Aucune CI externe n'est requise : la vérité de preuve est locale.

## Structure du dépôt

```text
apps/api            API Fastify : 22 fichiers de routes, auth/session/CSRF, container, worker
apps/web            Next 16 : 32 pages (accueil, comptes, projets, calendrier, créations, résultats, admin), Studio
packages/domain     Domain Core pur (23 fichiers, zéro dépendance runtime)
packages/application Ports + 20 cas d'usage (30 fichiers)
packages/contracts  Schémas Zod partagés web/API
packages/db         Prisma : schéma (66 modèles), 34 migrations, seed
packages/media      Composition Sharp, texte, assets, assemblage FFmpeg
tests/              85 fichiers Vitest (domaine, API, V1, média, sécurité, bêta)
e2e/                26 specs Playwright
scripts/            Gates PowerShell, scripts préprod/arena
docs/               Corpus fondateur VERBATIM, ADR 0001–0034, delivery/, product/, implementation/
infra/              Compose/Dockerfiles préprod et Coolify, modèles d'env sans secrets
```

## Démarrage local

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate          # base locale 127.0.0.1:55432/vululu_v1_00
pnpm db:seed             # exige V1_BOOTSTRAP_EMAIL / V1_BOOTSTRAP_PASSWORD
pnpm dev                 # API 3101 + Web 3100
```

Vérifier `GET http://127.0.0.1:3101/api/health`. La pile locale, les variables réellement lues et les pièges Windows/WSL sont documentés dans le skill `vululu-local-stack` et `docs/execution/`. Ne jamais viser une base non locale, ne jamais afficher de secret.

## Documentation

- [Index documentaire](docs/README.md) — provenance, intégrité, index complet.
- [PRD V1.2](docs/01_PRD_V1.md) · [Cahier des charges V1.2](docs/02_CAHIER_DES_CHARGES_V1.md) · [Architecture V1](docs/03_ARCHITECTURE_V1.md) · [Backlog](docs/11_BACKLOG.md) — corpus fondateur **VERBATIM**.
- [Vision d'expérience](docs/product/VULULU_EXPERIENCE_VISION_2026-11-20.md) — promesse produit et séquence (révisée P00 : assets avant brainstorming).
- [Contrat de finition](docs/implementation/VULULU_FINISH_CONTRACT.md) · [Inventaire](docs/implementation/VULULU_FEATURE_INVENTORY.md) · [Carte P01–P11](docs/implementation/VULULU_COMPLETION_PLAN.md) — campagne en cours.
- [ADR](docs/adr/README.md) · [Livraisons](docs/delivery/) — décisions et preuves datées.

## Sécurité

Aucun secret dans le dépôt ni dans les sorties ; secrets côté serveur uniquement ; RBAC et isolation par propriétaire vérifiés côté serveur ; validation des entrées, uploads bornés, protection SSRF ; audit et traçabilité des effets externes. Un fichier `.env` local n'est jamais versionné. Voir [AGENTS.md](AGENTS.md) §9.

## Gouvernance

Un lot = un périmètre + des preuves honnêtes + un commit réversible. En campagne P00–P11 : un commit par lot, statut `BUILD_UNVERIFIED`, aucune suite complète exécutée ; la vérification (P12) et la décision de sortie (P13) sont séparées et exigent des preuves rejouées. Aucun `PASS`, aucun déploiement, aucune publication sans autorisation explicite. Voir [AGENTS.md](AGENTS.md) et le [contrat de finition](docs/implementation/VULULU_FINISH_CONTRACT.md).

## Licence

Aucune licence n'est définie à ce stade (décision ouverte D-09). Le dépôt est public mais tous les droits sont réservés par défaut ; ne pas réutiliser, distribuer ou exploiter le contenu sans accord écrit du porteur du projet.

## Dépôt

https://github.com/tachfineamnay/vululu.v1
