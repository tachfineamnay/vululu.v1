# P12-05 — Persistance de la direction artistique retenue

**Lot :** P12-05 · **Branche :** `campaign/vululu-completion` · **Base :** `57b8970`.
**Date :** 2026-11-21. **Statut :** code compilé (API + Web), règles de sélection **exécutées** (sonde 12 cas),
schéma/migration validés. Tests Vitest (base de données) **NOT_RUN** : PostgreSQL absent (§5). Aucun appel
fournisseur, aucune publication.

Décision : [ADR-0049](../adr/0049-selected-creative-direction.md).

---

## 1. Constat (avant correction, HEAD `57b8970`)

| # | Défaut | Preuve dans le code |
|---|---|---|
| 1 | Aucune autorité serveur sur la direction retenue | `retained/rejected` n'existaient que dans `AuditEvent` (`creativeDirectionRepository.decisions`) |
| 2 | Le Studio chargeait la révision la plus récente | `CreativeEditor.tsx` : `revs[0]?.version` (head) |
| 3 | L'interface annonçait un pointeur « à l'étape suivante » | `ArtDirections.tsx` : « le pointeur définitif arrive à l'étape suivante » |
| 4 | Éditer une direction plus ancienne était impossible | `creativeRepository.append` exigeait `expectedVersion === tête` ; `routes/creative.ts#scoped` aussi |
| 5 | Aucune protection contre deux sélections concurrentes | aucune notion de sélection |

## 2. Implémentation

1. **Schéma additif** : `Project.selectedCreativeVersion Int?` et `Project.selectedCreativeAt DateTime?` +
   migration `20261122160000_creative_direction_selection` (deux `ALTER TABLE … ADD COLUMN`, aucune
   instruction destructive).
2. **Contrat** : `directionSelectionInput = { version, expectedSelection }` (`packages/contracts`).
3. **Règles pures** `application/directionSelection.ts` : conflit, rejet, exploitabilité, péremption —
   ordre déterministe et testable sans base.
4. **Sélection transactionnelle** : verrou `FOR UPDATE` sur `Project`, concurrence optimiste sur
   `expectedSelection`, contrôles d'appartenance/type/rejet/exploitabilité/péremption, mise à jour du
   pointeur et audit `creative.direction_selected`.
5. **Route** : `POST /api/projects/:id/creative/directions/select` (auth propriétaire).
6. **Studio piloté par le pointeur** : `CreativeEditor` charge `selectedVersion` ; si des directions
   existent sans sélection, il affiche un choix explicite (aucune composition chargée). Le repli sur la
   tête ne subsiste que pour un projet sans aucune direction.
7. **Édition non destructive** : une sauvegarde part de la tête **ou** de la direction retenue ; la nouvelle
   version est `tête + 1` ; éditer la direction retenue avance le pointeur dans la même transaction ;
   éditer une autre révision ne le déplace pas ; toute autre base reste `409 creative_conflict`.
8. **Interface** : bouton « Choisir cette direction » (désactivé si rejetée/déjà choisie), badge
   « Composition du Studio », textes honnêtes, remontée `onSelected` vers `ProjectStudio` qui remonte
   l'éditeur (invalidation des aperçus/brouillons/approbations affichés de l'ancienne composition).
9. **Historique** : aucune révision supprimée ni modifiée ; décisions toujours en audit ; sélections
   journalisées avec version précédente et motif (`selected` ou `edited`).

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur (après `prisma generate`) | PASS |
| `tsc --noEmit -p apps/web/tsconfig.json` | 0 | 0 erreur | PASS |
| `eslint` sur les 10 fichiers touchés | 0 | 0 erreur | PASS |
| `prisma validate` | 0 | schéma valide | PASS |
| Structure des migrations (40 dossiers, `migration.sql` présent partout) | — | vérifié par script Node (équivalent de `check-migrations.ps1`, NON exécutable ici) | PASS (équivalent) |
| Migration P12-05 (analyse instruction par instruction) | — | 2 `ALTER TABLE … ADD COLUMN`, aucune instruction destructive | PASS |
| Sonde compilée `directionSelection.ts` + Node | 0 | `DIRECTION_SELECTION_PROBE_PASS cases=12` | PASS |

La sonde exécute la règle compilée : sélection acceptable, première sélection, conflit (pointeur plus récent
et pointeur vidé), rejet refusé, direction retenue acceptée, révision non exploitable, péremption des
ressources, absence d'empreinte (pas de faux positif), priorité conflit > rejet > exploitabilité > péremption.

## 4. Tests ajoutés (écrits, non exécutés ici)

`tests/v1/creative-direction-selection.test.ts` (9 cas, PostgreSQL requis) : choix conservé après relecture,
autres directions intactes, rejet refusé puis autre direction acceptée, propriétaire différent ignoré (404),
deux sélections concurrentes (une seule gagne), ressources confirmées périmées refusées, révision non
direction refusée, édition de la direction choisie (pointeur → v4, historique v1..v4 avec libellés intacts),
édition d'une autre révision sans déplacement du pointeur, base périmée refusée sans écrasement.

**Scénario d'acceptation** (générer 3 → rejeter 1 → en choisir une autre → ouvrir le Studio → éditer →
rafraîchir) est couvert par ces cas : sélection ⇒ `selectedVersion` ⇒ chargement de cette révision ⇒
sauvegarde `tête + 1` avec pointeur avancé ⇒ relecture de `selectedVersion` après « rafraîchissement ».

## 5. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| `vitest run tests/v1/creative-direction-selection.test.ts` | PostgreSQL `127.0.0.1:55432` absent **et** `esbuild`/`spawn EPERM` dans cette session | NOT_RUN |
| Application de la migration (`prisma migrate deploy`) | même absence de base | NOT_RUN |
| `scripts/check-migrations.ps1` | runner `pwsh` indisponible (`CreateProcessAsUserW` échoue) | NOT_RUN (contrôle équivalent exécuté en Node) |
| E2E navigateur du scénario | Playwright non exécutable ici | NOT_RUN |

**Limites assumées :** la concurrence est prouvée par la règle pure et par le verrou SQL écrit, mais pas
rejouée sur une vraie base ici ; la migration est additive et validée par `prisma validate` + analyse des
instructions, sans application réelle ; l'invalidation côté interface est un remontage de composant, pas une
purge de cache serveur (il n'existe aucun cache serveur d'aperçu).

## 6. Rollback

`git revert <sha>` ramène le code à `57b8970`. La migration étant additive, la colonne peut rester sans
effet ; un retour arrière de la base se ferait par une nouvelle migration additive (aucun `DROP` dans ce lot).
