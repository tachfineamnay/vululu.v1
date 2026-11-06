import { describe, expect, it } from 'vitest';
import type { ProjectBundle } from '../apps/web/lib/api';
import { executionStatus, productionStepLabel, projectJourney } from '../apps/web/lib/projectJourney';

function bundle(): ProjectBundle {
  return { project: { id: 'project', title: 'Univers libre', objective: 'Présenter une activité', status: 'draft', storyboardBriefVersion: null }, context: { id: 'context', name: 'Univers', audience: null }, brief: null, scenes: [], master: null, masterVersions: [], job: null, jobRun: null } as unknown as ProjectBundle;
}
describe('parcours dérivé du même projet serveur', () => {
  it('ne donne aucun état exécuté à un projet sans brief ni run', () => {
    const result = projectJourney(bundle());
    expect(result.current).toBe('brief');
    expect(result.stages[2].state).toBe('Aucun résultat produit');
    expect(result.stages[3].target).toBeNull();
  });
  it('demande la confirmation exacte et détecte le storyboard périmé', () => {
    const value = bundle();
    value.brief = { version: 2, confirmedVersion: 2, confirmedChecksum: 'old', revisions: [{ version: 2, checksum: 'new' }] } as ProjectBundle['brief'];
    value.scenes = [{ id: 'scene-stable' }] as ProjectBundle['scenes'];
    value.project.storyboardBriefVersion = 1;
    expect(projectJourney(value).current).toBe('brief');
    value.brief!.confirmedChecksum = 'new';
    expect(projectJourney(value).current).toBe('storyboard');
    expect(projectJourney(value).stages[1].state).toBe('Storyboard à actualiser');
  });
  it('conserve le résultat disponible en cas d’échec sans valider une approbation obsolète', () => {
    const value = bundle();
    value.master = { version: 7, checksum: 'new', qaStatus: 'PASS', approval: { checksum: 'old', invalidatedAt: null } } as ProjectBundle['master'];
    value.masterVersions = [value.master!];
    value.job = { status: 'failed' } as ProjectBundle['job'];
    const result = projectJourney(value);
    expect(result.stages[2].state).toContain('échec');
    expect(result.stages[2].output).toContain('Master v7');
    expect(result.stages[3].state).toBe('Approbation exacte requise');
  });
  it('ne confond pas transfert et publication et conserve les valeurs inconnues', () => {
    const value = bundle();
    value.master = { version: 9, checksum: 'exact', approval: { checksum: 'exact', invalidatedAt: null, transfer: { status: 'acknowledged' } } } as ProjectBundle['master'];
    expect(projectJourney(value).stages[3].state).toBe('Transfert MOCK : acknowledged');
    expect(executionStatus('unrecognized')).toBe('unrecognized');
    expect(productionStepLabel('new-capability')).toBe('new-capability');
  });
});
