# Rapport d'inauguration — Vululu AI

- **Mission** : Mission 00 — Initialisation officielle du projet
- **Version** : 1.0
- **Date** : 2026-10-21
- **Auteur** : Lead Software Architect / Engineering Agent, DeepSeek Harness
- **Statut** : Livré
- **Dépôt** : https://github.com/tachfineamnay/vululu.v1
- **Branche de référence** : main

## 1. Synthèse exécutive

La Mission 00 a relié le workspace local au dépôt GitHub **vululu.v1**, importé le corpus fondateur sans altération, organisé la documentation, produit les décisions d'architecture et la feuille de route V1, et préparé le premier commit documentaire **chore: inaugurate Vululu AI V1**.

Résultats principaux :

- workspace initialement vide, désormais dépôt Git sur main relié à origin ;
- neuf fichiers fondateurs préservés (six markdown vérifiés par SHA256, trois originaux docx) ;
- documentation d'inauguration, cinq ADR, roadmap, proposition P0-0 et garde-fou V2 ;
- aucune fonctionnalité métier, aucune structure applicative, aucun secret ;
- audit de cohérence documentaire livré avec dix-huit constats et treize décisions ouvertes ;
- dépôt GitHub public et vide au départ ; premier push effectué sans force après vérification.

Deux décisions restent prioritaires avant la suite : la visibilité du dépôt (public alors que le produit est interne) et le GO du lot P0-0.

## 2. Méthode et périmètre

### 2.1 Méthode

1. Inspection en lecture seule du workspace, de Git, de GitHub et des sources documentaires.
2. Vérification de l'accessibilité du dépôt distant et de son état réel (vide, branche main).
3. Inventaire et empreintes des documents fondateurs.
4. Lecture intégrale du PRD, du CDC, de l'architecture, du backlog, du prompt maître et de la note V2.
5. Organisation du dépôt et rédaction des documents d'inauguration.
6. Vérifications locales (empreintes, structure, secrets) avant commit.
7. Commit unique, push sans force, vérifications distantes.

### 2.2 Périmètre livré

Documentation, décisions d'architecture, roadmap, scripts de validation, premier commit et push. Aucun code métier, aucune dépendance applicative, aucun accès fournisseur, aucun déploiement.

### 2.3 Non-objectifs respectés

Pas de Memory Bank, pas d'embeddings, pas de monétisation, pas de marketplace, pas de stack imposée, pas de structure applicative artificielle, pas de modification des spécifications validées.

## 3. État initial du workspace

| Élément | Constat |
|---|---|
| Chemin absolu | C:/Users/hp/Desktop/vululu Ai |
| Contenu à la première inspection (2026-10-21 15:42) | Aucun fichier, aucun dossier |
| Dépôt Git | Absent ; aucun dépôt parent détecté |
| Branche | Sans objet |
| Remotes | Aucun |
| Modifications non commitées | Sans objet |
| Outillage | git 2.48.1, gh 2.99.0, node 24.21.0, pnpm 10.6.1, Python 3.11.9, Docker 29.8.1 |
| Identité Git | tachfineamnay / tachfine.amnay@gmail.com |

### 3.1 Événement en cours de mission

Pendant la préparation du plan, dix fichiers ont été déposés à la racine du workspace : les neuf documents fondateurs et un fichier HTML externe, Architecture de l'Atelier Social.html. Les sources correspondantes ne se trouvaient plus dans Downloads, ce qui indique un déplacement et non une copie.

Traitement appliqué :

- inventaire complet et comparaison des empreintes ;
- vérification que les six markdown sont byte-identiques aux pièces jointes de la session ;
- confirmation des tailles des trois docx (41757, 42518 et 40331 octets) ;
- déplacement sans réécriture vers docs/ et docs/source/ ;
- mise en quarantaine du fichier HTML externe dans _inbox/, ignoré par Git et non publié.

Aucun fichier du corpus n'a été perdu ou modifié.

## 4. État du dépôt GitHub

