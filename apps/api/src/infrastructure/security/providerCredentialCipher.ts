import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ApplicationError } from '@vululu/application';
import type { ProviderCredentialCipher } from '@vululu/application';

/** Chiffrement serveur ; la clé maîtresse n'est ni persistée ni retournée. */
export class AesProviderCredentialCipher implements ProviderCredentialCipher {
  constructor(private readonly encodedKey: () => string | undefined = () => process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY) {}
  private key(): Buffer {
    const encoded = this.encodedKey()?.trim() ?? '';
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== 32 || bytes.toString('base64') !== encoded) throw new ApplicationError('credentials_unavailable', 'Le chiffrement des clés IA doit être configuré côté serveur.', 503);
    return bytes;
  }
  configured(): boolean { try { this.key(); return true; } catch { return false; } }
  encrypt(value: string, providerId: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(providerId));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  /** Réservé aux adaptateurs serveur ; aucune route de restitution. */
  decrypt(encryptedValue: string, providerId: string): string {
    const key = this.key();
    try {
      const envelope = JSON.parse(encryptedValue);
      if (envelope.v !== 1 || !['iv', 'tag', 'data'].every((field) => typeof envelope[field] === 'string')) throw new Error('invalid_envelope');
      const iv = Buffer.from(envelope.iv, 'base64'); const tag = Buffer.from(envelope.tag, 'base64'); const data = Buffer.from(envelope.data, 'base64');
      if (iv.length !== 12 || tag.length !== 16 || data.length === 0 || data.length > 4096) throw new Error('invalid_envelope');
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAAD(Buffer.from(providerId)); decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch { throw new ApplicationError('credentials_invalid', 'La clé IA chiffrée ne peut pas être lue avec la configuration actuelle.', 503); }
  }
}
