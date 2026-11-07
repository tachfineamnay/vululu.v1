import { ApplicationError } from '../errors';
import type {
  Actor,
  AdminAuditQuery,
  AdminCostQuery,
  AdminCostsRecord,
  AdminPageInput,
  AdminPageRecord,
  AdminProjectRecord,
  AdminQueryPort,
  AdminRoutingDecisionRecord,
  AdminRunDetailRecord,
  AdminRunQuery,
  AdminRunRecord,
  AdminRuntimeRecord,
  AdminUserRecord,
  AdminOverviewRecord,
  AdminAuditEventRecord
} from '../ports';

function assertAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') {
    throw new ApplicationError('forbidden', 'Acces reserve au super administrateur.', 403);
  }
}

/**
 * Lectures agregees d'administration. Aucune ecriture metier ici : les
 * mutations passent par les use cases existants (invitations, agents,
 * providers, routage, sessions, reconciliation).
 */
export class AdminQueryUseCases {
  constructor(private readonly queries: AdminQueryPort) {}

  async overview(actor: Actor): Promise<AdminOverviewRecord> {
    assertAdmin(actor);
    return this.queries.overview();
  }

  async listUsers(actor: Actor, input: AdminPageInput): Promise<AdminPageRecord<AdminUserRecord>> {
    assertAdmin(actor);
    return this.queries.listUsers(input);
  }

  async listProjects(actor: Actor, input: AdminPageInput): Promise<AdminPageRecord<AdminProjectRecord>> {
    assertAdmin(actor);
    return this.queries.listProjects(input);
  }

  async listRuns(actor: Actor, input: AdminRunQuery): Promise<AdminPageRecord<AdminRunRecord>> {
    assertAdmin(actor);
    return this.queries.listRuns(input);
  }

  async getRun(actor: Actor, jobRunId: string): Promise<AdminRunDetailRecord> {
    assertAdmin(actor);
    const detail = await this.queries.getRun(jobRunId);
    if (!detail) {
      throw new ApplicationError('job_run_not_found', 'Run introuvable.', 404);
    }
    return detail;
  }

  async listAudit(actor: Actor, input: AdminAuditQuery): Promise<AdminPageRecord<AdminAuditEventRecord>> {
    assertAdmin(actor);
    return this.queries.listAudit(input);
  }

  async listCosts(actor: Actor, input: AdminCostQuery): Promise<AdminCostsRecord> {
    assertAdmin(actor);
    return this.queries.listCosts(input);
  }

  async listRoutingDecisions(actor: Actor, input: AdminPageInput): Promise<AdminPageRecord<AdminRoutingDecisionRecord>> {
    assertAdmin(actor);
    return this.queries.listRoutingDecisions(input);
  }

  async runtime(actor: Actor): Promise<AdminRuntimeRecord> {
    assertAdmin(actor);
    return this.queries.runtime();
  }
}
