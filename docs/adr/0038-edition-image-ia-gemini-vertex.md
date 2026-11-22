# ADR-0038 — Édition d’image IA via Gemini Image (Vertex)

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Décideurs** : porteur produit + ingénierie Vululu (campagne P07)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0011 (artefacts immuables), ADR-0036 (exécution outillée), ADR-0037 (outils Python), mission P07.

## Contexte

Le produit doit éditer de **vraies images client** (arrière-plan, retrait d’objet, variation, amélioration) et générer de nouvelles images, sans écraser l’original, avec coûts, approbations et provenance. L’intégration Replicate existante (`media.image@1`) génère une image de scène dans le Studio ; elle ne couvre pas l’édition d’une ressource existante. Les outils Python de P06 fournissent masques et segmentation locales.

## Décision

1. **Adaptateur réel** `GeminiImageProvider` (`apps/api/src/infrastructure/imageEditing/providers.ts`) : appel Vertex AI `POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/gemini-2.5-flash-image:generateContent`, authentification ADC via `google-auth-library` (même mécanisme que l’assistant Vertex), `responseModalities: ['IMAGE']`, source et masque envoyés en `inlineData`, image renvoyée en `candidates[0].content.parts[].inlineData.data` (base64). Si le modèle rejette `imageConfig.aspectRatio`, un second essai **sans** ce champ est effectué avec le format indiqué dans l’instruction (aucun débit attendu sur un 400).
2. **Outillage broker conservé** : nouvel outil `media.image.edit@1` (`scope: project`, `GENERATE`, approbation humaine, plafond 8 ¢), proposé par un endpoint utilisateur (`/image-edits`), jamais par l’agent (`agentProposable: false`) tant que les droits et la source ne sont pas confirmés explicitement. La réservation, le claim unique, la réconciliation d’incidents et le worker Hatchet existants sont réutilisés.
3. **Coût** : estimation fixe configurable (`GEMINI_IMAGE_COST_CENTS`, défaut 4 ¢ ; tarif public ~0,039 USD/image), bornée par le plafond de l’outil (8 ¢). Aucun reçu fournisseur : le coût est une estimation documentée, jamais présentée comme un montant facturé vérifié.
4. **Édition par masque** : le modèle reçoit le masque comme seconde image et une instruction explicite ; ce n’est pas un paramètre « mask » formel de l’API. Le masque provient de préférence de `image.segment@1` (P06). Les capacités annoncent `supportsMaskPrompt: true`, jamais une garantie d’API.
5. **Issues ambiguës** : timeout, 5xx ou réponse illisible après envoi ⇒ `ImageProviderUncertain` ⇒ opération `UNKNOWN`, **jamais rejouée automatiquement**. Les rejets déterministes (droits, modération, quota, 400) ⇒ `FAILED` à coût nul. Aucune image n’est fabriquée ou inventée.
6. **Stockage et application** : sortie vérifiée (signature PNG/JPEG, inspection Sharp, dimensions ≤ 4096, taille ≤ 12 Mio) puis `AssetUseCases.upload` (version immuable, provenance fournisseur/modèle/opération/source/requête). L’original n’est jamais écrasé. « Appliquer à la composition » crée une **nouvelle révision Studio** (calque image), décision humaine distincte.
7. **Replicate préservé** pour le flux scène existant ; il n’est pas utilisé par le studio d’édition autonome (capacité annoncée `scene-flow-only`). Le service Python P06 reste utilisé pour masques/segmentation.

## Conséquences

- **Positives** : édition réelle d’images client, ratios sociaux, comparaison originale/éditée, versions et provenance, coûts bornés, aucun écrasement, UI et API prêtes pour d’autres fournisseurs.
- **Négatives / coûts** : fournisseur externe payant (désactivé par défaut, activable seulement avec credentials et autorisation) ; précision du masque dépend du prompt ; coût estimé non rapproché d’un reçu.
- **Sécurité** : droits confirmés par l’utilisateur, source/masque limités au propriétaire et à la marque, aucun URL client, aucun secret frontend, aucun essai payant automatique.

## Alternatives envisagées

- **Replicate pour l’édition** : rejeté faute d’adaptateur d’édition vérifié et de coûts/qualité validés ; l’intégration génération existante est conservée.
- **Sorties locales Stable Diffusion** : rejetées (hardware/licence/modèles non vérifiés en P07).
- **Écraser la version source** : interdit par l’immutabilité ADR-0011.
- **Annotation automatique par l’agent sans confirmation des droits** : rejetée (séparation recommandation/autorisation).

## Références

- Vertex AI generateContent et Gemini Image : [introduction Gemini 2.5 Flash Image](https://developers.googleblog.com/introducing-gemini-2-5-flash-image/), [tarifs Gemini API](https://ai.google.dev/gemini-api/docs/pricing), [exemple d’appel Vertex et extraction inlineData](https://blog.gdeltproject.org/using-nano-banana-pro-programmatically-via-the-gcp-vertex-api-to-create-images/).
- `apps/api/src/infrastructure/imageEditing/`, `apps/api/src/routes/imageEditing.ts`, `apps/web/components/ImageEditingPanel.tsx`, ADR-0011, ADR-0036, ADR-0037.
