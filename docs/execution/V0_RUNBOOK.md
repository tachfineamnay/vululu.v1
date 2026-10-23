# VULULU AI — V0 RUNBOOK

- **Version** : V0 expérimentale
- **Branche** : v0-fullstack-sprint
- **Objectif** : lancer localement la verticale fonctionnelle V0
- **Portée** : démonstration locale, aucune production

## 1. Prérequis

- Node.js 24 et pnpm 10.
- PostgreSQL 17.2 portable dans D:/pgportable/pgsql/bin.
- FFmpeg complet avec libx264 et AAC, par exemple .v0/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe.
- Navigateurs Playwright : pnpm exec playwright install chromium.
- Environ 10 Go libres sur C:.

## 2. Configuration locale

Copier .env.example vers .env, puis renseigner :

    DATABASE_URL=postgresql://vululu@127.0.0.1:55432/vululu_v0?schema=public
    DATABASE_URL_TEST=postgresql://vululu@127.0.0.1:55432/vululu_v0_test?schema=public
    SESSION_SECRET=<secret local de 32 octets ou plus>
    V0_DEMO_EMAIL=demo@vululu.local
    V0_DEMO_PASSWORD=<mot de passe demo local>
    API_PORT=3001
    ARTIFACT_DIR=./data/artifacts
    FFMPEG_PATH=<chemin absolu vers ffmpeg.exe complet>

Le fichier .env est ignoré par Git. Ne jamais le commiter. L API refuse une DATABASE_URL non locale pour éviter tout incident avec une base externe héritée de l'environnement.

## 3. Base de données locale

    pwsh -NoProfile -File scripts/dev-db.ps1 init
    pnpm db:migrate
    pnpm db:seed

Le cluster est créé dans .v0/pgdata, sur le port 55432, avec les bases vululu_v0 et vululu_v0_test. Le script ne touche pas aux bases PostgreSQL existantes d'autres projets.

Arrêt et statut :

    pwsh -NoProfile -File scripts/dev-db.ps1 stop
    pwsh -NoProfile -File scripts/dev-db.ps1 status

## 4. Lancer l'application

    pnpm dev

- Web : http://127.0.0.1:3000
- API : http://127.0.0.1:3001/api/health
- Compte démo : V0_DEMO_EMAIL / V0_DEMO_PASSWORD définis dans .env.

Parcours : login, créer un contexte, créer un projet, enregistrer le brief, générer le storyboard, produire les cinq scènes, corriger SCENE-003, valider le master, transférer vers Postiz mock.

### 4.1 Scénarios de durée

Chaque scène possède un champ durationSeconds configurable (1 à 15 secondes). Le projet propose deux presets :

- Smoke : 5 scènes x 2 s = 10 s, pour valider rapidement FFmpeg et l intégrité des médias.
- Cible : 5 scènes x 10 s = 50 s, pour démontrer le storyboard et l assemblage sur la durée cible.

Le preset est choisi à la création du projet. La durée de chaque scène peut ensuite être ajustée dans le studio, scène par scène, avant une nouvelle production. Le master est assemblé par concaténation avec les durées réelles, et la QA compare la durée obtenue à la somme attendue.

## 5. Vérifications

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm exec playwright test e2e/v0.spec.ts
    pwsh -NoProfile -File scripts/verify-v0.ps1
    pwsh -NoProfile -File scripts/verify-v0.ps1 -ProjectId cmvkpptgv001fhay80yurse1h
    pwsh -NoProfile -File scripts/check-secrets.ps1

Le script verify-v0 retrouve le dernier projet transféré ou le projet fourni via -ProjectId. Il vérifie cinq PNG, le master MP4, la QA, l approbation, le transfert mock, les dimensions/codecs et la durée totale attendue (10 s ou 50 s selon les scènes). La variante -ProjectId est recommandée pour une preuve reproductible de la cible 50 s.

## 6. Limitations V0

- Vululu est scripté : aucun LLM réel.
- Postiz est mocké : aucun envoi réseau, aucune publication.
- Audio silencieux AAC : pas de voix/musique réelle.
- Jobs de production in-process : pas de reprise après crash, pas de Hatchet.
- Durées de scènes limitées à 1-15 s ; pas de montage audio, transitions ou voix.
- Stockage local : pas de S3.
- Aucun MCP local minimal implémenté.
- Pas d invitations par email ; compte démo seedé.
- Pas de providers IA réels, pas de coûts, pas de publication sociale.
- Pas de déploiement, pas de VPS, pas de Coolify.

## 7. Sécurité

- Ne jamais commiter .env, data/, .v0/, node_modules, test-results.
- Les artefacts sont fictifs et ignorés par Git.
- L API vérifie la propriété des projets et contextes.
- Le transfert Postiz est un mock local.
- Les secrets restent locaux et hors du dépôt public.
- Ne pas lancer Prisma sans DATABASE_URL locale explicite : les scripts du dépôt le font déjà.

## 8. Arrêt

    pwsh -NoProfile -File scripts/dev-db.ps1 stop

Les serveurs API et web peuvent être arrêtés par leurs processus locaux ou par le gestionnaire de terminaux utilisé. Aucun déploiement n'est effectué.
