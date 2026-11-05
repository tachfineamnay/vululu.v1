# MVP — Exploitation de la recette Coolify

Date : 2026-11-05. Cible qualifiée : `infra/coolify/docker-compose.recette.yml`, branche `codex/v1-demo-coolify`, commit applicatif `f170d95`. Le Compose historique `docker-compose.yml` n’est pas la configuration qualifiée par ce guide.

## Configuration

Dans un projet Coolify séparé, créer une application Git Docker Compose. Base Directory : `/` ; Docker Compose Location : `/infra/coolify/docker-compose.recette.yml`. Le contexte `build.context: .` est relatif au répertoire de projet Coolify. Affecter le domaine HTTPS au service **web**, port interne **3100**. Aucun port hôte PostgreSQL/API.

| Variable | Réglage |
|---|---|
| APP_ORIGIN, WEB_ORIGIN | Même URL HTTPS, sans port, chemin ni slash final |
| DEMO_MODE | 1 |
| ORCHESTRATOR_MODE | local |
| ARTIFACT_STORAGE_BACKEND | local |
| VULULU_IMAGE_TAG | Commit construit ; conserver le même identifiant pour les services. Il nomme l'image, il ne sélectionne pas le commit : Coolify importe la tête de branche et reconstruit |
| RECETTE_ALLOW_SHORT_PASSWORDS | `1` si les valeurs demo/admin font moins de 12 caractères (ADR 0028), sinon `0` ; absent, `demo-seed` refuse le démarrage |
| RECETTE_RESET_PASSWORDS | `1` le temps d'une seule synchronisation des deux comptes, puis `0` |
| DEMO_EMAIL | demo@vululu.example par défaut |
| ADMIN_EMAIL | admin@vululu.example par défaut |

Charger le Compose dans Coolify avant le premier build. Coolify génère cinq secrets : `SERVICE_PASSWORD_64_POSTGRES`, `SERVICE_HEX_64_SESSION`, `SERVICE_REALBASE64_32_CREDENTIALS`, `SERVICE_PASSWORD_64_DEMO` et `SERVICE_PASSWORD_64_ADMIN`. Tous doivent être **runtime uniquement** (`is_buildtime=false`, `is_runtime=true`). Garder le masquage de toutes les valeurs d’environnement dans les logs activée. Ne saisir aucune valeur dans Git, un argument de build, le service Web ou une variable NEXT_PUBLIC.

Les secrets PostgreSQL, session et chiffrement restent stables entre les déploiements. Le Compose mappe le secret de chiffrement vers `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` dans l’API ; il contient 32 octets aléatoires en base64. Prévoir sa conservation séparée et sécurisée avec l’opérateur : sa perte rend les credentials illisibles. Ne pas le remplacer sans migration.

