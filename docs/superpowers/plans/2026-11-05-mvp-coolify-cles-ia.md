# MVP Coolify — Implementation Plan

> Exécution dans ce chat, par petites étapes et sans sous-agents. Les sous-compétences `superpowers:executing-plans` et `superpowers:subagent-driven-development` ne sont pas disponibles ; aucune délégation implicite. Chaque case exige une preuve avant validation.

**Goal:** livrer rapidement un MVP interne installable sur Coolify, avec compte démo, parcours vidéo et ajout sécurisé des clés API IA.

**Architecture:** conserver l’application existante, PostgreSQL, les ports et adaptateurs. La démo reste autonome sans clé ; enregistrer une clé ne déclenche aucun appel IA. Le transport MCP vient après le MVP.

**Tech Stack:** Node 24, pnpm 10.6.1, Next.js, Fastify, Prisma/PostgreSQL, Sharp/FFmpeg, Docker Compose/Coolify ; chiffrement avec `node:crypto`, sans nouveau service externe.

**Spec:** instructions utilisateur du 2026-11-05 : « MVP et v1 deployable », « mcp à laisser pour après », ajout des clés IA requis, Product Design, rapidité et économie de tokens. Révision explicite du plan du 2026-11-04 ; PRD/CDC importés et ADR acceptés restent inchangés.

## Contraintes globales

- V1 interne ; compte démo ordinaire et super-admin séparé ; aucune fonctionnalité V2.
- Domain Core pur ; cas d’usage applicatifs communs, RBAC serveur et isolation conservés.
- Snapshots, Scene ID, versions immuables, checksums, QA et approbation exacte conservés.
- Clés absentes de Git, réponses API, bundle Web, logs, snapshots, stockage navigateur et rapports. Une saisie transitoire dans le formulaire HTTPS est nécessaire à leur envoi au serveur.
- Aucun appel IA payant, publication ou déploiement distant déclenché par ce plan. L’utilisateur déploie sur son serveur.
- Tests ciblés à chaque changement ; régression commune une fois au jalon. PASS, MOCK et NOT_RUN restent distincts.

## 1. Périmètre de sortie

| Inclus dans le MVP | Après le MVP |
|---|---|
| Connexion, bootstrap démo et données fictives utiles | MCP authentifié |
| Contexte, brief confirmé, storyboard, plan et plafond MOCK | Qualification de fournisseurs IA réels et leurs tarifs |
| Vidéo, prévisualisation, téléchargement, correction et historique | Formats supplémentaires et mix audio complet, avec les échantillons de voix libres déjà choisis |
| QA et approbation exacte ; Postiz explicitement MOCK | Postiz réel, sans publication automatique |
| Ajout, remplacement et suppression des clés IA dans l’admin | Refonte visuelle globale et fonctions avancées |
| Packaging, persistance, recette Linux et sauvegarde minimale | Qualification complète Hatchet/S3 et exploitation avancée |

Les capacités déjà présentes sont conservées. Cette variante MVP ne constitue pas une certification de tous les parcours de la V1 complète. L’hypothèse de lancement est une instance unique avec PostgreSQL et volume média persistant, déjà prévue par le Compose ; la décision et ses limites de reprise doivent être consignées dans un nouvel ADR avant release. Aucune promesse de reprise automatique n’est déduite du mode local.

## 2. Cadrage Product Design

Parcours retenu : **admin → Fournisseurs → ajouter une clé → enregistrer → voir « Clé enregistrée, connexion non testée »**. Actions suivantes : remplacer ou supprimer. Le compte démo n’accède pas à ces actions et continue à fonctionner sans clé.

Réutiliser `apps/web/app/admin/fournisseurs/page.tsx`, `components/admin/Fields.tsx`, les états de chargement/erreur et les styles existants. Champ mot de passe, libellé explicite, envoi désactivé pendant sauvegarde, confirmation de remplacement/suppression, erreur compréhensible et saisie effacée après succès. Aucun bouton « connecté » fondé uniquement sur l’enregistrement ; aucun test réseau implicite. Vérifier clavier et largeur 390 px.

