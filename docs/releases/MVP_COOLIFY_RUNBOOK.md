# MVP — Installation Coolify et exploitation

Date : 2026-11-05. Périmètre : compte démo, vidéo, correction/QA/approbation, clés IA administrables. MCP, fournisseurs IA réels et Postiz réel restent hors de ce jalon. Voir ADR 0027 et le plan MVP du 2026-11-05.

## 1. Préparer la ressource

### Variante de recette autorisée le 2026-11-05

La ressource de recette utilise `infra/coolify/docker-compose.recette.yml`. Ce fichier reprend les services MVP et exclut les profils optionnels. Coolify génère les secrets `SERVICE_PASSWORD_64_POSTGRES`, `SERVICE_HEX_64_SESSION`, `SERVICE_REALBASE64_32_CREDENTIALS`, `SERVICE_PASSWORD_64_DEMO` et `SERVICE_PASSWORD_64_ADMIN`. Les comptes admin et démo sont amorcés par deux services éphémères idempotents avant le démarrage API. Aucune valeur secrète n'est inscrite dans Git ; les variables sont à conserver dans Coolify entre les redéploiements.

Cette variante exige `APP_ORIGIN`, `WEB_ORIGIN`, `DEMO_MODE=1` et un tag de candidat. `ADMIN_EMAIL` et `DEMO_EMAIL` peuvent être configurés ; leurs valeurs par défaut sont des adresses fictives. Les mots de passe initiaux se consultent dans les variables protégées de cette ressource Coolify, jamais dans un rapport. La commande `docker compose config --quiet` valide la syntaxe hors moteur ; les avertissements de variables générées absentes sont attendus hors Coolify. La recette distante reste obligatoire.

