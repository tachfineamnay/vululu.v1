import { DomainError } from './errors';

/**
 * Horodatage ISO 8601 UTC, fourni par l'appelant.
 *
 * Le domaine ne lit jamais l'horloge : il reste pur et testable de façon
 * déterministe. L'Application fournit l'horodatage (port Clock).
 */
export type IsoTimestamp = string;

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function assertIsoTimestamp(value: string, field = 'timestamp'): IsoTimestamp {
  if (typeof value !== 'string' || !ISO_UTC_PATTERN.test(value)) {
    throw new DomainError('invalid_input', `${field} must be an ISO 8601 UTC timestamp.`, {
      field,
      value
    });
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new DomainError('invalid_input', `${field} is not a valid date.`, { field, value });
  }
  return value;
}

export function timestampMillis(value: IsoTimestamp): number {
  return Date.parse(assertIsoTimestamp(value));
}
