import { contentChecksum } from '@vululu/domain';
import type { ReproducibilitySnapshot } from './ports';

/** Entrées communes aux scènes ; exclut les horodatages et versions locales. */
export function productionSourceChecksum(snapshot: ReproducibilitySnapshot): string {
  return contentChecksum({
    schemaVersion: 1,
    context: snapshot.context.data,
    brief: { version: snapshot.brief.version, checksum: snapshot.brief.checksum },
    assets: [...(snapshot.assets ?? [])].sort((a, b) => a.assetId.localeCompare(b.assetId)),
    render: snapshot.render,
    characters: [...snapshot.characters].sort((a, b) => a.characterId.localeCompare(b.characterId))
  });
}
