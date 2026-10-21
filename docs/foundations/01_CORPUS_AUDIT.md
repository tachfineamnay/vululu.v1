# 01 — Audit du corpus et des fondations

- **Version** : 1.0
- **Date** : 2026-10-21
- **Mission** : Mission 01 — consolider les fondations sans réinaugurer
- **Statut** : audit documentaire, aucun code
- **Base** : main 69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50
- **Branche** : mission-01-foundations
- **Sources** : [PRD V1.2](../01_PRD_V1.md), [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), [Architecture V1](../03_ARCHITECTURE_V1.md), [Backlog](../11_BACKLOG.md), [Rapport d'inauguration](../INAUGURATION_REPORT.md), [Index documentaire](../README.md), [SHA256SUMS](../source/SHA256SUMS.txt)

## 1. Objet et méthode

Constater l'état réel du dépôt après la Mission 00, inventorier les fichiers suivis, vérifier l'intégrité des neuf sources importées, identifier les écarts entre le récit de la Mission 00 et le dépôt, inventorier les documents manquants et les contrats à produire, et consigner les hypothèses.

Méthode : lecture seule de Git, des documents, des branches et des hashes ; aucune modification des neufs sources ; aucune reconstitution du pack initial.

## 2. État Git constaté

| Élément | Constat |
|---|---|
| Branche de base | main |
| HEAD de base | 69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50 |
| Commits de base | c807918 inauguration, 69c6549 correction du rapport |
| Fichiers suivis sur main | 29 |
| origin/main | 69c6549, distant public |
| Branche M01 | mission-01-foundations, créée depuis main |
| Travail non mergé | mission-01-doc-consolidation 7147c6b ; mission-02-ux0 779e4e1 |
| Worktree de départ | propre |
| Remotes | origin uniquement |

Le SHA de base est une référence historique. Les travaux des branches non mergées ne sont pas considérés comme validés.

## 3. Inventaire des 29 fichiers suivis

| # | Fichier | Catégorie | Statut |
|---|---|---|---|
| 1 | .env.example | Configuration | Présent |
| 2 | .gitattributes | Configuration | Présent |
| 3 | .gitignore | Configuration | Présent |
| 4 | AGENTS.md | Instructions agents | Présent |
| 5 | README.md | Présentation | Présent |
| 6 | docs/01_PRD_V1.md | Source verbatim | Présent, hash vérifié |
| 7 | docs/02_CAHIER_DES_CHARGES_V1.md | Source verbatim | Présent, hash vérifié |
| 8 | docs/03_ARCHITECTURE_V1.md | Source verbatim | Présent, hash vérifié |
| 9 | docs/11_BACKLOG.md | Source verbatim | Présent, hash vérifié |
| 10 | docs/INAUGURATION_REPORT.md | Rapport Mission 00 | Présent |
| 11 | docs/PROMPT_DEEPSEEK_HARNESS.md | Source verbatim | Présent, hash vérifié |
| 12 | docs/README.md | Index documentaire | Présent |
| 13 | docs/adr/0001-monolithe-modulaire-et-domain-core.md | ADR | Présent |
| 14 | docs/adr/0002-postgresql-source-de-verite-et-s3.md | ADR | Présent |
| 15 | docs/adr/0003-hatchet-port-orchestration-durable.md | ADR conditionnelle | Présent |
| 16 | docs/adr/0004-mcp-meme-domaine-entree-differente.md | ADR | Présent |
| 17 | docs/adr/0005-postiz-transfert-apres-approbation.md | ADR | Présent |
| 18 | docs/adr/README.md | Index ADR | Présent |
| 19 | docs/adr/template.md | Modèle ADR | Présent |
| 20 | docs/backlog/P0_0_AUDIT_FONDATIONS.md | Backlog P0-0 | Présent |
| 21 | docs/backlog/ROADMAP_V1.md | Roadmap | Présent |
| 22 | docs/source/SHA256SUMS.txt | Empreintes sources | Présent |
| 23 | docs/source/VULULUIA_CDC_V1_2.docx | Source originale | Présent |
| 24 | docs/source/VULULUIA_NOTE_V2_PROPOSITIONS.docx | Source originale | Présent |
| 25 | docs/source/VULULUIA_PRD_V1_2.docx | Source originale | Présent |
| 26 | docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md | Source verbatim V2 | Présent, hash vérifié |
| 27 | docs/v2/README.md | Garde-fou V2 | Présent |
| 28 | scripts/check-secrets.ps1 | Script validation | Présent |
| 29 | scripts/verify-foundation-docs.ps1 | Script validation | Présent |

## 4. Intégrité des neuf sources importées

| Fichier | SHA256 | Taille | Statut |
|---|---|---|---|
| docs/01_PRD_V1.md | 2e94370887298f08eb695017c9260b7395e82adf073dae3c7e1eb2c22ecd725a | 8 938 | Vérifié |
| docs/02_CAHIER_DES_CHARGES_V1.md | 6b220a4c597bb878512f803a78175bf472aee5fdbc0814f70db17adbf70bc95b | 8 907 | Vérifié |
| docs/03_ARCHITECTURE_V1.md | 194644c0a573837551eb17b519c042c79b0504362c629644377004eafca1a12f | 5 886 | Vérifié |
| docs/11_BACKLOG.md | 4fa387ef8e36d33c4ebaefa9615af060aed000ac469bdb7423375dc7145f6000 | 2 816 | Vérifié |
| docs/PROMPT_DEEPSEEK_HARNESS.md | d2f00491e222f562484740a4ef482dd39d07693f8d8a9a895b641d51cde69833 | 3 449 | Vérifié |
| docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md | 61131e4f449003464eb8ec5740dd6dc27eb740d4486a041b768392e15b10e0fd | 5 645 | Vérifié |
| docs/source/VULULUIA_PRD_V1_2.docx | 48e35d0cfb4699f68613bc9851afae78712de9f239737ab9579d38df977bc513 | 41 757 | Vérifié |
| docs/source/VULULUIA_CDC_V1_2.docx | 6b67a584e24f28ebed3bef3f6a80b280c800ad326fd733cfeb6dfda12233c78c | 42 518 | Vérifié |
| docs/source/VULULUIA_NOTE_V2_PROPOSITIONS.docx | 52e91744b869b6a1fbd00c53a923d1aa312203d3ed87e15fd26fe3c911dbac06 | 40 331 | Vérifié |

Commande de contrôle :

    pwsh -NoProfile -File scripts/verify-foundation-docs.ps1

Résultat au moment de l'audit : HASHES_OK=9, FOUNDATION_CHECK_PASS.

## 5. Sources importées et pack initial

| Élément | Constat |
|---|---|
| Pack annoncé | 45 fichiers |
| Sources confirmées dans le dépôt | 9 fichiers (6 markdown, 3 docx) |
| Le dépôt prétend-il que les 9 sont exhaustifs ? | Non ; le rapport dit que le pack nommé était absent et que le corpus a été reconstitué depuis les fichiers reçus |
| Reconstitution des 36 fichiers manquants | Interdite dans cette mission |
| Conséquence | Les 9 sources sont le corpus effectivement importé, pas nécessairement le corpus exhaustif |

## 6. Écarts constatés entre le récit Mission 00 et le dépôt

| ID | Constat | Sévérité | Traitement |
|---|---|---|---|
| F-01 | Le pack initial de 45 fichiers n'est pas intégralement importé ; 9 sources seulement | Majeure | Constat, pas de reconstitution |
| F-02 | Le rapport Mission 00 annonce 29 fichiers ; le dépôt en contient bien 29 | Aucun écart | Vérifié |
| F-03 | Les branches mission-01-doc-consolidation et mission-02-ux0 contiennent du travail non mergé, non mentionné dans le rapport | Majeure | Inventaire, travail conservé |
| F-04 | docs/10_ACCEPTANCE_TESTS.md est absent de main ; il est produit en M01 | Résolue en M01 | Livrable M01 |
| F-05 | docs/04_DECISIONS_ADR.md est référencé par le prompt maître mais absent ; docs/adr/ le remplace opérationnellement | Moyenne | Documenté |
| F-06 | Contrats API/agents/modèles, spec MCP, docs média/sécurité/agentique absents | Majeure | Planifiés M05, M06, M08, M09 |
| F-07 | docs/README.md et README.md décrivent encore l'état Mission 00 | Moyenne | Mise à jour ultérieure, hors M01 |
| F-08 | docs/11_BACKLOG.md est verbatim ; la roadmap UX-0 doit être un addendum séparé | Moyenne | docs/backlog/UX0_ADDENDUM.md |
| F-09 | Le dépôt est public | Risque externe | D-01, aucune donnée sensible |
| F-10 | _inbox/ contient un HTML externe ignoré, non publié | Faible | Hors dépôt versionné |

## 7. Travaux non mergés

| Branche | Commit | Contenu | Statut |
|---|---|---|---|
| mission-01-doc-consolidation | 7147c6b | docs/10_ACCEPTANCE_TESTS.md partiel, 42 tests | Non validé ; utilisé comme entrée M01 |
| mission-02-ux0 | 779e4e1 | Six documents UX-0 | Non validé ; à intégrer en M02 |

Aucune de ces branches n'est mergée dans main. Aucun rebase, cherry-pick ou merge automatique n'est effectué.

## 8. Documents manquants et contrats à documenter

| Contrat ou document | Couvre | Statut actuel | Mission prévue |
|---|---|---|---|
| Contrats API HTTP | REST, erreurs, pagination, idempotence | Absent | M05 |
| Contrats agents et prompts | AgentDefinition, AgentConfigVersion, promotion | Absent | M06 |
| Contrats modèles et providers | Capability, Provider, Model, fallback | Absent | M06 |
| Contrats briefs | BriefRevision, hash, confirmation | Absent | M05 |
| Contrats assets et artefacts | ArtifactVersion, checksum, provenance | Absent | M05 |
| Contrats MCP | outils, auth, scopes, erreurs | Absent | M08 |
| Contrat Postiz | handoff, idempotence, états | Absent | M09 |
| Contrats run et étapes | ProductionRun, StepRun, checkpoints | Absent | M05 |
| Contrats scène et personnage | Scene, SceneVersion, CharacterVersion | Absent | M05 |
| Contrats approbation et transfert | Approval, TransferRecord | Absent | M05, M09 |
| Contrats coûts et audit | CostRecord, AuditEvent | Absent | M05, M09 |
| Spec média et audio | formats, mix, licences | Absent | M09 |
| Threat model et RBAC | sécurité, MCP, IDOR | Absent | M08 |

## 9. Journal des hypothèses

| ID | Hypothèse | Impact | Vérification |
|---|---|---|---|
| H-01 | Les 9 sources sont le corpus effectif, pas le pack exhaustif | Traçabilité | Confirmation porteur |
| H-02 | Le pack de 45 fichiers ne sera pas reconstitué | Périmètre | Décision M01 |
| H-03 | La stack TS full-stack est la direction proposée | Architecture | M04 |
| H-04 | Hatchet est utilisable en local sans compte payant | POC | M07 |
| H-05 | Postiz expose une API documentée pour le handoff | Intégration | M09 |
| H-06 | Un stockage S3-compatible peut être choisi sans migration lourde | Infra | M04/M09 |
| H-07 | Les capacités réelles des providers seront vérifiées à date | Contrats | M06 |
| H-08 | Le VPS partagé a une capacité mesurable, non garantie | Exploitation | M04 |
| H-09 | Les clients MCP IDE/cloud supportent l'auth retenue | Sécurité | M08 |
| H-10 | La direction visuelle n'est pas encore choisie | Frontend | M03 |
| H-11 | Le canal d'invitation n'est pas encore décidé | UX/backend | M02/M04 |
| H-12 | Devise, budgets et rétention ne sont pas fixés | Coûts/conformité | M04/M08/M09 |

## 10. Constats de synthèse

- Le dépôt est cohérent avec la Mission 00 sur les 29 fichiers et les hashes.
- Le pack initial n'est pas exhaustif ; il faut le dire sans le reconstruire.
- Des travaux UX et tests existent hors main ; ils sont conservés et intégrés par les missions suivantes.
- Les contrats, la sécurité, le média et Postiz restent à documenter.
- Le dépôt public impose une revue de visibilité avant tout push.
- Aucune fonctionnalité V1 ou V2 n'est codée.

## 11. Verdict M01

**PARTIAL** : l'audit et l'inventaire sont complets, mais le corpus reste partiel (9 sources sur un pack annoncé de 45) et plusieurs contrats sont encore absents. Ce verdict est normal pour une mission de consolidation documentaire ; il ne bloque pas la suite documentaire, mais il bloque toute affirmation d'exhaustivité du corpus.

## 12. Preuves

    git rev-parse main
    git ls-files | Measure-Object
    pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
    git ls-remote origin refs/heads/main

## 13. Références

- [Matrice de traçabilité](01_TRACEABILITY_MATRIX.md)
- [Registre des décisions](01_DECISION_REGISTER.md)
- [Tests d'acceptation](../10_ACCEPTANCE_TESTS.md)
- [Addendum UX-0](../backlog/UX0_ADDENDUM.md)
- [Addendum V2](../v2/ADDENDUM_MODES_SIMPLE_STUDIO_PRO.md)
