import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * DSH-04 — répertoire de travail média portable.
 *
 * Certains hôtes Windows interdisent au binaire FFmpeg natif d'écrire sous %TEMP%
 * (EACCES), alors que Node/PowerShell y écrivent sans problème. Le rendu et les
 * vérifications média utilisent donc une racine explicite, configurable par
 * VULULU_MEDIA_TEMP (les tests la pointent vers un dossier du dépôt ignoré par git),
 * et retombent sur os.tmpdir() là où il est réellement inscriptible (conteneurs, CI).
 */
export async function createMediaTempDir(prefix: string): Promise<string> {
  const configured = process.env.VULULU_MEDIA_TEMP?.trim();
  const root = configured ? path.resolve(configured) : os.tmpdir();
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, prefix));
}