Cadrage réalisé avec les workflows **Product Design / index, user-context, get-context**. Préflight Python indisponible ; aucun contexte enregistré trouvé. Le code existant sert de référence. Aucun audit visuel ni prototype n’est revendiqué par ce document.

## 3. Ordre d’exécution

### Étape 1 — Stabiliser le candidat existant

**Fichiers :** `packages/media/src/{index,sceneComposition,textLayout}.ts`, `packages/application/src/ports.ts`, `use-cases/durableProduction.ts`, adaptateurs `apps/api/src/infrastructure/{prisma,production,durable}/`, tests `responsive-layout`, `brief-profile` et E2E existants.

- [x] Terminer le lot 7A commencé : figer la version de composition, conserver l’audit de texte dans SceneVersion.manifest et le reprendre lors d’une correction.
- [x] Vérifier texte long, dépassement refusé, snapshot figé et QA PASS après correction ; conserver les anciennes versions lisibles.
- [x] Rejouer la verticale navigateur vidéo/correction/approbation, pertinente pour ce changement. Les trois parcours communs seront rejoués au jalon final pour éviter les répétitions.
- [x] Enregistrer un commit local réversible après contrôles. Aucun nouveau format dans cette étape.

**Livrable :** parcours vidéo stable, sans travail partiellement raccordé dans le candidat.

### Étape 2 — Ajouter les clés API IA, obligatoire pour le MVP

**Créer :** cas d’usage `packages/application/src/use-cases/provider-credentials.ts`, ports de stockage/chiffrement, `apps/api/src/infrastructure/security/providerCredentialCipher.ts`, adaptateur Prisma, `apps/web/components/admin/ProviderCredentialForm.tsx`, tests `tests/v1/provider-credentials.test.ts` et `e2e/provider-credentials.spec.ts`.

**Modifier :** schéma Prisma et nouvelle migration additive, `packages/contracts/src/index.ts`, conteneur applicatif, `apps/api/src/routes/adminAgents.ts`, DTO administrateur et page Fournisseurs.

**Contrat :**

```text
PUT    /api/admin/providers/:key/credentials   { apiKey: string }
DELETE /api/admin/providers/:key/credentials
GET    /api/admin/providers                   ajoute credentials: { configured, updatedAt }
```

- [x] Écrire les tests de refus user/démo, CSRF, entrée vide/trop longue, enregistrement, remplacement, suppression et absence de restitution du secret ; observer leur échec.
- [x] Stocker une seule clé chiffrée par fournisseur enregistré : AES-256-GCM, nonce aléatoire, authentification liée au fournisseur. La clé maîtresse de 32 octets est injectée côté serveur via `PROVIDER_CREDENTIALS_ENCRYPTION_KEY`, jamais stockée avec le ciphertext.
- [x] Si le chiffrement est absent : démo disponible, écriture de credentials refusée clairement. Aucun fallback en clair. Déchiffrement réservé aux futurs adaptateurs serveur ; rotation du secret fournisseur par remplacement.
- [x] Ajouter le formulaire existant selon le parcours Product Design ; audits limités à acteur, fournisseur, action et date.
- [x] Prouver que DB et réponses ne contiennent pas la clé en clair, qu’un ciphertext altéré est refusé et que l’enregistrement ne contacte aucun fournisseur. Tests avec fixtures synthétiques seulement.

**Livrable :** l’admin peut gérer ses clés ; aucune clé réelle à communiquer dans le chat. Un appel IA réel reste une étape séparée, avec fournisseur et budget autorisés.

### Étape 3 — Préparer le paquet Coolify

**Fichiers :** `infra/coolify/Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`, exemple de variables, `scripts/coolify/{check-env.ts,seed-demo.ts}` et nouveau guide `docs/releases/MVP_COOLIFY_RUNBOOK.md`.

