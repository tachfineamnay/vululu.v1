import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertSha256Hex,
  canonicalJson,
  contentChecksum,
  sha256Hex
} from '../../packages/domain/src/index';
import { captureDomainError } from './fixtures';

const SHA256_HEX = /^[a-f0-9]{64}$/;

describe('checksum SHA-256 pur', () => {
  it('matches the standard SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node:crypto on multibyte, accented and long inputs', () => {
    const inputs = [
      'Vululu ÉA',
      '🎬 scène 3 — révélation',
      'x'.repeat(55),
      'x'.repeat(56),
      'x'.repeat(64),
      'é'.repeat(65),
      'Vululu AI '.repeat(500)
    ];
    for (const input of inputs) {
      const expected = createHash('sha256').update(input, 'utf8').digest('hex');
      expect(sha256Hex(input)).toBe(expected);
    }
  });

  it('hashes raw bytes identically to their UTF-8 text', () => {
    const bytes = new TextEncoder().encode('abc');
    expect(sha256Hex(bytes)).toBe(sha256Hex('abc'));
  });

  it('produces a 64-character lowercase hex digest', () => {
    expect(sha256Hex('vululu')).toMatch(SHA256_HEX);
  });

  it('canonicalJson sorts object keys recursively and preserves array order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ a: { d: 4, c: 3 }, b: [2, 1] })).toBe(
      '{"a":{"c":3,"d":4},"b":[2,1]}'
    );
    expect(contentChecksum({ b: 2, a: 1 })).toBe(contentChecksum({ a: 1, b: 2 }));
    expect(contentChecksum({ a: [1, 2] })).not.toBe(contentChecksum({ a: [2, 1] }));
    expect(contentChecksum({ note: 'é', value: null })).toMatch(SHA256_HEX);
  });

  it('rejects values that have no canonical representation', () => {
    expect(captureDomainError(() => canonicalJson({ a: undefined })).code).toBe(
      'invalid_input'
    );
    expect(captureDomainError(() => contentChecksum(Number.NaN)).code).toBe(
      'invalid_input'
    );
  });

  it('validates a canonical SHA-256 hex digest strictly', () => {
    const valid = 'a'.repeat(64);
    expect(assertSha256Hex(valid)).toBe(valid);
    expect(captureDomainError(() => assertSha256Hex('A'.repeat(64))).code).toBe(
      'invalid_checksum'
    );
    expect(captureDomainError(() => assertSha256Hex('abc')).code).toBe(
      'invalid_checksum'
    );
  });
});
