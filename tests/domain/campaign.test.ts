import { describe, expect, it } from 'vitest';
import { createCampaign } from '../../packages/domain/src/campaign';
import { DomainError } from '../../packages/domain/src/errors';

const input = { id: 'campaign-1', userId: 'user-1', name: '  Collection hiver  ', description: '  Exemples fictifs  ', createdAt: '2026-11-04T12:00:00.000Z' };

describe('Campagne V1 : groupement explicite sans memoire', () => {
  it('normalise les champs saisis et preserve identite et date', () => {
    expect(createCampaign(input)).toEqual({ ...input, name: 'Collection hiver', description: 'Exemples fictifs' });
  });
  it('renvoie une valeur immuable', () => { expect(Object.isFrozen(createCampaign(input))).toBe(true); });
  it.each(['', ' ', 'a', 'a'.repeat(161)])('refuse un nom hors contrat', (name) => {
    expect(() => createCampaign({ ...input, name })).toThrow(DomainError);
  });
  it('refuse une description trop longue', () => {
    expect(() => createCampaign({ ...input, description: 'x'.repeat(2001) })).toThrow(DomainError);
  });
  it('refuse les identifiants et dates invalides', () => {
    expect(() => createCampaign({ ...input, userId: '' })).toThrow(DomainError);
    expect(() => createCampaign({ ...input, createdAt: 'hier' })).toThrow(DomainError);
  });
});
