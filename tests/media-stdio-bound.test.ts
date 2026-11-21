import { describe, expect, it } from 'vitest';
import { appendBounded, STDIO_LIMIT_BYTES } from '../packages/media/src/index';

describe('sortie de processus média bornée', () => {
  it('conserve la sortie sous la borne sans la modifier', () => {
    const state = appendBounded({ text: '', truncated: false }, 'première ');
    const next = appendBounded(state, Buffer.from('deuxième'));
    expect(next).toEqual({ text: 'première deuxième', truncated: false });
  });

  it('borne la mémoire et conserve la fin de la sortie pour le diagnostic', () => {
    let state = { text: '', truncated: false };
    const chunk = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 40; i++) state = appendBounded(state, chunk + ':' + i);
    expect(state.truncated).toBe(true);
    expect(Buffer.byteLength(state.text, 'utf8')).toBeLessThanOrEqual(STDIO_LIMIT_BYTES);
    expect(state.text.length).toBeLessThan(40 * 64 * 1024);
    expect(state.text.endsWith(':39')).toBe(true);
  });

  it('ne grossit plus après la troncature et conserve la sortie la plus récente', () => {
    const truncated = appendBounded({ text: 'y'.repeat(STDIO_LIMIT_BYTES), truncated: false }, 'z');
    expect(truncated.truncated).toBe(true);
    expect(Buffer.byteLength(truncated.text, 'utf8')).toBeLessThanOrEqual(STDIO_LIMIT_BYTES);
    const again = appendBounded(truncated, 'inutile');
    expect(again.truncated).toBe(true);
    expect(Buffer.byteLength(again.text, 'utf8')).toBeLessThanOrEqual(STDIO_LIMIT_BYTES);
    expect(again.text.endsWith('inutile')).toBe(true);
  });
});
