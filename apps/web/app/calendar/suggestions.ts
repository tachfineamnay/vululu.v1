import { variant, type Content } from '@vululu/contracts';
import type { BrandContext, ProjectSummary } from '../../lib/api';
import { shift, dayKey } from './dates';
export type Offer = { id: string; contextId: string; name: string };
export function suggestions(
  start: Date,
  offer: Offer,
  context: BrandContext,
  projects: ProjectSummary[],
  preferredProject: string | null = null
) {
  const candidates = projects.filter((p) => p.contextId === context.id).sort((a, b) => a.id.localeCompare(b.id));
  const week = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / (7 * 86400000));
  const audience = context.audience || '';
  return ['Présenter', 'Expliquer', 'Inviter à découvrir'].map((angle, i) => {
    const project =
      candidates.find((p) => p.id === preferredProject) || candidates[Math.abs(week + i) % candidates.length];
    const platform = variant.shape.platform.safeParse(project?.platform);
    const format = variant.shape.format.safeParse(project?.format);
    const title = `${angle} : ${offer.name}`.slice(0, 160);
    const caption = [
      `Découvrez ${offer.name} avec ${context.name}.`,
      `Comment fonctionne ${offer.name} ? Voici les points à connaître.`,
      `${offer.name} vous intéresse ? Parlons de vos besoins.`
    ][i];
    const data: Content = {
      title,
      offerId: offer.id,
      audience,
      objective:
        project?.objective || ['Faire connaître l’offre', 'Expliquer sa valeur', 'Recevoir des demandes'][i],
      projectId: project?.id || null,
      campaignId: project?.campaignId || null,
      status: 'IDEA',
      archived: false,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      plannedAt: new Date(dayKey(shift(start, i * 2)) + 'T10:00').toISOString(),
      variants: [
        {
          platform: platform.data || 'Instagram',
          format: format.data || (i === 1 ? 'Carrousel' : 'Affiche'),
          caption,
          cta: ['Découvrez l’offre', 'Posez votre question', 'Contactez-nous'][i]
        }
      ]
    };
    return data;
  });
}
