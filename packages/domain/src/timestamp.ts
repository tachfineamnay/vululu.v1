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
  if (Number.isNaN(Date.parse(value)) || !isCalendarValid(value)) {
    throw new DomainError('invalid_input', `${field} is not a valid date.`, { field, value });
  }
  return value;
}

/**
 * `Date.parse` reporte silencieusement les dates impossibles (2026-02-30 ->
 * 2026-03-02). On verifie donc les composantes calendaires par arithmetique
 * pure : le domaine reste sans horloge ni allocation de Date.
 */
function isCalendarValid(value: string): boolean {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= days;
}

export function timestampMillis(value: IsoTimestamp): number {
  return Date.parse(assertIsoTimestamp(value));
}
