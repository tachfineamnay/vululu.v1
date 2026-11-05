import { ApplicationError } from '../errors';
import type { Actor, AuditPort } from '../ports';
import type { ProviderCredentialCipher, ProviderCredentialStatus, ProviderCredentialStore } from '../providerCredentialPorts';

/** Gestion administrative : aucune lecture du secret, aucun appel fournisseur. */
export class ProviderCredentialUseCases {
  constructor(private readonly store: ProviderCredentialStore, private readonly cipher: ProviderCredentialCipher, private readonly audit: AuditPort) {}

  private async provider(actor: Actor, key: string) {
    if (actor.role !== 'super_admin') throw new ApplicationError('forbidden', 'Accès réservé au super-administrateur.', 403);
    const provider = await this.store.findProvider(key);
    if (!provider) throw new ApplicationError('provider_not_found', 'Fournisseur introuvable.', 404);
    return provider;
  }
  async status(actor: Actor, key: string): Promise<ProviderCredentialStatus> {
    const provider = await this.provider(actor, key);
    return { configured: provider.credentialsUpdatedAt !== null, updatedAt: provider.credentialsUpdatedAt, writable: this.cipher.configured() };
  }
  async save(actor: Actor, key: string, input: unknown): Promise<ProviderCredentialStatus> {
    const provider = await this.provider(actor, key);
    const value = typeof input === 'string' ? input.trim() : '';
    const bytes = new TextEncoder().encode(value);
    if (!value || bytes.length > 4096 || new TextDecoder().decode(bytes) !== value || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new ApplicationError('invalid_credentials', 'La clé doit être non vide, sur une ligne et limitée à 4096 octets.', 400);
    const encryptedValue = this.cipher.encrypt(value, provider.id);
    const updatedAt = await this.store.save(provider.id, encryptedValue, actor.id);
    await this.audit.record({ actorId: actor.id, action: 'provider.credentials_saved', targetType: 'provider', targetId: provider.id });
    return { configured: true, updatedAt, writable: this.cipher.configured() };
  }
  async remove(actor: Actor, key: string): Promise<ProviderCredentialStatus> {
    const provider = await this.provider(actor, key);
    await this.store.remove(provider.id);
    await this.audit.record({ actorId: actor.id, action: 'provider.credentials_removed', targetType: 'provider', targetId: provider.id });
    return { configured: false, updatedAt: null, writable: this.cipher.configured() };
  }
}
