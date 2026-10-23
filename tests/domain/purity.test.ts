import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const domainRoot = path.join(process.cwd(), 'packages', 'domain');
const sourceRoot = path.join(domainRoot, 'src');

function listSourceFiles(directory: string): string[] {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function readSources(): Array<{ file: string; source: string }> {
  return listSourceFiles(sourceRoot).map((file) => ({
    file: path.relative(process.cwd(), file),
    source: fs.readFileSync(file, 'utf8')
  }));
}

describe('Domain Core : pureté structurelle', () => {
  it('declares no runtime dependency', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(domainRoot, 'package.json'), 'utf8')
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies ?? {}).toEqual({});
  });

  it('only imports relative domain modules (no Prisma, Fastify, Next, FFmpeg, Postiz, fs, network)', () => {
    const sources = readSources();
    expect(sources.length).toBeGreaterThanOrEqual(10);

    const specifiers: string[] = [];
    for (const { source } of sources) {
      const staticImports = source.matchAll(/from\s+['"]([^'"]+)['"]/g);
      for (const match of staticImports) {
        specifiers.push(match[1]);
      }
      const dynamicImports = source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const match of dynamicImports) {
        specifiers.push(match[1]);
      }
    }

    expect(specifiers.length).toBeGreaterThanOrEqual(10);
    for (const specifier of specifiers) {
      expect(
        specifier.startsWith('./') || specifier.startsWith('../'),
        'unexpected external import: ' + specifier
      ).toBe(true);
    }

    const forbiddenModules = [
      'prisma',
      '@prisma/client',
      'fastify',
      'next',
      'ffmpeg',
      'ffprobe',
      'postiz',
      'sharp',
      'zod',
      'node:fs',
      'node:path',
      'node:http',
      'node:https',
      'node:crypto',
      'node:os',
      'axios',
      'undici'
    ];
    for (const specifier of specifiers) {
      for (const forbidden of forbiddenModules) {
        expect(specifier.includes(forbidden)).toBe(false);
      }
    }
  });

  it('does not read the clock, randomness, environment, filesystem or network', () => {
    const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'Date.now', pattern: /Date\.now/ },
      { label: 'new Date(', pattern: /new\s+Date\s*\(/ },
      { label: 'Math.random', pattern: /Math\.random/ },
      { label: 'process.env', pattern: /process\.env/ },
      { label: 'process.', pattern: /process\./ },
      { label: 'fs.', pattern: /\bfs\./ },
      { label: 'fetch(', pattern: /\bfetch\s*\(/ },
      { label: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
      { label: 'require(', pattern: /\brequire\s*\(/ },
      { label: 'eval(', pattern: /\beval\s*\(/ }
    ];
    for (const { file, source } of readSources()) {
      for (const { label, pattern } of forbiddenPatterns) {
        expect(pattern.test(source), file + ' must not use ' + label).toBe(false);
      }
    }
  });

  it('exports only the domain modules through the public index', () => {
    const index = fs.readFileSync(path.join(sourceRoot, 'index.ts'), 'utf8');
    const exportedModules = ['errors', 'checksum', 'identifiers', 'versions', 'identity', 'project', 'context', 'brief', 'scene', 'character', 'artifact', 'approval', 'production', 'transfer'];
    for (const moduleName of exportedModules) {
      expect(index).toContain("export * from './" + moduleName + "';");
    }
  });
});
