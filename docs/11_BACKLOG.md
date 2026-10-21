# Backlog de construction (épics, stories, DoD)
Chaque ticket : ID, périmètre, entrée/sortie, tests, preuve, coût/risque, dépendances. **Pas de développement parallèle du même objet de domaine**.

| Epic | Priorité | Livrables et tickets atomiques | Dépendance |
|---|---|---|---|
| E00 Audit & fondations | P0 | E00-01 audit du repo choisi ; 02 décision reuse/no reuse ; 03 architecture & migrations base ; 04 setup local/CI/secrets | start |
| E01 Identity | P0 | E01-01 invitations ; 02 activation ; 03 RBAC/isolation ; 04 UI super-admin | E00 |
| E02 Contextes V1 | P0 | E02-01 modèle/révisions ; 02 uploads/URLs sécurisés ; 03 agent débrief + validation ; 04 écran Mes contextes | E01 |
| E03 Wizard & Brief | P0 | E03-01 profils plateforme ; 02 options média ; 03 DA ; 04 voix/musique/mix ; 05 BriefRevision/version | E02 |
| E04 Core agentique | P0 | E04-01 AgentDefinition/Config ; 02 capability/provider/model ; 03 routeur/fallback ; 04 coûts/quotas ; 05 qualification/prompts/rollback | E00/E03 |
| E05 Durabilité | P0 | E05-01 Hatchet POC ; 02 JobSpec/JobRun/StepRun ; 03 retries/checkpoint ; 04 dependency invalidation | E04 |
| E06 Rendu | P0 | E06-01 image/mock+live ; 02 scène/character version ; 03 motion/vidéo ; 04 voix/audio/mix ; 05 masters/proxies/captions | E05 |
| E07 Contrôle & approbation | P0 | E07-01 QA technique/rights ; 02 previews/comments ; 03 approval exacte ; 04 correction SCENE-ID | E06 |
| E08 Postiz | P0 | E08-01 adapter + mapping ; 02 credential secure ; 03 handoff idempotent ; 04 rapport état/erreur | E07 |
| E09 MCP | P0 | E09-01 OAuth + scopes ; 02 tools de lecture ; 03 mutations/long runs ; 04 tests clients IDE/cloud ; 05 admin safe | E01–E08 |
| E10 Observabilité & release | P0 | E10-01 traces/audit/cost ; 02 backups/recovery ; 03 perf/sécurité ; 04 E2E/GO-NOGO | tout |
| E11 Ergonomie secondaire | P1 | templates créatifs supplémentaires, recherche avancée d'actifs, vues comparatives modèles | after P0 |

## Politique DoD pour chaque ticket
Code documenté et typé + migration si nécessaire + test unitaire + contract test + integration/e2e approprié + sécurité/RBAC vérifiés + traces/usage mesurés + manuel opérateur si fonctionnalité admin + pas de modification cachée des ADR. Si test live impossible, mock explicite avec LIMITATION signalée.

## Première verticale prioritaire
`super-admin invite → user crée BrandContext → wizard simple Instagram image → compile BriefRevision → JobSpec → Hatchet JobRun → routeur vers provider mock → ArtifactVersion → QA → approval → Postiz adapter mock → audit`. Ensuite brancher premier fournisseur réel et Postiz réel, puis vidéo scènes + audio. Le MCP de la même verticale doit être intégré dès le premier lot stable ; pas en option V2.