Le mécanisme de génération et le routage par port interne sont documentés dans la [documentation officielle Docker Compose de Coolify](https://coolify.io/docs/applications/builds/docker-compose). Le guide générique ci-dessous conserve le Compose avec secrets fournis manuellement.

Après revue et publication du commit dans votre dépôt Git, créer une application **Docker Compose** dans un projet Coolify Vululu distinct. Répertoire de base : racine du dépôt ; fichier Compose : `infra/coolify/docker-compose.yml`.

Conserver une seule instance API. Affecter le domaine HTTPS au service `web`, port interne **3100**. Ne publier aucun port PostgreSQL/API et ne pas ajouter de port hôte à la configuration de production. Les ports de recette locale ne figurent pas dans le Compose livré.

| Variable Coolify | Valeur à fournir |
|---|---|
| APP_ORIGIN, WEB_ORIGIN | Même URL HTTPS, sans chemin ni slash final |
| DEMO_MODE | 1 |
| ORCHESTRATOR_MODE | local |
| ARTIFACT_STORAGE_BACKEND | local |
| VULULU_IMAGE_TAG | Identifiant du commit qualifié |
| POSTGRES_USER, POSTGRES_DB | Conserver les valeurs par défaut pour le premier essai |
| POSTGRES_PASSWORD | Secret aléatoire hexadécimal ; évite les caractères réservés dans DATABASE_URL |
| SESSION_SECRET | Secret aléatoire distinct, au moins 32 caractères |
| PROVIDER_CREDENTIALS_ENCRYPTION_KEY | 32 octets aléatoires encodés en base64 ; obligatoire pour enregistrer les clés IA |
| DEMO_EMAIL, DEMO_PASSWORD | Compte ordinaire dédié ; mot de passe robuste |

Générer les secrets hors Git et les saisir dans Coolify. `openssl rand -hex 32` convient aux secrets hexadécimaux ; `openssl rand -base64 32` convient à la clé de chiffrement. Ne copier aucune sortie dans un rapport ou dans le chat. Garder la clé de chiffrement stable entre les déploiements et une copie séparée sécurisée ; sa perte empêche la lecture des credentials.

Le Compose injecte la clé de chiffrement dans l’API uniquement. Ne pas la placer dans une variable NEXT_PUBLIC, un argument de build ou le service Web. La démo peut démarrer sans cette clé, mais l’enregistrement des clés IA restera bloqué et le jalon « clés prêtes » ne passe pas.

## 2. Démarrer et amorcer

Construire/démarrer depuis Coolify. Vérifier `migrate` terminé avec succès avant API/Web ; `artifacts-init` initialise les permissions du volume. Les images API et Web partagent une base Debian/Node 24 ; l’API contient OpenSSL, FFmpeg/FFprobe et les polices du rendu. Ne pas activer les profils Hatchet/S3/worker pour ce MVP.

Les commandes suivantes s’exécutent sur le serveur, dans le contexte Compose de cette application avec les variables injectées. En terminal Coolify du conteneur API, omettre le préfixe `docker compose exec -T api`.

```sh
docker compose -f infra/coolify/docker-compose.yml exec -T api node_modules/.bin/tsx scripts/coolify/check-env.ts --require-credentials
```

Amorcer l’admin séparément : fournir temporairement `V1_BOOTSTRAP_EMAIL` et `V1_BOOTSTRAP_PASSWORD` dans l’environnement de la commande, puis lancer :

```sh
docker compose -f infra/coolify/docker-compose.yml exec -T -e V1_BOOTSTRAP_EMAIL -e V1_BOOTSTRAP_PASSWORD api node_modules/.bin/tsx packages/db/prisma/seed.ts
docker compose -f infra/coolify/docker-compose.yml --profile demo-bootstrap run --rm demo-seed
```

L’admin bootstrap ne réinitialise pas un admin existant et refuse d’élever un compte ordinaire. Le bootstrap démo conserve aussi les comptes/données existants ; il n’est pas un reset. Retirer les secrets d’amorçage temporaires après exécution. Se connecter comme admin, ouvrir **Fournisseurs → Clés API IA**, ajouter un fournisseur au catalogue si nécessaire et enregistrer sa clé. « Enregistrée, connexion non testée » est l’état attendu : aucun fournisseur n’est appelé par cette action.

## 3. Recette d’ouverture

- [ ] Connexion du compte démo ; panneau des clés inaccessible à ce compte.
- [ ] Brief → confirmation → storyboard → vidéo réelle → correction d’une scène → QA PASS → approbation exacte et téléchargement.
- [ ] Ajout/remplacement/suppression d’une clé depuis l’admin ; saisie masquée, aucune restitution du secret.
- [ ] Cookies Secure et HttpOnly sur le domaine HTTPS réel ; accès inter-utilisateur refusé.
- [ ] Arrêt des nouveaux lancements, fin des runs en cours puis redémarrage : données et médias conservés.
- [ ] Sauvegarde/restauration vérifiée sur une cible distincte ; rétention des volumes et espace disque surveillés.

La recette automatisée utilise `playwright.external.config.ts` et une URL explicitement fournie. Le drapeau `E2E_LOCAL_SELF_SIGNED` est réservé au certificat de recette localhost ; le laisser désactivé sur le domaine Coolify réel. Traces réseau désactivées pour ne pas enregistrer les credentials.

## 4. Sauvegarde et retour arrière

Avant une sauvegarde cohérente, arrêter les nouveaux lancements, attendre la fin des productions et suspendre les écritures API/Web. Conserver PostgreSQL actif pendant le dump. Sauvegarder **ensemble** la base et le volume `artifacts`, puis redémarrer l’application. Stocker une copie chiffrée hors du VPS ; protéger et conserver la clé de chiffrement séparément.

Pour une restauration : nouvelle base, nouveau volume, même version d’image et clé de chiffrement correspondante. Ne jamais restaurer par écrasement de la source. Lire un master depuis l’application restaurée et vérifier ses checksums, puis tester la lecture des credentials côté serveur sans les afficher. Le vérificateur inclus contrôle les fichiers, FFprobe, le déchiffrement et une lecture authentifiée via l’API :

```sh
node_modules/.bin/tsx scripts/coolify/verify-media.ts --require-credentials
```

Cette commande exige au moins un média produit et `DEMO_EMAIL`/`DEMO_PASSWORD` fournis à la commande, pas au Web. Le drapeau exige aussi un credential chiffré présent ; l’omettre uniquement si aucun fournisseur n’a de clé. Elle crée une session de vérification et ne restitue aucun secret.

En cas de crash pendant une production locale, diagnostiquer le run avant toute relance : les versions déjà finalisées restent la référence. Le rapport `scripts/runtime-reconcile.ts` est en lecture seule par défaut ; son mode `--apply` concerne le moteur durable et ne constitue pas une reprise locale. La reprise automatique d’une production en cours n’est pas qualifiée pour ce MVP. Ne pas présenter un redémarrage entre deux productions comme cette preuve.

Pour revenir à l’image précédente : suspendre les écritures et conserver les volumes. Les migrations 18/19 sont additives ; ne pas supprimer leurs colonnes/tables pour un rollback de code. Un ancien candidat ignore les nouveaux audits et les credentials : rétablir le candidat corrigé avant de modifier ces fonctions. Aucune suppression de volume, commande `down -v` ou réinitialisation de base ne fait partie de cette procédure.

## 5. Preuves

L’état réellement exécuté et les limites figurent dans `MVP_COOLIFY_ACCEPTANCE.md`. La recette Docker locale utilise un projet au nom unique et un proxy HTTPS localhost ; elle ne certifie pas le DNS, le certificat public ni le serveur Coolify de l’utilisateur. Une image construite n’est pas à elle seule un GO d’ouverture.
