export type ProviderCredentialStatus = { configured: boolean; updatedAt: Date | null; writable: boolean };
export interface ProviderCredentialStore {
  findProvider(key: string): Promise<{ id: string; credentialsUpdatedAt: Date | null } | null>;
  save(providerId: string, encryptedValue: string, actorId: string): Promise<Date>;
  remove(providerId: string): Promise<void>;
}
export interface ProviderCredentialCipher {
  configured(): boolean;
  encrypt(value: string, providerId: string): string;
}
