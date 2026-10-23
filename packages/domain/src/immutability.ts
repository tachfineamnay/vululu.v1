/**
 * Gèle récursivement une valeur créée par le domaine.
 *
 * Les entités de domaine sont en lecture seule : toute évolution produit une
 * nouvelle valeur (copie) et laisse les versions/instantanés antérieurs intacts.
 * Aucune dépendance runtime n'est nécessaire.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    deepFreeze(record[key]);
  }
  return value;
}
