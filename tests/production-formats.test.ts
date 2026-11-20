import { expect, it } from 'vitest';
import { availableFormats, productionFormats, projectInputSchema, studioExportExtension } from '@vululu/contracts';

it('advertises only producible projects and matches their default download types', () => {
  const input = { contextId: 'ctx', title: 'Campaign', objective: 'New launches' };
  for (const [platform, formats] of Object.entries(availableFormats)) {
    for (const format of formats) {
      expect(projectInputSchema.safeParse({ ...input, platform, format }).success).toBe(true);
      const { studio, file } = productionFormats[format];
      expect(studioExportExtension(studio ?? undefined)).toBe(file);
    }
  }
  expect(availableFormats.Instagram).toEqual(['Affiche', 'Story', 'Carrousel', 'Reel', 'Video']);
  for (const format of ['Motion', 'Story', 'Reel'])
    expect(projectInputSchema.safeParse({ ...input, platform: 'LinkedIn', format }).success).toBe(false);
});