Le mécanisme de génération et le routage par port interne sont décrits dans la [documentation officielle Coolify](https://coolify.io/docs/applications/builds/docker-compose). Hors Coolify, les variables générées doivent déjà être fournies et la commande doit inclure `--project-directory .`.

## Démarrage et comptes

Le démarrage exécute les migrations et initialise les droits du volume média, puis amorce séparément les comptes admin et démo avant l’API/Web. Les amorçages sont idempotents : aucun mot de passe existant n’est remplacé et aucun compte ordinaire n’est promu. L’API contient OpenSSL, FFmpeg/FFprobe et les polices nécessaires. Ne pas activer Hatchet/S3 pour cette recette.

La remise des mots de passe initiaux à l’opérateur reste une étape distincte. Après accord explicite, la remise en cours utilise une visibilité temporaire dans Coolify ; les deux valeurs seront remasquées après confirmation de récupération. Une modification de la variable de bootstrap seule ne réinitialise pas un compte existant.

Après connexion admin : **Fournisseurs → Clés API IA**. Ajouter un fournisseur au catalogue si nécessaire puis enregistrer sa clé. L’état attendu est « enregistrée, connexion non testée ». Le compte démo est ordinaire et la démo fonctionne sans clé IA. Aucun appel fournisseur n’est déclenché par l’enregistrement.

## Vérifications et maintenance

Dans le terminal API Coolify, exécuter sans afficher les variables :

```sh
node_modules/.bin/prisma migrate status --schema packages/db/prisma/schema.prisma
node_modules/.bin/tsx scripts/coolify/check-env.ts --require-credentials
node_modules/.bin/tsx scripts/coolify/verify-media.ts --require-credentials
```

Le dernier contrôle exige un média produit et un credential présent ; il lit les fichiers, FFprobe, les checksums et le secret chiffré puis authentifie le compte démo pour lire un master via l’API. Il ne restitue aucun secret.

Les trois tâches de recette sont désactivées : contrôle environnement/médias, restauration DB isolée et restauration média. Les tâches de restauration sont des preuves ponctuelles avec garde contre l’écrasement, pas un système de sauvegarde récurrent.

Avant mise à jour ou sauvegarde, arrêter les nouveaux lancements et attendre la fin des productions. Conserver PostgreSQL et le volume `artifacts`. Sauvegarder la base (`pg_dump -Fc`) et archiver les médias, puis stocker une copie chiffrée hors du VPS et la clé de chiffrement séparément. Restaurer sur une nouvelle base et un nouveau volume/répertoire, jamais par écrasement de la source. Vérifier un master via l’API restaurée et le déchiffrement sans afficher de valeur.

Les preuves de recette ont utilisé une base isolée `mvp_restore` et une archive média extraite dans un autre répertoire. Les fichiers sous `/tmp` ne sont pas une rétention durable et peuvent disparaître lors d’une recréation de conteneur. La sauvegarde hors serveur reste à configurer.

En cas de crash pendant une production locale, diagnostiquer le run avant toute relance. `scripts/runtime-reconcile.ts` est en lecture seule par défaut ; `--apply` concerne le moteur durable, pas une reprise locale. La reprise automatique d’un run interrompu n’est pas qualifiée.

Rollback : rétablir le commit/image précédent après arrêt des productions, conserver les volumes et migrations additives. Aucun `down -v`, reset de base ou migration inverse. Une ancienne image peut ignorer les credentials et les nouveaux audits : rétablir le candidat corrigé avant de modifier ces fonctions.

Les résultats exécutés, l’URL et les limites figurent dans [MVP_COOLIFY_ACCEPTANCE.md](MVP_COOLIFY_ACCEPTANCE.md). MCP, IA réelle, Postiz réel, formats supplémentaires et mix audio suivent ce MVP. Le choix des échantillons de voix sous licence libre est conservé.

## Synchroniser les mots de passe de recette

Sur instruction explicite utilisateur (ADR 0028), `RECETTE_ALLOW_SHORT_PASSWORDS=1` autorise des valeurs non vides de 72 octets maximum pour cette recette. Le minimum de 12 caractères reste le défaut des autres amorçages démo. Après modification des deux variables Coolify, activer `RECETTE_RESET_PASSWORDS=1` et déployer le candidat qui contient le service ponctuel `recette-password-reset`. Il vérifie les deux identités, met à jour uniquement leurs hash et révoque leurs sessions. Après succès et vérification des connexions, remettre le drapeau à 0 et remasquer les deux variables. Aucun secret dans les commandes, les logs ou le rapport.

## Dépannage : `service "demo-seed" didn't complete successfully: exit 1`

Le démarrage échoue avant l'API lorsque l'amorçage démo refuse sa configuration : `migrate` passe, `admin-seed` passe, puis `demo-seed` sort en code 1 et Coolify interrompt le déploiement. Le journal du service `demo-seed` (Coolify → Logs) donne la cause ; le code seul ne suffit pas à corriger la configuration.

| Ligne du journal | Cause | Correction |
|---|---|---|
| `DEMO_BOOTSTRAP_FAIL: demo_mode_required` | `DEMO_MODE` absent ou différent de `1` | Définir `DEMO_MODE=1` sur la ressource, puis redéployer |
| `DEMO_BOOTSTRAP_HINT: DEMO_PASSWORD est vide` | `SERVICE_PASSWORD_64_DEMO` non générée ou variable remplacée par une valeur vide | Régénérer la variable runtime, puis redéployer |
| `DEMO_BOOTSTRAP_HINT: DEMO_PASSWORD est plus court que le minimum de 12` | Mot de passe court sans exception de recette (ADR 0028) | Définir `RECETTE_ALLOW_SHORT_PASSWORDS=1`, puis redéployer |
| `DEMO_BOOTSTRAP_FAIL: demo_account_collision` / `demo_resource_collision` | Un compte ou un exemple appartient déjà à une autre identité | Ne pas forcer ; inspecter la base, aucune donnée n'a été écrite |
| `DEMO_BOOTSTRAP_HINT: Echec inattendu` | PostgreSQL, `DATABASE_URL` ou migration | Vérifier `db` (saine) et `migrate` (exit 0) avant de rejouer |

Le diagnostic n'imprime que des noms de variables, des règles et des longueurs : jamais une valeur, un hash ou un secret. Un déploiement refusé n'écrit rien : `bootstrapDemo` valide avant toute transaction.

Ordre attendu d'un redéploiement qui change les mots de passe : `db` saine → `migrate` exit 0 → `artifacts-init` → `demo-seed` et `admin-seed` exit 0 → `recette-password-reset` exit 0 → `api` saine → `web` saine.
