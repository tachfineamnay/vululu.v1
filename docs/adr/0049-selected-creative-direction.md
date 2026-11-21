# ADR-0049 — Pointeur de direction artistique retenue et continuité du Studio

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P12-05)
- **Sources** : ADR-0035 (directions artistiques), ADR-0029 (composition/révisions), `docs/delivery/P12-05_SELECTED_CREATIVE_DIRECTION.md`.

## Contexte

Les décisions « retenue / écartée » n'existaient que comme événements d'audit. Aucune autorité serveur ne
disait quelle direction alimentait la composition éditable : l'éditeur chargeait la **révision la plus
récente** (`revs[0]`), donc silencieusement la dernière direction générée. L'interface annonçait même un
« pointeur définitif à l'étape suivante ». Conséquences : après avoir généré trois directions, rejeté l'une
et retenu une autre, le Studio pouvait éditer une direction non choisie ; l'édition d'une direction plus
ancienne était refusée (`creative_conflict`) car la sauvegarde exigeait la tête.

## Décision

1. **Pointeur propriétaire sur le projet** : `Project.selectedCreativeVersion` (+ `selectedCreativeAt`),
   colonnes nullables, migration strictement additive. Aucune duplication du modèle de révision.
2. **Sélection explicite uniquement** : `POST /api/projects/:id/creative/directions/select`
   (`{ version, expectedSelection }`), propriétaire vérifié par la requête. Aucune sélection implicite,
   aucune promotion automatique de la dernière direction générée.
3. **Transaction et concurrence** : verrou `SELECT … FOR UPDATE` sur la ligne `Project`, puis concurrence
   optimiste sur `expectedSelection` (état observé par le client). Deux choix concurrents : un seul passe,
   l'autre reçoit `409 direction_selection_conflict`.
4. **Contrôles d'exploitabilité** : la révision doit appartenir au projet (404 sinon), être une direction
   (`label` ou `origin`), ne pas être rejetée (`409 direction_rejected`), garder des sources disponibles,
   propriétaires et licites (`409 direction_not_usable`), et ne pas être périmée par rapport aux ressources
   confirmées (`409 direction_stale`, comparaison de l'empreinte de décision de ressources).
5. **Le Studio suit le pointeur** : l'éditeur charge `selectedCreativeVersion` ; si des directions existent
   sans sélection, il n'ouvre **aucune** composition et demande un choix explicite. Le repli sur la tête
   reste uniquement pour un projet sans aucune direction (studio historique).
6. **Édition sans destruction** : sauvegarder une composition part soit de la tête, soit de la direction
   retenue ; la nouvelle révision est toujours `tête + 1`, jamais un écrasement. Toute autre base reste
   `409 creative_conflict`. Éditer la direction retenue avance le pointeur vers la nouvelle révision dans
   la même transaction (continuité après rafraîchissement) ; éditer une autre révision ne le déplace pas.
7. **Historique complet conservé** : les révisions générées, affinées, combinées et rejetées restent toutes
   en base ; les décisions restent des événements d'audit (`creative.direction_decision`) et les sélections
   sont journalisées (`creative.direction_selected` avec version précédente et motif).
8. **Invalidation côté interface** : changer de direction remonte au parent, qui remonte l'éditeur (clé de
   composant) : aperçus, brouillon en mémoire et état d'approbation de l'ancienne composition ne sont plus
   affichés. Les approbations restent liées à leur révision exacte (aucune réutilisation croisée).

## Conséquences

- **Positives** : une seule autorité serveur pour la composition éditée ; plus de choix silencieux ; les
  décisions sont exploitables (rejet bloque la sélection) ; l'édition d'une direction ancienne est possible
  sans perdre les autres ; le rafraîchissement conserve le choix et le contenu.
- **Négatives / coûts** : une colonne de plus sur `Project` (nullable, additive) ; un aller-retour HTTP
  supplémentaire pour charger la sélection ; l'édition d'une base non retenue et non tête est refusée
  (comportement voulu, message explicite).
- **Sécurité** : toutes les lectures/écritures restent filtrées par `userId` ; aucune donnée d'un autre
  locataire ne peut être choisie ; aucune publication, aucun changement de coût.

## Alternatives envisagées

- **Table de sélections** : rejeté — duplication d'un pointeur unique, risque d'historique incohérent.
- **Réutiliser l'audit comme source de vérité** : rejeté — pas d'autorité transactionnelle ni de verrou.
- **Sélectionner implicitement la dernière direction générée** : rejeté — c'est précisément le défaut.
- **Forcer la sélection à la tête** : rejeté — interdirait de travailler une direction plus ancienne.

## Références

- ADR-0029, ADR-0035
- [Preuves P12-05](../delivery/P12-05_SELECTED_CREATIVE_DIRECTION.md)
