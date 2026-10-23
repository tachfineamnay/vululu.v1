import {
  addCharacterVersion,
  characterContentChecksum,
  createCharacter,
  createStoryboard,
  type Character,
  type CharacterVersion,
  type Scene as DomainScene
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  AuditPort,
  BriefStore,
  Clock,
  IdGenerator,
  ProjectBundleQueryPort,
  ProjectBundleRecord,
  ProjectRepository,
  SceneRepository,
  StoryboardSceneWrite,
  StoryboardStore
} from '../ports';

const SCENE_TEMPLATES = [
  { title: 'Accroche', description: 'Une accroche visuelle forte qui capte l attention en moins de deux secondes.' },
  { title: 'Probleme', description: 'Le probleme concret du client, montre avec un detail credible.' },
  { title: 'Revelation produit', description: 'Le produit ou service au centre du plan, avec la promesse principale.' },
  { title: 'Preuve et benefices', description: 'Un benefice mesurable, une preuve ou un detail de confiance.' },
  { title: 'Appel a action', description: 'Une invitation claire a passer a l action, adaptee au reseau.' }
] as const;

const CHARACTER_KEY = 'CHAR-001';
const CHARACTER_NAME = 'Personnage A';
const CHARACTER_DESCRIPTION = 'Personnage principal recurrent du projet.';

/**
 * Use case storyboard atomique.
 *
 * - valide le brief et l etat du projet ;
 * - preserve les Scene.id et Character.id existants ;
 * - n ajoute une CharacterVersion que si le contenu change ;
 * - delegue a StoryboardStore.saveAtomic une transaction unique
 *   personnage + version + scenes + statut projet.
 */
export class StoryboardUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly briefs: BriefStore,
    private readonly scenes: SceneRepository,
    private readonly storyboards: StoryboardStore,
    private readonly bundle: ProjectBundleQueryPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditPort
  ) {}

  async generate(actor: Actor, projectId: string): Promise<ProjectBundleRecord> {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    if (project.status === 'producing') {
      throw new ApplicationError('project_busy', 'Le storyboard ne peut pas etre modifie pendant une production.', 409);
    }
    const brief = await this.briefs.findWithRevisions(projectId);
    if (!brief) {
      throw new ApplicationError('brief_required', 'Le brief doit etre enregistre avant le storyboard.', 400);
    }
    const existingScenes = await this.scenes.listByProject(projectId);
    const existingByKey = new Map(existingScenes.map((scene) => [scene.sceneKey, scene]));
    const created = createStoryboard({
      projectId,
      templates: SCENE_TEMPLATES.map((template) => ({
        ...template,
        durationSeconds: project.sceneDurationSeconds,
        characterKey: CHARACTER_KEY
      })),
      makeId: () => this.ids.next(),
      characterKey: CHARACTER_KEY
    });
    const scenes: StoryboardSceneWrite[] = created.map((scene) => {
      const existing = existingByKey.get(scene.sceneKey);
      return {
        id: existing?.id ?? scene.id,
        sceneKey: scene.sceneKey,
        position: scene.position,
        title: scene.title,
        description: scene.description,
        durationSeconds: scene.durationSeconds,
        characterKey: CHARACTER_KEY
      };
    });

    const existingCharacter = await this.storyboards.findCharacter(projectId, CHARACTER_KEY);
    const character: Character = createCharacter({
      id: existingCharacter?.character.id ?? this.ids.next(),
      projectId,
      characterKey: CHARACTER_KEY,
      name: CHARACTER_NAME,
      description: CHARACTER_DESCRIPTION
    });
    const existingVersions = (existingCharacter?.versions ?? []).map((version) => ({
      id: version.id,
      characterId: version.characterId,
      version: version.version,
      name: version.name,
      description: version.description,
      checksum: version.checksum,
      createdAt: version.createdAt.toISOString()
    })).sort((left, right) => left.version - right.version) satisfies CharacterVersion[];
    const latest = existingVersions[existingVersions.length - 1] ?? null;
    const checksum = characterContentChecksum({ name: character.name, description: character.description });
    const shouldAppend = latest === null || latest.checksum !== checksum;
    const appended = shouldAppend
      ? addCharacterVersion({
          character,
          versions: existingVersions,
          content: { name: character.name, description: character.description },
          id: this.ids.next(),
          createdAt: this.clock.now().toISOString()
        })
      : null;
    const nextVersion = appended
      ? {
          id: appended.version.id,
          version: appended.version.version,
          checksum: appended.version.checksum,
          createdAt: new Date(appended.version.createdAt)
        }
      : null;

    await this.storyboards.saveAtomic({
      projectId,
      userId: actor.id,
      projectStatus: 'storyboard_ready',
      character: {
        id: character.id,
        characterKey: character.characterKey,
        name: character.name,
        description: character.description,
        expectedVersion: latest?.version ?? null,
        nextVersion
      },
      scenes
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'storyboard.generated',
      targetType: 'project',
      targetId: projectId,
      metadata: { scenes: scenes.length, characterVersion: nextVersion?.version ?? latest?.version ?? 1 }
    });
    return this.bundle.getOwnedBundle(actor.id, projectId);
  }
}