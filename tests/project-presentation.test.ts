import { expect, it } from 'vitest';
import { emptyProjectDraft, restoreProjectDraft, projectProgress } from '../apps/web/lib/projectPresentation';

it('reprend un brouillon valide et refuse données corrompues et choix non qualifiés', () => {
  expect(restoreProjectDraft(JSON.stringify({ ...emptyProjectDraft, title: 'Mon projet', step: 2 }))).toMatchObject({ title: 'Mon projet', step: 2 });
  expect(restoreProjectDraft('invalide')).toBeNull();
  for (const values of [{ step: -1 }, { step: 4 }, { platform: 'inconnu' }, { platform: 'LinkedIn', format: 'Story' }, { sceneDurationSeconds: 0 }, { title: 1 }]) expect(restoreProjectDraft(JSON.stringify({ ...emptyProjectDraft, ...values }))).toBeNull();
  // Reel est disponible sur Instagram : le brouillon est repris, sans réécriture silencieuse.
  expect(restoreProjectDraft(JSON.stringify({ ...emptyProjectDraft, platform: 'Instagram', format: 'Reel' }))).toMatchObject({ platform: 'Instagram', format: 'Reel' });
});
it('ne transforme pas un transfert en publication et conserve un état inconnu', () => {
  expect(projectProgress('transferred')).toEqual({ label: 'Transfert MOCK confirmé', next: 'Consulter la livraison simulée' });
  expect(projectProgress('brief_ready').next).toBe('Relire le brief et son plan');
  expect(projectProgress('autre')).toEqual({ label: 'autre', next: 'Ouvrir le projet' });
});
