import { nextStages, type Content } from '@vululu/contracts';
import { HttpError } from '../errors';

export function conflict(message: string): never {
  throw new HttpError(409, 'calendar_conflict', message);
}
export function checkEdit(before: Content | null, after: Content, now: number) {
  if (!before) {
    if (after.status !== 'IDEA' || after.archived) conflict('Commencez par une idée active.');
  } else {
    if (after.status !== before.status && !nextStages[before.status].includes(after.status))
      conflict('Transition non autorisée.');
    // Approval applies to the reviewed copy, not to a replacement submitted alongside a transition.
    const locked = !['IDEA', 'DRAFT'].includes(before.status) && after.status !== 'DRAFT';
    const copy = (item: Content) =>
      JSON.stringify([
        item.title,
        item.audience,
        item.objective,
        item.offerId,
        item.campaignId,
        item.projectId,
        item.variants.map((v) => [v.platform, v.format, v.caption, v.cta, v.hashtags ?? []])
      ]);
    if (locked && copy(before) !== copy(after)) conflict('Revenez au brouillon pour modifier le contenu.');
    if (
      before.status === 'PUBLISHED' &&
      (before.plannedAt !== after.plannedAt || before.timeZone !== after.timeZone)
    )
      conflict('Une publication déclarée ne peut pas être déplacée.');
    if (before.archived && after.archived) conflict('Restaurez ce contenu avant modification.');
  }
  if (after.status === 'SCHEDULED' && !after.archived && Date.parse(after.plannedAt) <= now)
    conflict('Choisissez un créneau futur.');
}
