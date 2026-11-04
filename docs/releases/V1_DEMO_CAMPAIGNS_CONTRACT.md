# V1-DEMO — Contrat campagnes

- Date : 2026-11-04 ; lot 5, première tranche indépendante.
- Références : PRD-16, CDC-F-013, CDC-N-001/005/007 ; E02.
- Architecture : domaine pur, cas d’usage partagés Web/MCP, repository Prisma avec filtrage propriétaire.

## Données et interfaces

Campaign : id stable, userId, name (2–160 caractères après trim), description (0–2000), createdAt. Un projet peut appartenir à zéro ou une campagne ; une campagne regroupe plusieurs projets du même propriétaire, éventuellement de contextes différents. Ce regroupement ne modifie ni brief, ni scène, ni run ou snapshot existant.

Routes authentifiées :

- GET /api/campaigns → { items: CampaignPublic[] } du seul propriétaire.
- POST /api/campaigns { name, description? } → 201 { campaign }.
- GET /api/campaigns/:id → { campaign, projects } du propriétaire, sinon 404.
- PUT /api/projects/:id/campaign { campaignId: string | null } → { projectId, campaignId } ; null retire le regroupement sans effacer le projet.

CampaignPublic exclut userId. Aucun rôle ne permet de lire la campagne d’un tiers sans partage (hors périmètre V1). Création et affectation sont auditées ; l’affectation répétée au même groupe conserve une seule relation. CSRF obligatoire sur les mutations. Le repository revalide les deux propriétaires dans une transaction pour éviter qu’un appel direct à l’adaptateur contourne le cas d’usage.

## Recette

Créer une campagne, relire après rechargement, rattacher deux projets, déplacer et retirer un projet. Vérifier liste/détail/affectation entre deux utilisateurs, refus sans session ou CSRF, validation des longueurs et absence de fuite de champs propriétaires. Vérifier que l’ancien projet reste intact après migration additive et qu’un run existant n’est pas altéré par son regroupement.

Le seed démo ajoutera une campagne fictive sans écraser une affectation existante. Pas de suppression de campagne ni de purge automatique dans cette tranche ; la rétention reste le lot 11. Les actifs de marque sont une tranche distincte du même lot et ne sont pas déclarés livrés ici.
