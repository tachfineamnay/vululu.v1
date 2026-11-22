import type { CreativeSpec } from '@vululu/contracts';

/**
 * P09B — spec envoyée au compositeur d'aperçu de scène (`POST /creative/preview`).
 *
 * Le serveur valide la spec complète après l'avoir réduite à une seule scène : les règles
 * transverses sur l'audio s'appliquent alors à la durée de CETTE scène. Une composition
 * vidéo dont les sous-titres dépassent la scène 1 était donc refusée à l'aperçu (400
 * « Un sous-titre dépasse la durée totale de la vidéo »), alors que l'image fixe ne dessine
 * ni mixage ni incrustation. On retire donc l'audio pour l'aperçu de scène : c'est exact,
 * puisque le rendu de l'image ne le consomme pas.
 */
export function previewSpecForScene(
  spec: CreativeSpec,
  scene: CreativeSpec['scenes'][number]
): CreativeSpec {
  const { audio: _audio, ...rest } = spec;
  void _audio;
  return { ...rest, scenes: [scene] };
}
