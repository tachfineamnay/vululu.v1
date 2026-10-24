/**
 * @vululu/domain — Domain Core pur de Vululu AI.
 *
 * Invariants : identifiants stables (Scene.id/Character.id séparés des clés et
 * des positions), versions immuables append-only, checksums, approbation d'une
 * version exacte, invalidation par un nouveau master, correction ciblée,
 * transfert interdit sans approbation valide.
 *
 * Aucune dépendance Prisma/Fastify/Next/FFmpeg/Postiz, aucun fs, aucun réseau,
 * aucune lecture d'horloge : toutes les entrées (ids, horodatages, checksums
 * d'octets) sont fournies par la couche Application.
 */
export * from './errors';
export * from './immutability';
export * from './timestamp';
export * from './checksum';
export * from './identifiers';
export * from './versions';
export * from './identity';
export * from './project';
export * from './context';
export * from './brief';
export * from './scene';
export * from './character';
export * from './artifact';
export * from './approval';
export * from './production';
export * from './transfer';
export * from './capabilities';
export * from './agents';
export * from './productionState';
