import crypto from 'node:crypto';

/** Random opaque token encoded as base64url (43 chars for 32 bytes). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest. Only digests are persisted, never plaintext tokens. */
export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) {
    return false;
  }
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/** Constant-time comparison of two short secret strings. */
export function safeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
