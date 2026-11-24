import { describe, expect, it } from 'vitest';

describe('configuration PostgreSQL des tests QA', () => {
  it('ignore les URL héritées et utilise uniquement la base QA explicite ou une adresse injoignable', () => {
    const expected = process.env.VULULU_QA_DATABASE_URL || 'postgresql://vululu@127.0.0.1:1/vululu_unconfigured_test';
    expect(process.env.DATABASE_URL_TEST).toBe(expected);
    expect(process.env.DATABASE_URL).toBe(expected);
    const url = new URL(expected);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(url.hostname);
    expect(url.port).not.toBe('55432');
    expect(url.pathname).toMatch(/^\/vululu.*_test$/i);
  });
});
