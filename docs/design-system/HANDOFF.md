# Livraison du kit — 2026-11-05

Version 1.0.0. Source de projet : codex/v1-demo-coolify au commit 391e11f6e0e9fb610200e34ba97e1c2aaaa6b152.
Cible : fichiers de cadrage pour l'IDE, pas une refonte déployée.

## Livré

20 fichiers : point d'entrée DESIGN.md, consignes frontend/IDE, charte, UX, composants, écrans, langage, accessibilité, plan d'intégration, prompt, décisions, tokens JSON/CSS, plan SVG et son index, contrôle statique et ce rapport.
Aucun fichier métier existant réécrit ; aucun import ajouté à apps/web/app/layout.tsx ou globals.css.
Aucune dépendance, clé, donnée réelle, migration, déploiement, publication sociale ou appel IA payant.

## Vérifications

- PASS : lecture de la stack frontend et des composants existants via GitHub.
- PASS : validation statique en mémoire des 20 sources par validateKit, même fonction que scripts/check.mjs.
- PASS : JSON, 57 tokens synchronisés en CSS, références de variables, liens internes et points d'entrée IDE.
- PASS : 13 couples de contrastes calculés ; cela ne vaut pas audit d'écran.
- PASS : contrôle négatif en mémoire : une dérive volontaire de la couleur d'action est détectée.
- PASS : relecture statique des ajouts et contrôle de whitespace sur les contenus préparés.
- NOT_RUN : commande Node en environnement de fichiers, PowerShell check-secrets/verify-foundation-docs, git diff --check en terminal.
- NOT_RUN : lint, typecheck, build, tests applicatifs et navigateur. Aucun runtime applicatif n'est modifié par le kit.
- NOT_RUN : validation visuelle du SVG dans un navigateur et activation réelle des règles dans chaque IDE.

Le terminal n'est pas disponible dans cette session. Les PASS ci-dessus sont des contrôles de contenu, pas des exécutions de commande locale.
Les contrôles du dépôt doivent être exécutés dans l'IDE avant intégration applicative ou certification d'un lot.
Aucun GO production ni conformité WCAG globale ne découle de ce kit.

## Limites explicites

Le PNG choisi est référencé par son lien propriétaire, pas copié dans le dépôt ; l'IDE dispose du plan SVG et des contrats textuels.
Les fichiers DM Sans ne sont pas embarqués ; fallback système fourni.
Les composants sont spécifiés, pas une bibliothèque React nouvelle ni des contrôles branchés aux API.
Les champs et états des maquettes restent subordonnés aux capacités réelles.
Les mesures responsive et tests d'usage sont des critères à vérifier, pas des résultats acquis.

## Usage

1. Récupérer le commit du kit sur le checkout de travail autorisé.
2. Lire DESIGN.md et donner IDE_PROMPT.md à l'IA.
3. Appliquer une seule tranche cohérente au Studio selon IMPLEMENTATION.md.
4. Vérifier localement le contrôle Node puis la route, les tests et les scans pertinents.

Rollback du kit : revert du commit de livraison. Il n'exige aucune action sur les données.
