# ADR-0039 — Atelier visuel : canvas rendu par le serveur, historique local et brouillons

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Décideurs** : porteur produit + ingénierie Vululu (campagne P08)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0026 (composition native et texte intégral), ADR-0035 (directions = brouillons `CreativeRevision`), ADR-0038 (édition d'image), mission P08.

## Contexte

L'éditeur de composition existant expose la `CreativeSpec` sous forme de champs (calques, tailles, couleurs) dans une page de réglages. La mission P08 exige une vraie expérience d'édition : canvas central, sélection/déplacement/redimensionnement/alignement, inspecteur contextuel, aperçu fidèle, comparaison de révisions, brouillons reprenables après fermeture. Les invariants existants restent : révisions immuables côté serveur, concurrence par `expectedVersion`, validation du spec, approbation d'une version + checksum exacts, export depuis un rendu approuvé.

Le produit ne peut pas se permettre un second moteur de composition côté navigateur : un aperçu approximatif en DOM/Canvas exposerait des différences avec le rendu Sharp/FFmpeg et donnerait l'illusion d'un résultat final.

## Décision

1. **Un seul moteur de composition** : le canvas affiche l'image produite par `POST /api/projects/:id/creative/preview`, qui appelle exactement `creativeFrame` (Sharp), la même fonction que le rendu des scènes. Aucun aperçu approché n'est dessiné dans le navigateur ; pendant une actualisation, la dernière image exacte reste affichée et signalée « actualisation en cours ». Le mode commercial conserve le filigrane et la réduction déjà appliqués par la route existante.
2. **Boîtes de sélection en coordonnées normalisées** : l'interactivité (sélection Ctrl/Maj, déplacement groupé, huit poignées de redimensionnement, alignement, distribution, flèches ±0,5 %, Suppr, Échap) ne manipule que la `CreativeSpec` locale et ses calques ; le texte est borné à la zone sûre, les images au cadre. Les contrôles sont de vrais champs du contrat : aucun contrôle factice.
3. **Deux niveaux de brouillon explicites** :
   - **Révision serveur** = brouillon durable, immuable, avec concurrence `expectedVersion` ; « Enregistrer une nouvelle révision » en crée une et « Restaurer comme nouvelle révision » reprend une version antérieure sans écrasement.
   - **Copie locale de secours** (`apps/web/lib/studioDraftStore.ts`, `localStorage`, ≤ 200 Ko, validée par `creativeSpec.safeParse`, liée à la version de base) : uniquement contre une fermeture d'onglet accidentelle ; elle n'est jamais approuvable, jamais présentée comme enregistrée, et n'est proposée que si la version de base correspond à la révision affichée.
4. **Annuler/rétablir local** : pile de specs immuables côté client (`useStudioHistory`), un geste continu = un pas d'historique ; elle ne remplace pas l'historique serveur. Après sauvegarde, c'est l'historique des révisions qui fait foi.
5. **Comparaison visuelle** : deux révisions sont rendues par le même moteur (image de manifeste quand elle existe, sinon `/preview`) et comparées côte à côte ; le résumé des différences est calculé sur les specs (scènes, calques, palette, ressources) sans rien inventer.
6. **Contrats additifs uniquement** : `crop` (zoom 1–4, point de mire normalisé) sur un calque image, `align` (gauche/centre/droite) et `spacing` (interligne) sur un calque texte ; `creativeAssetApply` + route `POST /api/projects/:id/creative/asset` pour appliquer une ressource de marque existante (IA, Python ou importée) à un calque image via une **nouvelle révision**. Les specs stockées sans ces champs continuent de parser et de rendre à l'identique.
7. **Aucune nouvelle table ni migration** : les révisions, manifests, rendus durables, approbations et exports existants sont réutilisés.

## Conséquences

- **Positives** : fidélité aperçu/rendu, édition professionnelle réelle, brouillons reprenables, historique local réactif sans écritures serveur abusives, comparaison honnête, immutabilité et concurrence conservées.
- **Négatives / coûts** : l'aperçu dépend du serveur (débounce ~320 ms, rendu plafonné à deux requêtes simultanées) ; en mode commercial l'aperçu reste filigrané et réduit ; la copie locale est propre au navigateur et peut être effacée par le nettoyage de stockage ; la comparaison de deux révisions sans manifeste coûte un rendu d'aperçu par version.
- **Sécurité** : aucune URL client ni chemin de fichier dans les contrats ; les ressources restent validées par propriétaire/contexte/droits lors de la sauvegarde ; la route d'application de ressource refuse une version non image ou non possédée ; aucune route n'approuve ni n'exporte automatiquement.

## Alternatives envisagées

- **Composition client (Canvas/DOM) pour l'aperçu** : rejetée, second moteur divergent et fausse promesse de fidélité.
- **Enregistrement automatique à chaque geste côté serveur** : rejeté, écritures excessives, conflits de révision et historique gonflé ; remplacé par copie locale + sauvegarde explicite.
- **Undo/redo serveur via révisions négatives** : rejeté, détourne l'historique immuable et complique la concurrence.
- **Nouvelle table de brouillons** : rejetée, les révisions non approuvées sont déjà des brouillons (`CreativeRevision`) et couvrent la reprise multi-session.

## Références

- `apps/web/components/CreativeEditor.tsx`, `StudioCanvas.tsx`, `StudioInspector.tsx`, `StudioDelivery.tsx`, `StudioCompare.tsx`
- `apps/web/lib/studioGeometry.ts`, `studioChannels.ts`, `useStudioHistory.ts`, `studioDraftStore.ts`, `useStudioPreview.ts`
- `packages/contracts/src/creative.ts`, `packages/media/src/creativeFrame.ts`, `apps/api/src/routes/creative.ts`
- [Carte P01–P11](../implementation/VULULU_COMPLETION_PLAN.md), [inventaire courant](../implementation/VULULU_FEATURE_INVENTORY.md)
