# Vululu AI

**Studio de production créative agentique multimodèle.**

Vululu AI crée, orchestre et livre des contenus professionnels pour TikTok, Instagram et LinkedIn : contextes de marque structurés, briefs versionnés, agents spécialisés, production média multi-fournisseurs, contrôle qualité, validation humaine et transfert vers Postiz.

> **Statut — 2026-10-23 : corpus fondateur + prototype V0 audité.**
> Le corpus V1.2 et les ADR restent la référence. Un prototype fullstack V0 existe sur la branche v0-fullstack-sprint, non mergée dans main. Il couvre le parcours contexte, brief, storyboard, PNG/MP4, correction ciblée, QA, approbation exacte et Postiz mock. Ce prototype est une référence fonctionnelle, pas le socle V1. L'audit est dans [docs/reviews/V0_FINAL_AUDIT.md](docs/reviews/V0_FINAL_AUDIT.md) ; la V1 ne doit démarrer que par le lot de fondation décrit dans [V1_IMPLEMENTATION_BASELINE.md](docs/reviews/V1_IMPLEMENTATION_BASELINE.md).

## Le problème

Produire du contenu professionnel pour les réseaux sociaux impose aujourd'hui d'orchestrer manuellement une dizaine d'outils IA, de perdre les références de style, de recommencer une vidéo entière pour changer un plan et de répéter le même contexte à chaque brief.

Vululu AI répond par un studio de production supervisé : un workflow explicite, des agents spécialisés, un catalogue de fournisseurs IA évolutif, des artefacts versionnés et une validation humaine avant tout transfert vers Postiz. La créativité reste supervisée ; l'utilisateur garde le droit d'interrompre, de corriger et d'approuver.

## Périmètre V1

- Outil interne, accès sur invitation, super-utilisateur et utilisateurs invités.
- Contextes de marque structurés, réutilisables et versionnés.
- Workflow guidé : contexte, réseau, format, brief, production.
- Agents multimodèles : direction créative, spécialistes, validateurs QA.
- Production image, carrousel, motion design, vidéo multiscène et audio.
- Correction ciblée par Scene ID sans relancer toute la production.
- Interface web et serveur MCP sur les mêmes services métier.
- Contrôle qualité, approbation d'une version exacte, transfert Postiz.
- Journalisation, reprise sur erreur, gestion des coûts, tests automatisés.

## Hors périmètre V1 (V2)

Mémoire sémantique persistante et Memory Bank, apprentissage des préférences, contextes hiérarchiques enrichis, modes de liberté créative avancés, monétisation, abonnements, crédits, marketplace et Everything LLM. Ces sujets sont décrits dans la [note V2](docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md) et ne doivent pas être implémentés pendant les lots V1.

## État du dépôt

| Étape | Contenu | Statut |
|---|---|---|
| Mission 00 | Inauguration documentaire, structure, ADR, roadmap | Livrée |
| V0 prototype | Parcours local contexte → brief → storyboard → média → QA → approbation → Postiz mock | Livré sur v0-fullstack-sprint, non mergé |
| V1-01 | Audit V0, corrections, gaps et baseline V1 | Livré dans docs/reviews |
| P0-0 | Audit technique, stack, environnement, POC Hatchet | Non clôturé |
| P0-A à P0-F | Verticale V1 complète | Non démarrés |

## Documentation fondatrice

