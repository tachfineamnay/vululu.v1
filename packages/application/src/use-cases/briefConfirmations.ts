import { assertSha256Hex } from '@vululu/domain';
import type { Actor, AuditPort, BriefConfirmationStore, Clock, ProjectRepository } from '../ports';
import { assertOwned, ApplicationError } from '../errors';

export class BriefConfirmationUseCases {
  constructor(private readonly projects: ProjectRepository, private readonly confirmations: BriefConfirmationStore, private readonly audit: AuditPort, private readonly clock: Clock) {}
  async confirm(actor: Actor, projectId: string, version: number, checksum: string) {
    assertOwned(await this.projects.findOwned(projectId, actor.id), 'project_not_found', 'Projet introuvable.');
    if (!Number.isInteger(version) || version < 1) throw new ApplicationError('invalid_version', 'Version de brief invalide.', 400);
    assertSha256Hex(checksum);
    const result = await this.confirmations.confirmOwned({ projectId, userId: actor.id, version, checksum, confirmedAt: this.clock.now() });
    if (result.changed) await this.audit.record({ actorId: actor.id, action: 'brief.confirmed', targetType: 'project', targetId: projectId, metadata: { version, checksum } });
    return result.brief;
  }
}