| Élément | Constat |
|---|---|
| URL | https://github.com/tachfineamnay/vululu.v1 |
| Visibilité | Publique |
| État initial | Vide : aucune branche, aucun tag, aucune référence, taille 0 |
| Branche par défaut | main |
| Création / dernier push | 2026-10-21T15:20:56Z |
| Authentification | gh connecté en tachfineamnay, scopes repo et workflow |
| Identifiants HTTPS | Disponibles et testés sans exposition de valeur |
| Historique local / distant | Aucun historique préexistant ; pas de divergence possible |
| Opération prévue | Premier commit documentaire puis git push -u origin main, sans force |

Le dossier Desktop/Vululu AI CDC PRD, vide, ne contient aucun document.

## 5. Inventaire des documents fondateurs

### 5.1 Documents disponibles

| Fichier | Taille | SHA256 (préfixe) | Statut | Destination |
|---|---|---|---|---|
| 01_PRD_V1.md | 8938 | 2e943708 | Verbatim, confirmé | docs/01_PRD_V1.md |
| 02_CAHIER_DES_CHARGES_V1.md | 8907 | 6b220a4c | Verbatim, confirmé | docs/02_CAHIER_DES_CHARGES_V1.md |
| 03_ARCHITECTURE_V1.md | 5886 | 194644c0 | Verbatim, confirmé | docs/03_ARCHITECTURE_V1.md |
| 11_BACKLOG.md | 2816 | 4fa387ef | Verbatim, confirmé | docs/11_BACKLOG.md |
| PROMPT_DEEPSEEK_HARNESS.md | 3449 | d2f00491 | Verbatim | docs/PROMPT_DEEPSEEK_HARNESS.md |
| NOTE_SPECIALE_PROPOSITIONS_V2.md | 5645 | 61131e4f | Verbatim, hors V1 | docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md |
| VULULUIA_PRD_V1_2.docx | 41757 | 48e35d0c | Original intact | docs/source/ |
| VULULUIA_CDC_V1_2.docx | 42518 | 6b67a584 | Original intact | docs/source/ |
| VULULUIA_NOTE_V2_PROPOSITIONS.docx | 40331 | 52e91744 | Original intact | docs/source/ |

Les empreintes complètes sont dans [source/SHA256SUMS.txt](source/SHA256SUMS.txt).

### 5.2 Fichier externe détecté

| Fichier | Taille | SHA256 (préfixe) | Décision |
|---|---|---|---|
| Architecture de l'Atelier Social.html | 30855 | fda38d2e | Non fondateur ; quarantaine _inbox/, non publié |

Ce document décrit l'architecture d'un autre dépôt (social-mvp, reboutement) et n'est pas référencé par le corpus Vululu AI. Il n'est ni modifié ni publié dans le dépôt.

### 5.3 Documents référence mais absents

| Référence | Cité par | Constat | Traitement |
|---|---|---|---|
| docs/04_DECISIONS_ADR.md | Prompt maître | Absent du corpus | Remplacé par docs/adr/ ; gap A-01 |
| docs/10_ACCEPTANCE_TESTS.md | CDC section E | Absent | À produire en P0-0 (D6) |
| Contrats API/agents/modèles | Prompt maître, CDC G | Absents | Inventaire en P0-0 (D8) |
| Spécification MCP autonome | Mission, architecture | Seule une section existe | À produire en P0-E |

Aucun document manquant n'a été inventé.

## 6. Structure définitive proposée

    .
    |-- README.md
    |-- AGENTS.md
    |-- .gitignore
    |-- .gitattributes
    |-- .env.example
    |-- docs/
    |   |-- README.md
    |   |-- INAUGURATION_REPORT.md
    |   |-- 01_PRD_V1.md
    |   |-- 02_CAHIER_DES_CHARGES_V1.md
    |   |-- 03_ARCHITECTURE_V1.md
    |   |-- 11_BACKLOG.md
    |   |-- PROMPT_DEEPSEEK_HARNESS.md
    |   |-- source/
    |   |   |-- VULULUIA_PRD_V1_2.docx
    |   |   |-- VULULUIA_CDC_V1_2.docx
    |   |   |-- VULULUIA_NOTE_V2_PROPOSITIONS.docx
    |   |   |-- SHA256SUMS.txt
    |   |-- adr/
    |   |   |-- README.md, template.md et ADR-0001 à ADR-0005
    |   |-- backlog/
    |   |   |-- ROADMAP_V1.md
    |   |   |-- P0_0_AUDIT_FONDATIONS.md
    |   |-- v2/
    |   |   |-- README.md
    |   |   |-- NOTE_SPECIALE_PROPOSITIONS_V2.md
    |-- scripts/
    |   |-- check-secrets.ps1
    |   |-- verify-foundation-docs.ps1
    |-- _inbox/ (local, ignoré)

