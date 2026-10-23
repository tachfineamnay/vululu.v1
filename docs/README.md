# Index documentaire — Vululu AI

Ce dossier contient le corpus fondateur V1.2 et les documents d'inauguration. Il fait autorité pour le périmètre, l'architecture et les règles de développement.

## 1. Corpus fondateur

| Fichier | Nature | Version | Statut |
|---|---|---|---|
| 01_PRD_V1.md | Product Requirements Document | 1.2 | Verbatim |
| 02_CAHIER_DES_CHARGES_V1.md | Cahier des charges fonctionnel et technique | 1.2 | Verbatim |
| 03_ARCHITECTURE_V1.md | Architecture de référence V1 | 1.0 | Verbatim |
| 11_BACKLOG.md | Épics, stories, Definition of Done | 1.0 | Verbatim |
| PROMPT_DEEPSEEK_HARNESS.md | Prompt maître de travail des agents | 1.0 | Verbatim |
| v2/NOTE_SPECIALE_PROPOSITIONS_V2.md | Vision V2 différée | 1.0 | Verbatim, hors périmètre |

Les originaux docx fournis sont conservés dans [source/](source/) :

- source/VULULUIA_PRD_V1_2.docx
- source/VULULUIA_CDC_V1_2.docx
- source/VULULUIA_NOTE_V2_PROPOSITIONS.docx

## 2. Provenance

- Le dossier attendu **VULULUIA_DEV_PACK_V1_2** n'a pas été trouvé sous cette forme sur le poste.
- Les neuf documents fondateurs ont été déposés en vrac à la racine du workspace avant l'organisation de la Mission 00, puis déplacés dans docs/ sans modification de contenu.
- Les six fichiers markdown ont été vérifiés par empreinte SHA256 : ils sont byte-identiques aux pièces jointes fournies dans la session de travail.
- Les trois docx ont été déplacés sans réécriture ; leurs tailles et empreintes sont enregistrées dans [source/SHA256SUMS.txt](source/SHA256SUMS.txt).
- Un fichier HTML externe, Architecture de l'Atelier Social.html, a été détecté dans le même dépôt de fichiers. Il ne fait pas partie du corpus Vululu AI : il a été déplacé dans _inbox/ (ignoré par Git) et n'a pas été publié.

## 3. Règles d'intégrité

- **Ne jamais modifier** un document importé : le contenu validé fait foi.
- Une évolution de spécification crée un nouveau fichier daté et versionné, jamais une réécriture silencieuse.
- Les hashs de référence sont dans source/SHA256SUMS.txt ; le script scripts/verify-foundation-docs.ps1 contrôle l'intégrité.
- Toute correction de forme sur un document verbatim est interdite pendant la Mission 00 ; elle fera l'objet d'une révision documentaire dédiée.

## 4. Nommage

- Nom officiel du produit : **Vululu AI**.
- Nom technique : **vululu-ai**.
- Dépôt GitHub : **vululu.v1** (URL fournie, conservée).
- Les documents fondateurs importés utilisent l'ancienne graphie **VULULU IA** ; elle est conservée telle quelle pour préserver les références. Les nouveaux documents utilisent Vululu AI.
- Les noms de fichiers 01_PRD_V1.md et 02_..._V1.md sont conservés bien que leur contenu soit en version 1.2, afin de respecter le chemin référencé par le prompt maître.

## 5. Documents référencés mais absents

Le corpus reçu ne contient pas les documents suivants, pourtant cités par les spécifications :

| Référence | Cité par | Traitement |
|---|---|---|
| docs/04_DECISIONS_ADR.md | PROMPT_DEEPSEEK_HARNESS.md | Remplacé opérationnellement par docs/adr/ ; écart documenté dans le rapport |
| docs/10_ACCEPTANCE_TESTS.md | 02_CAHIER_DES_CHARGES_V1.md section E | Produit en Mission 01 ; catalogue SPECIFIED et NOT_RUN, non exécuté |
| Contrats API / agents / modèles | Prompt maître, CDC section G | Inventaire et conventions à produire en P0-0/P0-A |
| Spécification MCP autonome | Mission, architecture section MCP | Section architecture seulement ; spécification à produire en P0-E |

Aucun de ces documents n'a été inventé. Les lacunes sont tracées dans le [rapport d'inauguration](INAUGURATION_REPORT.md).

## 6. Documents d'inauguration

| Fichier | Rôle |
|---|---|
| INAUGURATION_REPORT.md | État initial, inventaire, audit, roadmap, décisions ouvertes |
| adr/ | Décisions d'architecture et template |
| backlog/ROADMAP_V1.md | Feuille de route priorisée et matrice de traçabilité |
| backlog/P0_0_AUDIT_FONDATIONS.md | Proposition du premier lot technique |
| v2/README.md | Garde-fou V2 et points d'extension |
| reviews/ | Audit V0, preuves de tests, gaps V1 et baseline d'implémentation |

## 7. Vérification

Depuis la racine du dépôt :

    pwsh -File scripts/verify-foundation-docs.ps1
    pwsh -File scripts/check-secrets.ps1
