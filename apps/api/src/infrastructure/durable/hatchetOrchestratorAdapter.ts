/* eslint-disable @typescript-eslint/no-explicit-any -- SDK Hatchet confine a l adaptateur */
import { HatchetClient } from '@hatchet-dev/typescript-sdk/v1';
import type { DurableOrchestratorPort } from '@vululu/application';

/**
 * Adaptateur Hatchet : seul point du serveur API qui importe le SDK.
 *
 * L engine v0.110.5 et le SDK 1.43.0 sont ceux eprouves par le POC C.
 * Les use cases ne connaissent que DurableOrchestratorPort.
 */
export class HatchetOrchestratorAdapter implements DurableOrchestratorPort {
  private client: any | null = null;
  private readonly clientFactory: () => any;

  constructor(clientFactory?: () => any) {
    this.clientFactory =
      clientFactory ??
      (() =>
        HatchetClient.init({
          token: process.env.HATCHET_CLIENT_TOKEN,
          host_port: process.env.HATCHET_CLIENT_HOST_PORT ?? '127.0.0.1:7077',
          api_url: process.env.HATCHET_CLIENT_API_URL ?? 'http://127.0.0.1:28243',
          tls_config: {
            tls_strategy:
              (process.env.HATCHET_CLIENT_TLS_STRATEGY as 'tls' | 'mtls' | 'none' | undefined) ?? 'none'
          },
          log_level: 'WARN'
        }));
  }

  private get hatchet(): any {
    if (!this.client) {
      const token = process.env.HATCHET_CLIENT_TOKEN;
      if (!token) {
        throw new Error('hatchet_token_absent');
      }
      this.client = this.clientFactory();
    }
    return this.client;
  }

  async submitStart(input: {
    outboxId: string;
    jobRunId: string;
    projectId: string;
    type: string;
    traceId?: string | null;
    requestId?: string | null;
  }): Promise<{ workflowRunId: string }> {
    const ref = await this.hatchet.runNoWait(
      'vululu-production-pipeline',
      {
        outboxId: input.outboxId,
        jobRunId: input.jobRunId,
        projectId: input.projectId,
        type: input.type,
        traceId: input.traceId ?? null,
        requestId: input.requestId ?? null
      },
      { additionalMetadata: { jobRunId: input.jobRunId, projectId: input.projectId } }
    );
    return { workflowRunId: await ref.runId };
  }

  async signalApproval(input: {
    jobRunId: string;
    projectId: string;
    artifactVersionId: string;
    checksum: string;
    approvedBy: string;
  }): Promise<void> {
    await this.hatchet.events.push('production-approval:' + input.jobRunId, {
      jobRunId: input.jobRunId,
      projectId: input.projectId,
      artifactVersionId: input.artifactVersionId,
      checksum: input.checksum,
      approvedBy: input.approvedBy,
      approvedAt: new Date().toISOString()
    });
  }

  async getRunStatus(workflowRunId: string): Promise<string> {
    return String(await this.hatchet.runs.get_status(workflowRunId));
  }

  async getRunEvidence(workflowRunId: string): Promise<Record<string, unknown>> {
    return (await this.hatchet.runs.getDetails(workflowRunId)) as Record<string, unknown>;
  }

  async cancelRun(workflowRunId: string): Promise<void> {
    await this.hatchet.runs.cancel({ ids: [workflowRunId] });
  }

  async retryFailedStep(workflowRunId: string, _stepName: string): Promise<void> {
    await this.hatchet.runs.replay({ ids: [workflowRunId] });
  }

  async resumeRun(workflowRunId: string): Promise<void> {
    await this.hatchet.runs.replay({ ids: [workflowRunId] });
  }
}