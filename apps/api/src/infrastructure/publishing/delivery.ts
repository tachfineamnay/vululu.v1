import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { prisma } from '@vululu/db';
import { content, creativeSpec } from '@vululu/contracts';
import { zipSync, strToU8 } from 'fflate';
import type { CreativeStudio } from '../../application/creative';
import { HttpError } from '../../errors';
import { publishingJpeg } from '@vululu/media';
import { capabilities, type Attachment, type PublishingPlatform } from './provider';
export const problem = (status: number, code: string): never => {
  throw new HttpError(status, code, code);
};
export async function preview(owner: string, itemId: string, revision: number, target?: PublishingPlatform) {
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, userId: owner } });
  if (!item?.projectId) return problem(404, 'item_not_found');
  const rev = await prisma.creativeRevision.findFirst({
    where: {
      projectId: item.projectId,
      project: { userId: owner },
      version: revision,
      contentItemId: item.id,
      contentVersion: item.version
    }
  });
  if (!rev?.manifest || !rev.approvedAt) return problem(409, 'approved_revision_required');
  const spec = creativeSpec.parse(rev.spec),
    d = spec.delivery;
  if (!d || d.calendar?.itemId !== itemId || d.calendar.version !== item.version)
    return problem(409, 'calendar_changed');
  const v = content.shape.variants.parse(item.variants).find((x) => x.platform === d.platform);
  if (!v) return problem(409, 'variant_missing');
  const platform = target ?? d.platform;
  const caption = [v.caption, v.cta].join('\n\n');
  const issues: string[] = [];
  if (item.archived || !['APPROVED', 'SCHEDULED'].includes(item.status))
    issues.push('editorial_approval_required');
  if ([...caption].length > capabilities[platform].caption) issues.push('caption_too_long');
  const keys = d.kind === 'carousel' ? spec.scenes.map((s) => s.key) : [undefined];
  return {
    itemId,
    itemVersion: item.version,
    projectId: item.projectId,
    revision,
    platform,
    sourcePlatform: d.platform,
    kind: d.kind,
    caption,
    when: item.plannedAt.toISOString(),
    keys,
    issues,
    direct: capabilities[platform].scheduled.includes(d.kind)
  };
}
export async function attachments(
  studio: CreativeStudio,
  owner: string,
  p: Awaited<ReturnType<typeof preview>>,
  provider = false
) {
  const files: Attachment[] = [];
  let total = 0;
  for (const key of p.keys) {
    const f = await studio.file(owner, p.projectId, p.revision, key);
    total += f.size;
    if (total > 64 * 1024 * 1024) problem(413, 'package_too_large');
    const bytes = await buffer(await f.openRead());
    if (createHash('sha256').update(bytes).digest('hex') !== f.sha256) problem(409, 'artifact_integrity');
    if (provider && f.contentType !== 'image/png') return problem(409, 'media_format_ineligible');
    if (provider && ['Instagram', 'Google Business Profile'].includes(p.platform)) {
      const jpg = await publishingJpeg(bytes);
      if (jpg.length > 5_000_000) return problem(409, 'media_size_ineligible');
      files.push({ name: '01-photo.jpg', mime: 'image/jpeg', bytes: jpg, sha256: createHash('sha256').update(jpg).digest('hex') });
      continue;
    }
    if (provider && bytes.length > 8_000_000) return problem(409, 'media_size_ineligible');
    files.push({
      name: `${String(files.length + 1).padStart(2, '0')}-${key ?? p.kind}.${f.contentType === 'image/png' ? 'png' : 'mp4'}`,
      mime: f.contentType,
      bytes,
      sha256: f.sha256
    });
  }
  return files;
}
export function manualPackage(p: Awaited<ReturnType<typeof preview>>, files: Attachment[]) {
  return Buffer.from(
    zipSync(
      {
        ...Object.fromEntries(files.map((f) => [f.name, f.bytes])),
        'caption.txt': strToU8(p.caption),
        'manifest.json': strToU8(
          JSON.stringify(
            { ...p, files: files.map(({ name, sha256, mime }) => ({ name, sha256, mime })) },
            null,
            2
          )
        ),
        'instructions.txt': strToU8(
          `Publication manuelle — ${p.platform}\nVérifiez le compte et le cadrage. Importez les fichiers dans l’ordre numérique, copiez caption.txt et programmez pour ${p.when}. ${p.issues.includes('caption_too_long') ? 'Raccourcissez la légende avant de publier. ' : ''}Ce téléchargement ne publie rien.`
        )
      },
      { level: 0 }
    )
  );
}
