import path from 'node:path';
import { env } from './env';

export function artifactPath(relativePath: string): string {
  const root = path.resolve(env.artifactRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Chemin d artefact invalide.');
  }
  return resolved;
}

export function artifactRelative(absolutePath: string): string {
  return path.relative(env.artifactRoot, absolutePath).split(path.sep).join('/');
}
