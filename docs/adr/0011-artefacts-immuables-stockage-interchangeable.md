# ADR-0011 — Artefacts immuables et stockage interchangeable

- **Statut** : Acceptee sous condition
- **Date** : 2026-10-25
- **Sources** : ADR-0002, ADR-0010, V1-01-E

## Contexte

Les medias V1 etaient references par des chemins locaux. Cette architecture ne permet pas un worker distribue, un changement de fournisseur de stockage ou une verification d integrite independante de l emplacement. Le lot E doit fournir une infrastructure d artefacts immuables, verifiable et interchangeable sans modifier les workflows metier.

## Decision

1. Introduire ArtifactStoragePort pour les octets, les flux et les metadonnees de stockage ; ArtifactAccessPort reste la porte d acces applicative.
2. Fournir deux adaptateurs : LocalFilesystemArtifactStorage et S3CompatibleArtifactStorage.
3. Utiliser des cles opaques derivees de projectId/sceneId/version/SHA-256, jamais d un nom fourni par l utilisateur.
4. Conserver les identites metier existantes (sceneVersionId, artifactVersionId, checksum) et ajouter storageKey/storageProvider en metadonnees nullables.
5. Implementer une publication en deux phases : ArtifactObject uploading/staged/ready puis transaction PostgreSQL de finalisation avec RunArtifact unique.
6. Conserver les anciens chemins en fallback ; la migration est progressive, dry-run par defaut et jamais massive sans autorisation.
7. L inventaire est read-only et ne supprime aucune donnee historique.

## Consequences

Positives : stockage interchangeable, streaming et Range, checksum SHA-256, versions immuables, provenance, reconciliation, reprise worker sans disque precedent.

Negatives : backend S3 de production non certifie, serveur local experimental, migration massive non executee, manifest non signe, renderer limite a un workspace local.

## Alternatives

- Rester sur le filesystem : rejete pour la distribution.
- Stocker les blobs en PostgreSQL : rejete (taille/performance).
- Utiliser directement un SDK fournisseur dans les use cases : rejete (frontiere).
- Decreter S3 valide via un mock : rejete ; le test local porte sur un serveur S3 reel mais non production.

## References

- docs/execution/V1_01_E_STORAGE_ARCHITECTURE.md
- docs/execution/V1_01_E_STORAGE_PORTS_ADAPTERS.md
- docs/execution/V1_01_E_FINALIZATION_RECOVERY.md
- docs/execution/V1_01_E_MIGRATION_COMPATIBILITY.md
- docs/execution/V1_01_E_FINAL_AUDIT.md
