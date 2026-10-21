# ADR-0002 — PostgreSQL source de vérité, S3 pour les binaires

- **Statut** : Acceptée
- **Date** : 2026-10-21
- **Décideurs** : architecture Vululu AI
- **Sources** : [Architecture V1](../03_ARCHITECTURE_V1.md), section Source de vérité et intégrité ; [CDC V1.2](../02_CAHIER_DES_CHARGES_V1.md), CDC-N-006

## Contexte

Le produit doit conserver des projets, contextes, briefs, runs, scènes, artefacts, approbations, coûts et traces d'audit avec une forte intégrité transactionnelle. Les médias (images, audio, vidéo, masters) sont volumineux et ne doivent pas alourdir la base.

## Décision

- **PostgreSQL** est la source de vérité pour toutes les entités métier et l'état des workflows.
- **S3-compatible** stocke les binaires : uploads, références, frames, rushs, audio, proxys, masters, vignettes.
- La base conserve l'URI de stockage non publique, le SHA256, le type MIME, les dimensions ou la durée, les droits et la provenance.
- Les snapshots de lancement figent context_revision_id, brief_revision_id, agent_config_version, provider_policy_version et workflow_definition_version.

## Conséquences

- Positives : transactions et contraintes fortes, migration et sauvegarde maîtrisées, base légère, artefacts vérifiables par checksum.
- Négatives : deux systèmes à sauvegarder et à réconcilier ; politique de cohérence entre base et stockage à documenter.
- Impacts : migrations obligatoires, backups testés en préproduction, URLs temporaires, aucune donnée binaire lourde en base.

## Alternatives envisagées

- **Tout en base** : coûteux, sauvegardes lourdes, mauvais pour les vidéos ; rejeté.
- **Système de fichiers local** : non durable, non partageable entre workers ; rejeté.
- **Base documentaire seule** : perte des contraintes relationnelles et de l'intégrité transactionnelle ; rejeté.

## Références

- Architecture V1, section Source de vérité et intégrité.
- CDC-N-006 (stockage S3, checksums, URLs temporaires).
