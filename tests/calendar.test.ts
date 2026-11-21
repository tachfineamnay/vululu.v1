import { describe, expect, it } from 'vitest';
import { content, nextStages, stages, type Content } from '@vululu/contracts';
import { checkEdit } from '../apps/api/src/application/calendarPolicy';
import { dayKey, period, instants } from '../apps/web/app/calendar/dates';
import { AUDIENCE_UNSPECIFIED, suggestions } from '../apps/web/app/calendar/suggestions';

const idea: Content = {
  title: 'Cours',
  audience: 'Débutants',
  objective: 'Inscriptions',
  offerId: 'offre',
  campaignId: null,
  projectId: null,
  archived: false,
  status: 'IDEA',
  plannedAt: '2030-04-01T08:00:00.000Z',
  timeZone: 'Africa/Casablanca',
  variants: [{ platform: 'Instagram', format: 'Affiche', caption: 'Dessiner ensemble', cta: 'Réserver' }]
};
describe('editorial rules', () => {
  it('accepts only declared edges and same-state edits', () => {
    for (const from of stages)
      for (const to of stages) {
        const fn = () => checkEdit({ ...idea, status: from }, { ...idea, status: to }, 0);
        if (from === to || nextStages[from].includes(to)) expect(fn).not.toThrow();
        else expect(fn).toThrow();
      }
    expect(() => checkEdit(null, { ...idea, status: 'APPROVED' }, 0)).toThrow();
  });
  it('cannot replace reviewed copy on approval or schedule in the past', () => {
    expect(() =>
      checkEdit({ ...idea, status: 'READY_FOR_REVIEW' }, { ...idea, status: 'APPROVED', title: 'Changed' }, 0)
    ).toThrow();
    expect(() =>
      checkEdit({ ...idea, status: 'APPROVED' }, { ...idea, status: 'SCHEDULED' }, Date.parse(idea.plannedAt))
    ).toThrow();
  });
  it('requires valid zone, UTC minute and distinct platforms', () => {
    for (const change of [
      { timeZone: 'invalid' },
      { plannedAt: '2030-04-01T08:00:01Z' },
      { variants: [idea.variants[0], idea.variants[0]] }
    ])
      expect(content.safeParse({ ...idea, ...change }).success).toBe(false);
  });
  it('uses civil months and Monday weeks across year boundaries', () => {
    expect(dayKey(period(new Date(2027, 0, 1), false).start)).toBe('2026-12-28');
    expect(period(new Date(2028, 1, 15), true).days).toHaveLength(29);
    expect(instants('invalid')).toEqual([]);
  });
  it('returns repeatable offer-specific suggestions without inventing audience data', () => {
    const context = {
      id: 'c',
      name: 'Atelier',
      description: 'Dessin',
      audience: null,
      website: null,
      tone: null,
      colorPrimary: '',
      colorSecondary: ''
    };
    const build = () =>
      suggestions(new Date(2030, 3, 1), { id: 'o', contextId: 'c', name: 'Initiation' }, context, []);
    expect(build()).toEqual(build());
    expect(build().map((x) => dayKey(new Date(x.plannedAt)))).toEqual(['2030-04-01', '2030-04-03', '2030-04-05']);
    expect(build().every((x) => x.title.includes('Initiation') && x.audience === AUDIENCE_UNSPECIFIED && x.offerId === 'o')).toBe(true);
    expect(build().every((x) => !x.audience.includes('Personnes intéressées'))).toBe(true);
    const known = suggestions(new Date(2030, 3, 1), { id: 'o', contextId: 'c', name: 'Initiation' }, { ...context, audience: 'Artisans locaux' }, []);
    expect(known.every((x) => x.audience === 'Artisans locaux')).toBe(true);
  });
});

it('rejects the spring gap and distinguishes the two autumn instants', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    expect(instants('2026-03-08T02:30')).toEqual([]);
    expect(instants('2026-11-01T01:30').map((d) => d.toISOString())).toEqual([
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:30:00.000Z'
    ]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