| Document | Rôle |
|---|---|
| [Index documentaire](docs/README.md) | Provenance, statut, règles de modification |
| [PRD V1.2](docs/01_PRD_V1.md) | Exigences produit et parcours |
| [Cahier des charges V1.2](docs/02_CAHIER_DES_CHARGES_V1.md) | Exigences testables, sécurité, recette |
| [Architecture V1](docs/03_ARCHITECTURE_V1.md) | Domain Core, orchestration, stockage, MCP |
| [Backlog](docs/11_BACKLOG.md) | Épics, stories, Definition of Done |
| [Prompt maître](docs/PROMPT_DEEPSEEK_HARNESS.md) | Cadre de travail des agents |
| [Note V2](docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md) | Vision différée, hors périmètre |
| [ADR](docs/adr/README.md) | Décisions d'architecture |
| [Roadmap V1](docs/backlog/ROADMAP_V1.md) | Lots priorisés et critères de sortie |
| [P0-0](docs/backlog/P0_0_AUDIT_FONDATIONS.md) | Premier lot technique proposé |
| [Rapport d'inauguration](docs/INAUGURATION_REPORT.md) | État initial, audit, décisions ouvertes |

## Principes d'architecture

- **Domain Core indépendant** des fournisseurs IA, de la base et de l'infrastructure.
- **Application Layer** portant les cas d'usage, les autorisations, les budgets et l'idempotence.
- **Monolithe modulaire** : une API et des workers spécialisés, pas de microservices prématurés.
- **PostgreSQL** comme source de vérité ; **stockage S3-compatible** pour les binaires.
- **Orchestration durable** derrière un port, avec Hatchet sous réserve de validation P0-0.
- **Registre dynamique** des agents, capacités, modèles et fournisseurs.
- **Artefacts immuables**, versionnés, avec checksums et provenance.
- **Identifiants permanents** pour projets, scènes et personnages.
- **Web et MCP** branchés sur les mêmes cas d'usage et le même RBAC.
- **Postiz externe** : transfert après approbation d'une version exacte.
- **V1 sans V2** : les points d'extension sont prévus, le code V2 est interdit.

## Structure du dépôt

    .
    |-- README.md
    |-- AGENTS.md
    |-- .gitignore
    |-- .gitattributes
    |-- .env.example
    |-- docs/
    |   |-- README.md et INAUGURATION_REPORT.md
    |   |-- documents fondateurs V1.2 (PRD, CDC, architecture, backlog, prompt)
    |   |-- source/ (originaux docx et empreintes SHA256)
    |   |-- adr/ (décisions d'architecture)
    |   |-- backlog/ (roadmap et proposition P0-0)
    |   |-- v2/ (propositions différées)
    |-- scripts/ (validation documentaire et scan de secrets)
    |-- _inbox/ (fichiers locaux non publiés, ignorés par Git)

## Démarrage

Le corpus reste la référence. Le prototype V0 se lance localement via [docs/execution/V0_RUNBOOK.md](docs/execution/V0_RUNBOOK.md), avec PostgreSQL et FFmpeg locaux. Il ne doit pas être déployé ni présenté comme une validation V1.

Pour contribuer ou préparer la V1 :

1. Lire [AGENTS.md](AGENTS.md) puis [docs/README.md](docs/README.md).
2. Lire le corpus fondateur dans l'ordre indiqué.
3. Lire l'audit et la baseline V1 dans [docs/reviews](docs/reviews).
4. Vérifier l'intégrité documentaire et l'absence de secrets.
5. Proposer toute décision nouvelle via un ADR, jamais par modification silencieuse d'une spécification.

Outillage constaté sur le poste de référence : Git 2.48, Node 24, pnpm 10, Python 3.11, Docker 29. Le choix de stack reste une décision ouverte, à trancher en P0-0.

## Sécurité

- Aucun secret, clé API, fichier .env ou identifiant ne doit être commité.
- Le fichier [.env.example](.env.example) ne contient que des placeholders.
- Les secrets sont stockés côté serveur, jamais exposés au frontend ni aux logs.
- Le script scripts/check-secrets.ps1 est exécuté avant chaque commit.
- Toute donnée utilisateur est isolée par propriétaire ; les accès sont vérifiés côté serveur.

## Gouvernance

Le développement suit des lots courts, testables et réversibles. Chaque lot identifie ses exigences PRD/CDC, ses interfaces, ses critères d'acceptation, ses preuves et ses limitations. Un lot sans preuve n'est pas déclaré terminé. Voir [AGENTS.md](AGENTS.md) et la [roadmap](docs/backlog/ROADMAP_V1.md).

## Licence

Aucune licence n'est définie à ce stade. Le dépôt est public mais tous les droits sont réservés par défaut ; ne pas réutiliser, distribuer ou exploiter le contenu sans accord écrit du porteur du projet. Ce point est une décision ouverte (D-09).

## Dépôt

https://github.com/tachfineamnay/vululu.v1
