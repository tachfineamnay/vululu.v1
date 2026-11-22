import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from '../apps/api/src/observability/logger';
import { accountEmailOrigin } from '../apps/api/src/infrastructure/email/accountMail';
import { classify, sensitive } from '../apps/api/src/infrastructure/marketing/editorial';

/**
 * Regressions d audit — configurations qui ne demandent ni base ni FFmpeg.
 * Chaque cas echouerait sur le code d avant correction.
 */
describe('fenetres de limitation de debit', () => {
  /**
   * `windowSeconds` est en secondes partout. L import des routes charge Prisma :
   * on verifie donc l invariant directement sur les sources, ce qui couvre
   * aussi toute future route ajoutee.
   */
  it('reste exprime en secondes dans toutes les routes', () => {
    const dir = 'apps/api/src/routes';
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts'));
    const offenders: string[] = [];
    for (const name of files) {
      const source = readFileSync(`${dir}/${name}`, 'utf8');
      for (const match of source.matchAll(/windowSeconds:\s*(\d+)/g)) {
        const seconds = Number(match[1]);
        // 24 h est deja une fenetre extreme (comptes, emails) ; au-dela, c est
        // presque toujours des millisecondes par erreur.
        if (!(seconds >= 1 && seconds <= 86_400)) offenders.push(`${name}: ${seconds}`);
      }
    }
    expect(offenders).toEqual([]);
    const media = readFileSync(`${dir}/mediaGeneration.ts`, 'utf8');
    expect(media).toContain('windowSeconds: 60,');
  });
});

describe('journalisation structuree', () => {
  const written: string[] = [];
  afterEach(() => vi.restoreAllMocks());

  it('interdit a un appelant de falsifier timestamp, level ou event', () => {
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    logEvent('warn', 'audit.fixture', {
      timestamp: '1970-01-01T00:00:00.000Z',
      level: 'debug',
      event: 'falsifie',
      detail: 'ok'
    });
    const line = JSON.parse(written[written.length - 1]) as Record<string, unknown>;
    expect(line.event).toBe('audit.fixture');
    expect(line.level).toBe('warn');
    expect(line.timestamp).not.toBe('1970-01-01T00:00:00.000Z');
    expect(line.detail).toBe('ok');
  });
});

describe('origine des emails de compte', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuse explicitement une production sans ACCOUNT_EMAIL_ORIGIN', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('ACCOUNT_EMAIL_ORIGIN', '');
    expect(() => accountEmailOrigin()).toThrow(/ACCOUNT_EMAIL_ORIGIN/);
  });

  it('refuse une valeur non absolue au lieu de lever un TypeError opaque', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('ACCOUNT_EMAIL_ORIGIN', 'pas-une-url');
    expect(() => accountEmailOrigin()).toThrow(/ACCOUNT_EMAIL_ORIGIN/);
  });
});

describe('secteurs regules', () => {
  it('classe sante sans accent et la marque comme sensible', () => {
    for (const text of ['Je suis therapeute', 'sante naturelle', 'soins energetiques']) {
      expect(classify(text)).toBe('therapeute');
      expect(sensitive(text)).toBe(true);
    }
  });

  it('ne declasse jamais un secteur regule en general', () => {
    for (const text of ['diététicienne', 'dieteticien', 'avocat', 'pharmacien', 'dentiste']) {
      expect(sensitive(text)).toBe(true);
    }
  });
});

describe('conservation du manifest legacy a la migration', () => {
  it('fusionne le manifest historique au lieu de l ecraser', () => {
    const source = readFileSync(
      'apps/api/src/infrastructure/artifacts/artifactMigration.ts',
      'utf8'
    );
    // Le manifest source est capture dans le plan puis repris a l ecriture.
    expect(source).toContain('previousManifest: asManifest(');
    expect(source.match(/\.\.\.item\.previousManifest/g)?.length).toBe(3);
    expect(source).not.toMatch(/\bvoid file;/);
  });
});
