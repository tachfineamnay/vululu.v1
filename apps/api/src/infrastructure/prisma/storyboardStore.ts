import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  CharacterRecord,
  CharacterVersionRecord,
  StoryboardStore
} from '@vululu/application';
import type { StoryboardCharacterWrite, StoryboardSceneWrite } from '@vululu/application';

function mapCharacter(row: {
  id: string;
  projectId: string;
  characterKey: string;
  name: string;
  description: string;
  createdAt?: Date;
}): CharacterRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    characterKey: row.characterKey,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt
  };
}

function mapCharacterVersion(row: {
  id: string;
  characterId: string;
  version: number;
  name: string;
  description: string;
  checksum: string;
  createdAt: Date;
}): CharacterVersionRecord {
  return {
    id: row.id,
    characterId: row.characterId,
    version: row.version,
    name: row.name,
    description: row.description,
    checksum: row.checksum,
    createdAt: row.createdAt
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Ecriture atomique du storyboard :
 * - verrouille le projet en debut de transaction (update de statut) ;
 * - preserve l identifiant stable du personnage et des scenes existantes ;
 * - refuser une version de personnage concurrente (controle optimiste) ;
 * - cree CharacterVersion, Character, scenes et statut projet dans la meme
 *   transaction, donc aucun storyboard partiel ne peut exister.
 */
export class PrismaStoryboardStore implements StoryboardStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findCharacter(
    projectId: string,
    characterKey: string
  ): Promise<{ character: CharacterRecord; versions: CharacterVersionRecord[] } | null> {
    const row = await this.db.character.findUnique({
      where: { projectId_characterKey: { projectId, characterKey } },
      include: { versions: { orderBy: { version: 'desc' } } }
    });
    if (!row) {
      return null;
    }
    return {
      character: mapCharacter(row),
      versions: row.versions.map(mapCharacterVersion)
    };
  }

  async saveAtomic(input: {
    projectId: string;
    userId: string;
    projectStatus: string;
    character: StoryboardCharacterWrite;
    scenes: StoryboardSceneWrite[];
  }): Promise<void> {
    if (input.scenes.length === 0) {
      throw new ApplicationError('storyboard_empty', 'Un storyboard doit contenir au moins une scene.', 400);
    }
    const sceneKeys = new Set<string>();
    for (const scene of input.scenes) {
      if (sceneKeys.has(scene.sceneKey)) {
        throw new ApplicationError('storyboard_conflict', 'Cle de scene dupliquee dans le storyboard.', 409);
      }
      sceneKeys.add(scene.sceneKey);
    }
    try {
      await this.db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: input.projectId, userId: input.userId },
          select: { id: true, status: true }
        });
        if (!project) {
          throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
        }
        // Verrou conditionnel : serialise storyboard, brief et production.
        const locked = await tx.project.updateMany({
          where: { id: input.projectId, userId: input.userId, status: { not: 'producing' } },
          data: { status: input.projectStatus }
        });
        if (locked.count === 0) {
          throw new ApplicationError('project_busy', 'Le storyboard ne peut pas etre modifie pendant une production.', 409);
        }

        const existingCharacter = await tx.character.findUnique({
          where: {
            projectId_characterKey: {
              projectId: input.projectId,
              characterKey: input.character.characterKey
            }
          },
          include: { versions: { orderBy: { version: 'desc' } } }
        });
        const latestVersion = existingCharacter?.versions[0]?.version ?? null;
        if (latestVersion !== input.character.expectedVersion) {
          throw new ApplicationError(
            'storyboard_conflict',
            'Le personnage a change pendant la generation du storyboard.',
            409
          );
        }
        if (existingCharacter) {
          await tx.character.update({
            where: { id: existingCharacter.id },
            data: { name: input.character.name, description: input.character.description }
          });
        } else {
          await tx.character.create({
            data: {
              id: input.character.id,
              projectId: input.projectId,
              characterKey: input.character.characterKey,
              name: input.character.name,
              description: input.character.description
            }
          });
        }
        if (input.character.nextVersion !== null) {
          await tx.characterVersion.create({
            data: {
              id: input.character.nextVersion.id,
              characterId: input.character.id,
              version: input.character.nextVersion.version,
              name: input.character.name,
              description: input.character.description,
              checksum: input.character.nextVersion.checksum,
              createdAt: input.character.nextVersion.createdAt
            }
          });
        }

        for (const scene of input.scenes) {
          const existing = await tx.scene.findUnique({
            where: {
              projectId_sceneKey: { projectId: input.projectId, sceneKey: scene.sceneKey }
            },
            select: { id: true }
          });
          if (existing) {
            await tx.scene.update({
              where: { id: existing.id },
              data: {
                position: scene.position,
                title: scene.title,
                description: scene.description,
                // Une duree personnalisee existante est preservee.
                characterKey: scene.characterKey
              }
            });
          } else {
            await tx.scene.create({
              data: {
                id: scene.id,
                projectId: input.projectId,
                sceneKey: scene.sceneKey,
                position: scene.position,
                title: scene.title,
                description: scene.description,
                durationSeconds: scene.durationSeconds,
                characterKey: scene.characterKey
              }
            });
          }
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError('storyboard_conflict', 'Storyboard modifie de facon concurrente.', 409);
      }
      throw error;
    }
  }
}