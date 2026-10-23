import { assembleMaster, renderScene, runQa } from '@vululu/media';
import type {
  MasterRenderRequest,
  MasterRenderResult,
  MediaRendererPort,
  QaReport,
  SceneRenderRequest,
  SceneRenderResult
} from '@vululu/application';

/**
 * Adaptateur du port MediaRendererPort au-dessus de @vululu/media.
 *
 * Le rendu reste deterministe (SVG/Sharp pour les PNG, FFmpeg pour le master) :
 * ce n'est pas un modele generatif. Le parametre artifactRoot provient toujours
 * du port, afin que l'adaptateur ne fixe pas lui-meme la racine de stockage.
 */
export class MediaRendererAdapter implements MediaRendererPort {
  async renderScene(input: SceneRenderRequest): Promise<SceneRenderResult> {
    return renderScene(input);
  }

  async assembleMaster(input: MasterRenderRequest): Promise<MasterRenderResult> {
    return assembleMaster(input);
  }

  async runQa(scenes: SceneRenderResult[], master: MasterRenderResult): Promise<QaReport> {
    return runQa(scenes, master);
  }
}