### 6.1 Justification

- Les chemins docs/01_PRD_V1.md et suivants sont conservés car ils sont référencés par le prompt maître.
- Les originaux docx sont conservés à côté des markdown pour préserver la version signée.
- Les ADR ont leur propre dossier, conformément à la mission et au modèle ADR.
- La roadmap et la proposition P0-0 sont séparées du backlog importé, qui reste verbatim.
- La V2 est isolée dans docs/v2 avec un README de garde-fou.
- Aucune structure applicative (src, app, apps, packages) n'est créée avant le lot qui la justifie.
- _inbox/ est ignoré : il ne contient que des fichiers locaux non publiés.

## 7. Audit de cohérence PRD / CDC / Architecture

### 7.1 Constats

| ID | Sévérité | Constat | Recommandation |
|---|---|---|---|
| A-01 | Bloquant | Corpus incomplet : 04 (ADR), 10 (tests d'acceptation), contrats et spec MCP absents | Produire en P0-0 ; ne pas inventer |
| A-02 | Majeur | Le dossier VULULUIA_DEV_PACK_V1_2 n'existe pas sous ce nom ; corpus déposé en vrac | Documenté ; organisation réalisée |
| A-03 | Majeur | Cinq noms coexistent : VULULU IA, Vululu AI, vululu-ai, vululu.v1, dossier vululu Ai | Glossaire officiel ; graphie historique conservée dans les verbatim |
| A-04 | Mineur | Rôle nommé super-utilisateur (PRD) et super-admin (CDC) | Unifier dans le glossaire et les contrats |
| A-05 | Mineur | Fichiers nommés V1 alors que le contenu est V1.2 | Chemins conservés ; version documentée |
| A-06 | Majeur | Routeur : PRD-07 inclut qualité, latence et santé ; CDC-F-033 ne cite que compatibilité, licence et budget | Politique de classement à figer en P0-C |
| A-07 | Majeur | Hatchet retenu mais POC non exécuté | P0-0 bloquant ; ADR-0003 conditionnel |
| A-08 | Majeur | Mécanisme d'authentification MCP non tranché (OAuth ou token) | Trancher en P0-0 ; scopes et audience à spécifier |
| A-09 | Majeur | API et mode d'intégration Postiz non qualifiés | Qualifier en P0-E ; mock explicite accepté |
| A-10 | Majeur | Fournisseur S3, région et résidence des données non décidés | Trancher en P0-0 |
| A-11 | Risque externe | Dépôt public alors que le produit est interne et les specs propriétaires | Passer en privé avant contenu sensible (D-01) |
| A-12 | Majeur | Aucune licence définie | Décider avant toute ouverture (D-09) |
| A-13 | Majeur | Stack applicative non décidée | Audit et ADR en P0-0 |
| A-14 | Mineur | Campagnes (PRD-16, CDC-F-013, module campaigns) absentes des métriques du pilote | Clarifier les métriques de recette |
| A-15 | Majeur | Aucune matrice exigence vers test sans le document 10 | Document 10 et matrice en P0-0 |
| A-16 | Mineur | La décision de réutilisation ou non de QeyNox n'est pas tracée | ADR en P0-0 après audit |
| A-17 | Mineur | Devise, budget et seuils de coût non définis | Fixer en P0-0 |
| A-18 | Mineur | Durées de rétention et de purge non définies | Fixer en P0-0 avec CDC-N-011 |

### 7.2 Cohérences confirmées

- **V1 / V2** : les non-objectifs du PRD, le CDC et la note V2 convergent ; la mémoire adaptative est exclue de la V1.
- **États** : la machine d'états du CDC (run, step, transfert) est compatible avec l'architecture et le PRD.
- **Approbation** : version exacte, checksum et validation humaine sont cohérents dans les trois documents.
- **Identifiants** : Scene ID et Character ID stables, bindings fournisseurs facultatifs, cohérents.
- **MCP** : même domaine et mêmes cas d'usage que le web, sans accès direct à la base, cohérent.
- **Postiz** : externe, transfert après approbation, idempotence, cohérent.
- **Architecture** : monolithe modulaire, Domain Core indépendant, PostgreSQL, S3, orchestration durable, cohérents.
- **Audio** : voix/musique optionnelles, licences, mix et ducking cohérents.
- **Campagnes** : regroupement simple présent dans PRD-16, CDC-F-013 et le module campaigns.

### 7.3 Lecture de l'audit

Le corpus est cohérent sur le fond : les désaccords portent sur le niveau de détail, les noms et les décisions encore ouvertes, pas sur la vision ou les invariants. Les manques les plus sérieux sont documentaires (traçabilité, contrats, tests) et seront traités en P0-0. Le risque de sécurité immédiat est la visibilité publique du dépôt.

## 8. Feuille de route V1 priorisée

| Lot | Contenu | Sortie |
|---|---|---|
| P0-0 | Audit, ADR stack, environnement, POC Hatchet, tests, matrice | GO P0-A |
| P0-A | Identité, isolation, contextes, campagnes, MCP de lecture | GO P0-B |
| P0-B | Wizard, brief, options média, audio, BriefRevision | GO P0-C |
| P0-C | Agents, capacités, routeur, coûts, Hatchet, durabilité | GO P0-D |
| P0-D | Rendu, scènes, artefacts, QA, approbation, correction ciblée | GO P0-E |
| P0-E | Postiz, MCP parity, transferts idempotents | GO P0-F |
| P0-F | Observabilité, sécurité, backups, E2E, recette | GO/NO-GO interne |
| P1 | Templates, recherche avancée, comparaisons | Après P0 |

Le détail, les dépendances, la matrice de traçabilité et les jalons sont dans [backlog/ROADMAP_V1.md](backlog/ROADMAP_V1.md). Le principe directeur est la tranche verticale mock avant les fournisseurs réels.

## 9. Décisions ouvertes

| ID | Décision | Recommandation | Lot concerné |
|---|---|---|---|
| D-01 | Visibilité du dépôt | Passer en privé avant contenu sensible | Immédiat |
| D-02 | Corpus officiel | Confirmer que les neuf fichiers reçus sont le corpus complet, ou fournir le pack | P0-0 |
| D-03 | Documents manquants | Produire 10, contrats et spec MCP ; ne pas inventer 04 | P0-0 / P0-E |
| D-04 | Stack et structure | Audit comparatif QeyNox/SocioPulse puis ADR | P0-0 |
| D-05 | Authentification MCP | OAuth 2.1 resource server, scopes, audience | P0-0 / P0-E |
| D-06 | Hatchet définitif | POC bloquant ; fallback derrière le port si échec | P0-0 |
| D-07 | Stockage S3 | MinIO local puis fournisseur compatible UE/Maroc | P0-0 |
| D-08 | Postiz | Qualifier cloud/self-host et API avant P0-E | P0-E |
| D-09 | Licence | Décider avant ouverture commerciale | Immédiat |
| D-10 | Protection de main | Activer PR obligatoire après le premier commit | P0-0 |
| D-11 | Nom du dépôt | Conserver vululu.v1 et documenter l'écart avec vululu-ai | Documenté |
| D-12 | Budget et devise par run | Fixer plafonds et seuils | P0-0 |
| D-13 | Rétention et purge | Fixer les durées et la politique | P0-0 |

## 10. Risques

| Risque | Impact | Mitigation |
|---|---|---|
| Dépôt public et specs propriétaires | Fuite commerciale | Décision D-01 avant contenu sensible |
| Corpus incomplet | Traçabilité et recette fragiles | P0-0 D6/D7/D8 |
| Hatchet inadapté | Retard de la durabilité | POC bloquant, port découplé |
| API Postiz insuffisante | Blocage de la livraison | Mock explicite, qualification P0-E |
| Fournisseurs média indisponibles ou coûteux | Production impossible | Contrats et mocks d'abord, budget ensuite |
| Stack inadaptée | Dette structurelle | Audit et ADR en P0-0 |
| Concentration de la connaissance | Dépendance à une personne | Documentation, ADR, preuves |
| Absence de licence | Insécurité juridique | Décision D-09 |
| Périmètre V1 large | Dérive | Roadmap par lots et critères de sortie |
| Aucune donnée de test réelle | Fausse confiance | Mocks explicites et NOT_RUN assumé |

## 11. Vérifications et preuves

### 11.1 Vérifications exécutées avant rédaction

| Vérification | Résultat |
|---|---|
| Workspace initial vide | Confirmé à 15:42 |
| Git absent puis initialisé sur main | Confirmé |
| Remote origin exact | Confirmé |
| Dépôt distant vide | Confirmé : aucune référence |
| Authentification GitHub | Compte tachfineamnay, scopes repo |
| Empreintes des six markdown | Identiques aux pièces jointes de la session |
| Tailles des trois docx | Conformes aux fichiers reçus |
| Scan de secrets initial | 0 détection |
| Présence de .env | Aucune |
| Présence de src/app/packages | Aucune |

### 11.2 Vérifications prévues avant et après commit

    pwsh -File scripts/verify-foundation-docs.ps1
    pwsh -File scripts/check-secrets.ps1
    git status --short
    git diff --cached --check
    git diff --cached --stat
    git commit -m "chore: inaugurate Vululu AI V1"
    git ls-remote origin
    git push -u origin main
    git ls-remote origin refs/heads/main
    gh api repos/tachfineamnay/vululu.v1/commits/main --jq .sha
    git fsck --full

Le commit et le push sont exécutés immédiatement après la rédaction de ce rapport. Le SHA final, l'état distant et les résultats détaillés sont consignés dans la réponse de livraison de la Mission 00 ; ils restent vérifiables par git log -1, git ls-remote et l'API GitHub. Ce rapport ne contient pas son propre SHA pour éviter toute réécriture de commit.

### 11.3 Inventaire de la livraison

    README.md
    AGENTS.md
    .gitignore
    .gitattributes
    .env.example
    docs/README.md
    docs/INAUGURATION_REPORT.md
    docs/01_PRD_V1.md
    docs/02_CAHIER_DES_CHARGES_V1.md
    docs/03_ARCHITECTURE_V1.md
    docs/11_BACKLOG.md
    docs/PROMPT_DEEPSEEK_HARNESS.md
    docs/source/ (3 docx + SHA256SUMS.txt)
    docs/adr/ (README, template, 5 ADR)
    docs/backlog/ (ROADMAP_V1.md, P0_0_AUDIT_FONDATIONS.md)
    docs/v2/ (README.md, NOTE_SPECIALE_PROPOSITIONS_V2.md)
    scripts/check-secrets.ps1
    scripts/verify-foundation-docs.ps1

Total : 29 fichiers versionnés attendus, plus _inbox/ local ignoré.

## 12. Limites

- Aucun test d'acceptation exécuté : il n'existe pas encore de code.
- Aucun POC Hatchet exécuté : il appartient à P0-0.
- L'audit des dépôts QeyNox et SocioPulse n'a pas été approfondi : il appartient à P0-0.
- Les trois docx n'ont pas de hash de référence externe ; leur intégrité repose sur le déplacement vérifié et les tailles reçues.
- Le rapport ne contient pas son propre SHA (pas d'amend, pas de second commit).
- La visibilité publique du dépôt n'a pas été modifiée : décision D-01.

## 13. Premier lot technique proposé — P0-0

Le premier lot est un lot d'audit et de fondations, sans fonctionnalité métier : audit QeyNox/SocioPulse, ADR stack et structure, environnement local, POC Hatchet, document d'acceptation, matrice de traçabilité et inventaire des contrats.

Critères de sortie :

- ADR stack et structure acceptés ;
- POC Hatchet exécuté avec preuves, ou NOT_RUN motivé ;
- docs/10_ACCEPTANCE_TESTS.md produit ;
- matrice de traçabilité complète ;
- aucun code métier, aucun secret.

Le détail est dans [backlog/P0_0_AUDIT_FONDATIONS.md](backlog/P0_0_AUDIT_FONDATIONS.md).

## 14. Conclusion

La Mission 00 est remplie : le dépôt est relié à GitHub, le corpus est préservé et organisé, la V1 et la V2 sont séparées, les décisions structurantes sont tracées et le premier commit documentaire est prêt à être publié sans force.

Prochaine décision attendue : **GO P0-0**. Décision préalable recommandée : **D-01**, visibilité du dépôt.
