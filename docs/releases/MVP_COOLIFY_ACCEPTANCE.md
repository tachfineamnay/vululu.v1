# MVP Coolify — État de recette

Date : 2026-11-05. Branche : `codex/v1-demo-coolify` ; base committée : `ef3ef15`. Les ajouts MVP décrits ici sont dans l'arbre de travail, pas encore un candidat de release committé.

**État : fonctionnalités implémentées et tests ciblés verts ; qualification Linux incomplète. Aucun GO de mise en service.**

| Contrôle | Résultat observé |
|---|---|
| Rendu complet, snapshot et pipelines | 30 PASS / 2 S3 SKIP |
| Vidéo → correction → QA → approbation → Postiz MOCK, navigateur Windows | 1 PASS |
| Credentials, chiffrement, sécurité et lectures admin | 46 PASS |
| Migration 19 préservant un fournisseur existant | 1 PASS / 6 tests filtrés |
| Bootstrap admin sans élévation ni réinitialisation | 3 PASS |
| Typage et build API/Web | PASS |
| Lint strict après correction de la cause d’erreur | PASS |
| Secrets, frontières d'architecture, 9 documents fondateurs | PASS |
| Build images Linux amd64, Node 24 | PASS ; dépendances natives et polices installées |
| Démarrage de la stack Linux vierge | FAIL environnement : arrêt du moteur Docker pendant l'extraction PostgreSQL ; `unexpected EOF`, pipe Docker disparu |
| 4 parcours E2E sur Linux/HTTPS, dont formulaire admin 390 px | NOT_RUN : démarrage interrompu avant ces étapes |
| Persistance après redémarrage et restauration DB/médias/credentials | NOT_RUN sur Linux |
| Domaine, TLS public et serveur Coolify de l'utilisateur | NOT_RUN ; aucun déploiement distant effectué |

Les images ont été construites depuis l'arbre de travail, avant la dernière correction lint ajoutant la cause d'une erreur de fichier immuable. Elles ne sont donc pas un binaire final publiable. Identifiants locaux de preuve, sans publication registre :

- API : `vululu-api:vululu-mvp-6e8262b8`, index `sha256:212a320d7958ed8c4d0649517a7bec3b413e823b74f59e4eff38ba6116bf6061`.
- Web : `vululu-web:vululu-mvp-6e8262b8`, index `sha256:ff17d354d699cf131a1726a37d5e300f2ab5fc27c9cdbdf662c39cc47391a777`.

Le contexte de build API est passé de plus de 130 Mo à 944,42 ko après exclusion des caches/dépendances imbriqués. Les deux conteneurs Docker préexistants n'ont fait l'objet d'aucune modification demandée par la recette. Les éventuels volumes du projet de preuve sont conservés ; aucun `down -v` n'a été lancé.

## Accès de recette

Autorisation explicite reçue le 2026-11-05 pour préparer et déployer la recette sur Coolify. Un projet et une application Vululu séparés sont créés ; le déploiement n’a pas encore démarré. Le Compose de recette amorce les comptes et utilise les secrets générés nativement par Coolify. Sa syntaxe a été validée hors moteur. Aucune application préexistante n’est modifiée.

## Prochaine étape unique

Effectuer la recette sur le serveur de l'utilisateur, conformément au choix de déploiement direct : suivre `MVP_COOLIFY_RUNBOOK.md`, puis exécuter les quatre parcours `brief-profile`, `conversation-demo`, `v0` et `provider-credentials` via `playwright.external.config.ts`. Vérifier ensuite la persistance et la restauration sur une cible distincte avec `scripts/coolify/verify-media.ts --require-credentials`. Ne jamais imprimer les variables de connexion.

Le domaine public utilise une validation TLS normale. Le drapeau de certificat autosigné est limité à localhost. Les sessions doivent être Secure/HttpOnly ; conserver les mêmes secrets serveur pour la restauration. Aucun appel IA réel ni publication Postiz n'entre dans cette recette.

La reprise automatique d'un run local interrompu reste non qualifiée ; terminer les productions avant redémarrage et ne pas annoncer une reprise après crash. MCP est après le MVP. Le contrôle S3 est SKIP et ne certifie pas un stockage externe. Les preuves de credentials utilisent uniquement des fixtures synthétiques.

Les rapports de lots `docs/execution/MVP_01_LAYOUT.md` et `MVP_02_PROVIDER_CREDENTIALS.md` détaillent les preuves fonctionnelles. Le plan `docs/superpowers/plans/2026-11-05-mvp-coolify-cles-ia.md` fait foi pour les cases restantes. Rollback : image précédente, volumes et migrations additives conservés ; procédure dans le runbook.
