# V1-01-A.1 — TRANSACTIONS, CONCURRENCE ET SNAPSHOTS

- **Date** : 2026-10-23
- **Branche** : v1-01-a1-consolidation
- **Commit** : b1824c1
- **Objectif** : atomicité storyboard/versions/révisions, snapshot coherent, concurrence maitrisee

## 1. Verrous et transactions

| Écriture | Transaction / verrou | Preuve |
|---|---|---|
| Contexte + ContextRevision | transaction Prisma contexte+révision | test API + code |
| Brief + BriefRevision + statut | transaction ; updateMany conditionnel du projet ; vérification de version | test brief version |
| Storyboard + CharacterVersion + scènes + statut | transaction ; verrou projet conditionnel ; vérification de version personnage | test rollback |
| Démarrage production/correction | transaction Serializable ; updateMany projet pour verrou ; création snapshot + JobRun + StepRun + ProductionJob + lien jobRun | test transaction + test concurrence |
| Finalisation média | transaction unique : SceneVersion, ArtifactVersion, invalidation approbations, QA, outputs, statuts, JobRun/ProductionJob | E2E + DB |
| Approbation | Domain exact + persistance | E2E |
| Transfert | Domain + adaptation Postiz mock idempotente par approvalId | E2E + test Postiz |

## 2. Storyboard atomique

Le store storyboard vérifie le propriétaire, verrouille et met à jour le statut du projet, vérifie la version attendue du personnage, crée ou met à jour le personnage, ajoute une CharacterVersion seulement si le contenu change, crée ou met à jour les cinq scènes en préservant Scene.id et la durée personnalisée existante, puis met le statut storyboard_ready dans la même transaction.

Un doublon de sceneKey ou une erreur en cours de boucle annule toute la transaction. Le test PostgreSQL vérifie qu aucune scène, aucun personnage et aucune version ne subsiste après rollback.

## 3. Brief versionné

Le store brief verrouille le projet, compare la version courante à version-1, écrit Brief + BriefRevision + statut dans une transaction. Une version qui saute ou une revision concurrente produit un 409 stable, pas une 500.

## 4. Snapshot et démarrage de run

Le repository de run ouvre une transaction Serializable, acquiert le verrou projet par updateMany, lit les révisions contexte/brief, scènes et personnages dans la même transaction, refuse un JobRun actif, crée le JobRun avec snapshot/checksum, les StepRun et le ProductionJob avec jobRunId, puis commit.

Le snapshot contient projet, contexte, brief, scènes, personnages, politique provider, paramètres de rendu et métadonnées de correction.
## 5. Concurrence

| Risque | Défense |
|---|---|
| Deux productions simultanées | verrou projet + transaction Serializable + index unique partiel JobRun_one_active_per_project + test Promise.allSettled |
| Deux storyboards simultanés | verrou projet conditionnel + version attendue personnage + unique characterId/version |
| Brief concurrent | verrou projet + version attendue + unique briefId/version |
| Doublon StepRun | index unique StepRun(jobRunId,name) |
| Deux ProductionJob pour un JobRun | ProductionJob.jobRunId unique + index active JobRun |
| Transfert concurrent | unique approvalId dans Transfer + PostizMockAdapter relit le gagnant sur P2002 |
| Version scène/master concurrente | une seule production active + unique sceneId/version et artifactId/version + finalisation transactionnelle |

Tests réels : second startRun refusé 409 et deux startRun concurrents donnent exactement un run actif.

## 6. Snapshot et outputs

- snapshot d entrée immuable et checksummé ;
- outputs séparés et checksummés ;
- versions de scènes/master écrites dans la transaction de finalisation ;
- QA PASS avant approbation ;
- nouveau master invalide les approbations actives dans la même transaction.

## 7. Limites résiduelles

- Aucun heartbeat ni timeout : un JobRun resté running bloque les nouveaux runs jusqu à intervention. Pas de reprise crash dans A.1.
- La capture du snapshot est dans la transaction de run ; les writers brief/storyboard partagent le verrou projet.
- L exécution média sort de la transaction ; un crash avant finalisation peut laisser des fichiers orphelins.
- Les checksums des snapshots legacy ne sont pas recalculés avec la canonicalisation Domain.

## 8. Conclusion

Les invariants critiques sont couverts par transactions, verrous, index et tests. Le snapshot est cohérent avec le run et les écritures concurrentes sont refusées ou sérialisées. Les limites de durabilité restent explicites.