- [x] Vérifier les dépendances natives Linux et polices nécessaires au rendu ; supprimer les dépendances à un chemin Windows dans la cible.
- [x] Injecter la variable de chiffrement uniquement côté API ; ne pas la transmettre au Web ni au build. Vérifier migrations, healthchecks, HTTPS, ports privés et volumes persistants.
- [x] Documenter bootstrap admin puis démo, démarrage sans clé IA, sauvegarde PostgreSQL + médias et restauration sur cible isolée ; inclure la conservation sécurisée de la clé de chiffrement et la réconciliation des runs interrompus.
- [x] Construire et tester sur Linux : installation vierge, mise à jour conservant les données, redémarrage, médias/Range et restauration. Docker local a ensuite échoué ; la recette Linux complète a été exécutée sur le serveur Coolify autorisé.

**Livrable :** un guide court et un candidat identifié par commit, installable sur le serveur de l’utilisateur. Déploiement de recette explicitement autorisé ensuite.

### Étape 4 — Recette et première livraison

- [x] Exécuter typage, lint strict, contrôles secrets/frontières/documents, migrations et tests concernés.
- [x] Exécuter les E2E sur le build de production : connexion démo, projet → vidéo → correction → QA → approbation, gestion des clés admin et refus du compte démo.
- [x] Vérifier la cible HTTPS après déploiement autorisé, la persistance après redémarrage et la restauration ; consigner résultat, commit, limites et rollback dans `docs/releases/MVP_COOLIFY_ACCEPTANCE.md`.
- [ ] Livrer ce MVP, puis choisir une seule amélioration suivante à partir des retours d’usage.

**Commandes locales communes :**

```powershell
pnpm typecheck
$env:LINT_STRICT='1'; pnpm lint
pnpm build
pwsh -NoProfile -File scripts/check-secrets.ps1
pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1
pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
git diff --check
```

Les tests de credentials seront lancés avec Vitest sur une DB de recette ; les E2E utiliseront `playwright.external.config.ts` et une URL explicitement configurée, sans credentials imprimés. Les commandes Docker exactes seront figées dans le runbook après validation du Compose final.

## 4. État au recadrage et méthode

Dernier candidat committé : `ef3ef15`. Régression complète antérieure : 364 PASS / 2 S3 SKIP ; dernier lot : 99 PASS / 2 S3 SKIP ciblés et 3 E2E PASS. Ces preuves ne certifient pas Coolify ni la gestion des clés, encore à implémenter.

État initial du travail 7A : 10 tests média PASS et contrôle de snapshot en échec. Mise à jour : raccordement corrigé, 30 tests PASS / 2 S3 SKIP, typage PASS et verticale navigateur PASS ; preuves dans `docs/execution/MVP_01_LAYOUT.md`. Le répertoire `.dsh/` reste hors intervention.

Une étape, un résultat utilisable, un rapport bref : **changement, preuve, limite, suite**. Réutiliser les composants ; ne pas refaire l’application, générer plusieurs directions visuelles ou répéter une suite complète sans modification qui le justifie. Aucun déploiement automatique. MCP ne bloque pas le MVP ; les clés IA le bloquent tant que l’étape 2 ne passe pas.

## 5. État de livraison — 2026-11-05

Candidat `f170d95` publié sur la branche dédiée et épinglé dans Coolify. Application saine : https://vululu-recette.148.230.113.74.sslip.io . Quatre parcours fonctionnels validés ; clavier et 390 px validés ; HTTP 206/416, 19 migrations, redémarrage, restauration isolée et redéploiement vérifiés. Après redéploiement : 7 masters, 23 scènes et 1 credential, checksums valides. Le dernier rejeu clavier ajoute une seconde fixture de credential synthétique.

L’utilisateur a autorisé le déploiement puis la visibilité temporaire des mots de passe démo/admin dans Coolify. Remise des accès en cours ; remasquage après confirmation. Les secrets PostgreSQL, session et chiffrement restent masqués, tous sont réservés au runtime. Aucun secret dans Git ou le rapport.

Preuves et limites : `docs/releases/MVP_COOLIFY_ACCEPTANCE.md`. Prochaine amélioration proposée après livraison : voix de démonstration avec les échantillons libres déjà choisis. MCP reste après le MVP. Ce jalon ne certifie pas toute la V1 historique.
