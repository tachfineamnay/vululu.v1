# V1-01-A.1 — COHÉRENCE DB, MÉDIA ET ARTEFACTS

- **Date** : 2026-10-23
- **Branche** : v1-01-a1-consolidation
- **Commit** : b1824c1
- **Périmètre** : PostgreSQL, MediaRendererPort, LocalStoragePort, artefacts locaux

## 1. Frontières

1. **PostgreSQL** : source de vérité des métadonnées, versions, checksums, snapshots, outputs, approbations et statuts.
2. **MediaRendererPort** : écrit les PNG et le MP4 sur le filesystem local via @vululu/media (Sharp/FFmpeg déterministe).
3. **StoragePort/LocalStoragePort** : résout les chemins sous data/artifacts et refuse toute évasion de racine.
4. **HTTP** : la route streame des octets ; elle ne choisit plus la version DB ni le chemin.

## 2. Séquence d une production

1. startRun crée snapshot + JobRun + StepRun + ProductionJob dans une transaction.
2. L exécuteur média rend tous les fichiers PNG et le master MP4 hors transaction.
3. La finalisation ouvre UNE transaction et écrit :
   - les SceneVersion,
   - l ArtifactVersion master,
   - l invalidation des approbations antérieures,
   - la QA de l artefact,
   - les outputs/checksum du JobRun,
   - les statuts StepRun/JobRun/ProductionJob/projet.
4. Les fichiers sont donc écrits avant les lignes DB. Un crash avant la finalisation laisse des fichiers orphelins, jamais des versions DB partielles.

## 3. Anti-écrasement

- Les chemins incluent projectId/sceneKey/version ; une version n est jamais réutilisée.
- Une seule production active par projet (index unique partiel + verrou).
- Les scènes/master ont des contraintes uniques sceneId/version et artifactId/version.
- Un fichier existant pour la même version ne doit pas être écrasé : l allocation de version précède l écriture ; la finalisation échoue sur conflit DB sans réécrire un ancien chemin.

## 4. Audit des orphelins

Script read-only :

    pwsh -NoProfile -File scripts/audit-artifacts.ps1 -DatabaseUrl <url> -OutputJson <fichier>

Il compare les chemins SceneVersion.imagePath et ArtifactVersion.masterPath aux fichiers présents sous data/artifacts.

Résultat réel du 2026-10-23 :

- chemins DB : 207 ;
- fichiers présents : 481 ;
- fichiers DB manquants : 0 ;
- fichiers sans ligne DB : 274.

Les 274 orphelins incluent des fichiers intermédiaires FFmpeg (frames/concat), des anciens artefacts et des essais. Aucun n est supprimé automatiquement. Le script ne modifie ni la DB ni le filesystem ; il sort 0 si aucun fichier DB ne manque, 2 sinon.

## 5. Stratégie de réconciliation

- Aucun GC automatique en A.1.
- Toute suppression devra être une opération humaine explicite, après comparaison des checksums et vérification que le fichier n est pas référencé par un artifact version.
- Les fichiers intermédiaires (frames, concat) doivent être exclus ou déplacés hors de la racine publique lors du passage à S3.
- Les checksums sont vérifiables par StoragePort.checksum et par les colonnes DB.
- Un futur job de réconciliation pourra tourner en lecture seule et produire un rapport ; la suppression restera séparée.

## 6. Limites

- Le filesystem local n est pas transactionnel avec PostgreSQL.
- Pas de S3, pas de versioning objet, pas de rétention.
- Un crash après écriture des fichiers et avant la transaction de finalisation laisse des orphelins.
- Un crash pendant la transaction de finalisation rollback les métadonnées ; les fichiers restent.
- Le script d audit ne vérifie pas encore les checksums bit-à-bit ; il vérifie présence/absence.

## 7. Conclusion

La frontière DB/média est explicite, les écritures sont ordonnées, les versions ne sont pas écrasées et les orphelins sont observables. La stratégie de nettoyage est volontairement manuelle en A.1.
