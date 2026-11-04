import { DomainError } from './errors';
import { assertEntityId } from './identifiers';
import { assertIsoTimestamp } from './timestamp';
import { deepFreeze } from './immutability';

export interface Campaign {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
}

export function createCampaign(input: Campaign): Campaign {
  if (typeof input.name !== 'string' || typeof input.description !== 'string') {
    throw new DomainError('invalid_input', 'Campaign name and description must be strings.');
  }
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > 160 || description.length > 2000) {
    throw new DomainError('invalid_input', 'Campaign name or description is outside the supported length.');
  }
  return deepFreeze({
    id: assertEntityId(input.id), userId: assertEntityId(input.userId, 'userId'),
    name, description, createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  });
}
