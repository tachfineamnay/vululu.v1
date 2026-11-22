# ADR-0046 — Provenance des coûts et règle de règlement

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P12-01)
- **Sources** : ADR-0036 (exécution outillée), ADR-0045 (administration des coûts), `docs/delivery/P12-01_EXECUTION_COST_INTEGRITY.md`.

## Contexte

Trois défauts d'intégrité de coût coexistaient, constatés dans le code au HEAD `253ebc9` :

1. **Rognage silencieux** : `imageEditing/service.ts` et `audio/service.ts` renvoyaient `Math.min(result.costCents, job.maxCents)`. Un montant fournisseur au-dessus du plafond autorisé devenait un succès au plafond, sans trace du dépassement.
2. **Estimation affichée comme charge constatée** : les adaptateurs image, audio, assistant et marketing renvoient une **estimation configurée** (prix serveur, éventuellement appliqué à un usage de jetons) ; le broker l'enregistrait `REPORTED`, état que l'ADR-0045 qualifie de « charge confirmée » et que les synthèses `results`/`adminCosts` additionnent comme un montant vérifié.
3. **Appel payé requalifié en échec gratuit** : après une réponse fournisseur exploitable mais rejetée localement (sortie trop volumineuse, illisible, durée hors bornes), l'adaptateur renvoyait `failed` ; le broker libérait alors la réservation et enregistrait un coût nul.

Contraintes : ne modifier ni tarifs clients, ni produits de facturation, ni réglages Stripe, ni le gel bêta (`VULULU_BETA_MODE=1`) ; aucun appel fournisseur réel ; aucune migration destructive ; conserver les invariants de réservation, de règlement et de rapprochement de l'ADR-0045.

## Décision

1. **Provenance explicite** : `EngineOutcome` porte `costBasis` ∈ {`none`, `configured_estimate`, `provider_reported`} (plus `manual` pour la réconciliation humaine). Aucun moteur ne peut omettre sa provenance : `packages`/routes sont typés, et une provenance inconnue retombe sur `configured_estimate` (jamais `provider_reported`).
2. **Montant brut, jamais rogné** : les adaptateurs renvoient le montant tel qu'annoncé. Le plafond n'est pas appliqué par l'adaptateur mais par la règle de règlement.
3. **Règle unique de règlement** (`apps/api/src/infrastructure/execution/costBasis.ts`, `settlementFor`) : montant non entier, négatif ou **supérieur à `maxCents`** ⇒ jamais réglé ; sinon `provider_reported` → `REPORTED`, `configured_estimate` → `ESTIMATED`, `none` + 0 → `RELEASED`, `manual` → `RECONCILED`.
4. **Dépassement = incident** : compte gelé (`enabled: false`), audit `execution.invalid_provider_cost` (montant, provenance, plafond), état `UNKNOWN`, réservation **conservée**, sortie éventuelle persistée pour rapprochement.
5. **`ESTIMATED` + `SUCCEEDED`** est la forme persistée d'une estimation réglée : le budget est consommé (comptabilité de budget), le montant n'est **pas** une facture. Cette lecture précise le point 4 de l'ADR-0045, qui ne prévoyait que « proposition sans réservation » ; aucune valeur d'état n'est ajoutée (la contrainte SQL existante est conservée, aucune migration).
6. **Agrégations honnêtes** : `results` ne somme que `REPORTED`/`RECONCILED` et considère une estimation réglée comme un total incomplet (`pending`) ; `adminCosts` compte le montant estimé (ou le plafond à défaut) dans `estimatedCents` et n'ajoute aux `confirmedCents` par outil que `REPORTED`/`RECONCILED`.
7. **Appel payé non gratuit** : un échec postérieur à une réponse fournisseur renvoie `uncertain` (code + message) ; le broker enregistre un incident `execution.uncertain` et `UNKNOWN`, conserve la réservation. `failed` reste réservé aux échecs déterministes **avant** tout appel facturable.
8. **Rapprochement sans rejeu** : la sortie payée est conservée sur les chemins d'incident ; `recover()` ne réinvoke jamais un moteur pour une opération `CLAIMED` expirée ; la réconciliation humaine (`RECONCILED`, preuve obligatoire) garde la sortie et la rend applicable (`SUCCEEDED` ou `RESOLVED`).

## Conséquences

- **Positives** : un dépassement de plafond ne peut plus devenir un succès ; une estimation ne peut plus être comptée comme une facture ; un appel payé rejeté localement n'est plus effacé du budget ; les incidents restent réservés et rapprochables sans second appel fournisseur.
- **Négatives / coûts** : davantage d'incidents `UNKNOWN` visibles (ils correspondent à des dépenses réelles non vérifiées) ; un compte dont le fournisseur dépasse le plafond est gelé jusqu'à décision humaine ; les utilisateurs d'outils à estimation voient des coûts « estimés / à rapprocher » plutôt qu'un montant « confirmé ».
- **Exploitation** : `ESTIMATED` couvre désormais deux situations (proposition, estimation réglée) ; elles se distinguent par `state` et `reportedCents`. La couleur du coût dans l'interface web n'est pas encore différenciée (suivi documenté).
- **Sécurité / billing** : aucun tarif, produit Stripe, remboursement ni débit modifié ; aucune libération automatique d'une réservation incertaine ; aucun appel fournisseur dans la mission.

## Alternatives envisagées

- **Nouvel état `SETTLED_ESTIMATE`** : rejeté — impose une migration modifiant la contrainte `CHECK` (non additive) sans possibilité de la vérifier localement en P12-01.
- **Colonne `costBasis`** : rejeté pour la même raison (migration non vérifiable ici) ; la provenance est déjà déduite sans ambiguïté de `costState` + `state` + `reportedCents`, et journalisée dans l'audit.
- **Conserver le rognage et auditer le dépassement** : rejeté — le montant réel resterait masqué et le broker ne pourrait pas appliquer sa règle.
- **Libérer la réservation sur sortie inexploitable** : rejeté — masquerait une dépense probable.

## Références

- [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md)
- ADR-0036, ADR-0045
- [Preuves P12-01](../delivery/P12-01_EXECUTION_COST_INTEGRITY.md)
