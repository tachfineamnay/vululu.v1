import { assertLicenseType, assertNonNegativeInteger, assertQuality } from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  AuditPort,
  ModelRecord,
  ProviderCatalogRepository,
  ProviderRecord
} from '../ports';

function assertAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') {
    throw new ApplicationError('forbidden', 'Acces reserve au super administrateur.', 403);
  }
}

/**
 * Catalogue versionne de providers/modeles/capacites.
 * Desactiver un provider ou retirer une qualification ne modifie pas le Domain :
 * le routeur refuse simplement le modele ineligible.
 */
export class ProviderCatalogUseCases {
  constructor(
    private readonly catalog: ProviderCatalogRepository,
    private readonly audit: AuditPort
  ) {}

  async listProviders(actor: Actor): Promise<ProviderRecord[]> {
    assertAdmin(actor);
    return this.catalog.listProviders();
  }

  async registerProvider(actor: Actor, input: { key: string; name: string }): Promise<ProviderRecord> {
    assertAdmin(actor);
    const provider = await this.catalog.upsertProvider({ ...input, active: true });
    await this.audit.record({
      actorId: actor.id,
      action: 'provider.registered',
      targetType: 'provider',
      targetId: provider.id,
      metadata: { key: provider.key }
    });
    return provider;
  }

  async registerModel(actor: Actor, input: {
    providerKey: string;
    modelKey: string;
    capabilityKeys: string[];
    quality: number;
    latencyMs: number;
    costCentsPerUnit: number;
    license: string;
    qualified: boolean;
  }): Promise<ModelRecord> {
    assertAdmin(actor);
    if (input.capabilityKeys.length === 0) {
      throw new ApplicationError('capability_required', 'Un modele doit declarer une capacite.', 400);
    }
    const model = await this.catalog.upsertModel({
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      capabilityKeys: input.capabilityKeys,
      quality: assertQuality(input.quality),
      latencyMs: assertNonNegativeInteger(input.latencyMs, 'latencyMs'),
      costCentsPerUnit: assertNonNegativeInteger(input.costCentsPerUnit, 'costCentsPerUnit'),
      license: assertLicenseType(input.license),
      active: true,
      qualified: input.qualified
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'model.registered',
      targetType: 'model',
      targetId: model.id,
      metadata: { providerKey: model.providerKey, modelKey: model.modelKey, qualified: model.qualified }
    });
    return model;
  }

  async setProviderActive(actor: Actor, providerKey: string, active: boolean): Promise<ProviderRecord> {
    assertAdmin(actor);
    const provider = await this.catalog.setProviderActive(providerKey, active);
    await this.audit.record({
      actorId: actor.id,
      action: active ? 'provider.activated' : 'provider.deactivated',
      targetType: 'provider',
      targetId: provider.id,
      metadata: { key: provider.key }
    });
    return provider;
  }

  async setModelActive(actor: Actor, modelId: string, active: boolean): Promise<ModelRecord> {
    assertAdmin(actor);
    const model = await this.catalog.setModelActive(modelId, active);
    await this.audit.record({
      actorId: actor.id,
      action: active ? 'model.activated' : 'model.deactivated',
      targetType: 'model',
      targetId: model.id,
      metadata: { providerKey: model.providerKey, modelKey: model.modelKey }
    });
    return model;
  }

  async qualifyModel(actor: Actor, modelId: string, qualified: boolean): Promise<ModelRecord> {
    assertAdmin(actor);
    const model = await this.catalog.setModelQualified(modelId, qualified);
    await this.audit.record({
      actorId: actor.id,
      action: qualified ? 'model.qualified' : 'model.unqualified',
      targetType: 'model',
      targetId: model.id,
      metadata: { providerKey: model.providerKey, modelKey: model.modelKey }
    });
    return model;
  }

  listModels(capabilityKey?: string): Promise<ModelRecord[]> {
    return this.catalog.listModels(capabilityKey);
  }
}