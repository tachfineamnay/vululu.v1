import { renderScene } from '@vululu/media';
import type { ProviderPort, SceneRenderRequest, SceneRenderResult } from '@vululu/application';

/**
 * Nom contractuel du provider deterministe local.
 * Il ne doit jamais etre presente comme un modele d'IA.
 */
export const DETERMINISTIC_PROVIDER_NAME = 'local-deterministic';

/**
 * Adaptateur ProviderPort deterministe, MOCK CONTRACTUEL.
 *
 * Il enveloppe le renderer SVG/Sharp de @vululu/media : meme entree, meme
 * sortie, aucun appel reseau, aucun modele d'IA, aucun cout. Il sert a tester
 * le contrat ProviderPort et le parcours de production en attendant un
 * provider reel (V1-02). Toute affirmation de generation IA serait fausse.
 */
export class DeterministicProviderAdapter implements ProviderPort {
  readonly name = DETERMINISTIC_PROVIDER_NAME;

  async generateScene(input: SceneRenderRequest): Promise<SceneRenderResult> {
    return renderScene(input);
  }
}
