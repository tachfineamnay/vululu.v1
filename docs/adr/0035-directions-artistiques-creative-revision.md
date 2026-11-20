# ADR-0035 — Directions artistiques comme brouillons `CreativeRevision`

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Décideurs** : porteur produit + ingénierie Vululu (campagne P04)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), [carte P01–P11](../implementation/VULULU_COMPLETION_PLAN.md) (P04), ADR-0029 (composition et révisions), ADR-0030 (livraisons créatives), ADR-0034 (assistant Vertex).

## Contexte

Le brainstorming (P03) produit des pistes créatives structurées (titre, raisonnement, prémisse, ressources). P04 doit les transformer en **directions artistiques persistantes, comparables et éditables**, sans réécrire le socle créatif existant.

Le socle possède déjà un objet versionné, immuable et éditable : `CreativeRevision` (`CreativeSpec` versionné, manifeste, approbation exacte, rendu Sharp/FFmpeg, historique append-only). Introduire une entité `ArtDirection` séparée dupliquerait le versionnement, l'immutabilité, la provenance, la concurrence optimiste et l'approbation, sans besoin technique démontré.

## Décision

Une direction artistique est un **brouillon `CreativeRevision`** enrichi de métadonnées additives nullables :

| Colonne | Type | Rôle |
|---|---|---|
| `label` | `String?` | Libellé lisible de la direction (« Preuve visuelle · Éditorial »). |
| `origin` | `String?` | Mode de production : `generated`, `refined`, `alternative`, `combined`. |
| `provenance` | `Json?` | Références exactes : `requestId`, `mode`, `brainstormTurnId`, `angleIndex`, `baseVersion`, `combineFrom`, `assetDecisionDigest`, `concept`, `schemaVersion`, `generatedAt`. |

### Invariants

1. **Append-only** : une direction est une nouvelle révision ; aucune version existante n'est modifiée ou supprimée. Un rejet n'efface rien (l'historique reste lisible).
2. **Immutabilité et concurrence optimiste** : l'écriture passe par le verrou projet + `expectedVersion` déjà utilisés par `CreativeStudio.save` ; un conflit renvoie `creative_conflict`.
3. **Provenance exacte** : chaque direction référence projet, version de révision, identifiant de tour de brainstorming, version(s) de base ou de combinaison, et le digest de la décision de ressources (P02) au moment de la génération.
4. **Aucune approbation implicite** : une direction n'est pas une publication ni une version approuvée ; l'approbation exacte (version + checksum) reste un acte humain distinct (P07), et le choix de direction autoritatif est ajouté en P05 (`Project.selectedCreativeVersion`).
5. **Éditable** : la direction ouvre l'éditeur Studio existant (reprise/restauration), pas un éditeur parallèle.
6. **Assets confirmés uniquement** : les images/logos/clips utilisés proviennent de la sélection confirmée (P02) ; les directions sans ressource sont des compositions typographiques explicites, jamais une image inventée.
7. **Rendu réel** : les aperçus utilisent Sharp/FFmpeg (route `/creative/preview`) ; aucun mockup illustratif n'est présenté comme média final.

## Conséquences

- **Positives** : une seule infrastructure de versions/provenance/approbation ; pas de duplication de modèle ni de migration lourde ; l'éditeur, l'export et l'approbation continuent de fonctionner sur les directions ; le choix humain (P05) est un pointeur, pas une nouvelle table.
- **Négatives / coûts** : `CreativeRevision` porte deux usages (composition manuelle et direction générée) distingués par `origin`/`provenance` ; les listes existantes doivent exposer ces champs additifs ; un mode « direction » non choisi reste dans l'historique (voulu).
- **Sécurité / données** : aucune nouvelle table, aucune donnée client supplémentaire ; les métadonnées ne contiennent ni URL ni secret ; les identifiants de ressources restent des versions d'assets déjà contrôlées par propriétaire et contexte.

## Alternatives envisagées

- **Nouvelle entité `ArtDirection` + `ArtDirectionVersion`** : rejetée — duplique versionnement/immutabilité/approbation, complexifie le Studio et l'export, sans besoin bloquant démontré.
- **Étendre `CreativeSpec`** : rejetée — `CreativeSpec` est le contenu rendu (schéma strict validé) ; y mettre des métadonnées de direction casserait les digests et le manifeste.
- **Stockage JSON hors révisions** : rejetée — pas d'historique versionné, pas de concurrence optimiste, pas de lien direct à l'éditeur.

## Références

- `apps/api/src/application/creative.ts` (CreativeStudio, révisions append-only)
- `apps/api/src/infrastructure/prisma/creativeRepository.ts`
- `packages/contracts/src/creative.ts`, `packages/contracts/src/compositionGuide.ts`
- ADR-0029, ADR-0030, [P04](../implementation/VULULU_COMPLETION_PLAN.md)
