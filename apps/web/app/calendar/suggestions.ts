import { availableFormats, variant, type Content } from '@vululu/contracts';
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
  const project = projects.find((p) => p.contextId === context.id && p.id === preferredProject);
  const audience = context.audience || `Personnes intéressées par ${offer.name}`;
  return ['Présenter', 'Expliquer', 'Inviter à découvrir'].map((angle, i) => {
    const platform = variant.shape.platform.safeParse(project?.platform).data ?? 'Instagram';
    const storedFormat = variant.shape.format.safeParse(project?.format).data;
    const format = storedFormat && (availableFormats[platform] as readonly string[]).includes(storedFormat)
      ? storedFormat : platform === 'TikTok' ? 'Reel' : i === 1 ? 'Carrousel' : 'Affiche';
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
          platform,
          format,
          caption,
          cta: ['Découvrez l’offre', 'Posez votre question', 'Contactez-nous'][i],
          hashtags: []
        }
      ]
    };
    return data;
  });
}
