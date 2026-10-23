# V1-01-A — SNAPSHOTS ET VERSIONNEMENT

- **Date** : 2026-10-23
- **Branche** : v1-01-a-application-layer
- **Base** : v1-00-foundation, commit 83abb8e
- **Tables** : JobRun, StepRun, ContextRevision, BriefRevision, CharacterVersion, SceneVersion, ArtifactVersion
- **Migration** : 20261023160509_v1_01_a_snapshot_versioning

## 1. Objet

Chaque production doit pouvoir être expliquée et reproduite à partir de références immuables : révision de contexte, révision de brief, versions de scènes, versions de personnages, politique provider, paramètres de rendu et checksums.

Le snapshot est séparé en deux documents :

1. **snapshot d entrée** : figé au lancement du run, immuable ;
2. **outputs de run** : resultat produit, ajouté à la fin, avec son propre checksum.

## 2. Modèle JobRun

| Colonne | Rôle |
|---|---|
| snapshot | document JSON d entrée, schemaVersion 1 |
| snapshotVersion | version du schéma de snapshot, valeur 1 |
| snapshotChecksum | SHA-256 du document snapshot |
| outputs | document JSON de resultat (scènes, master, QA) |
| outputsChecksum | SHA-256 du document outputs |
| status | queued, running, succeeded, failed |
| createdAt, updatedAt | horodatage |
| StepRun | étapes snapshot, render-scenes, assemble-master, qa |

## 3. Schéma du snapshot d entrée

    schemaVersion: 1
    capturedAt: ISO-8601
    project: id, platform, format, sceneDurationSeconds, status
    context:
      revisionId, checksum, data
    brief:
      revisionId, version, checksum, data
    scenes[]:
      sceneId, sceneKey, position, durationSeconds, version, checksum
    characters[]:
      characterId, characterKey, version, checksum, name, description
    providerPolicy:
      provider: local-deterministic
      model: scene-svg-v1
      deterministic: true
    render:
      width: 1080, height: 1920, fps: 30
      imageFormat: png, videoCodec: h264, audioCodec: aac
      audioSilent: true

## 4. Schéma des outputs

    completedAt: ISO-8601
    scenes[]:
      sceneKey, version, checksum, imagePath
    master:
      version, checksum, masterPath, duration, videoCodec, audioCodec
    qa:
      status, checks[]

Les checksums des scènes et du master sont ceux enregistrés dans SceneVersion et ArtifactVersion. Ils sont donc vérifiables indépendamment du snapshot.

## 5. Versionnement et immuabilité

- schemaVersion identifie la forme du document ; valeur 1 pour V1-01-A.
- snapshotVersion stocke la version du document dans JobRun ; valeur 1.
- Le snapshot d entrée n est jamais modifié après création.
- Les outputs sont un document séparé, écrit une fois en fin de run.
- Chaque document a son checksum SHA-256.
- Une évolution future de schéma devra incrémenter schemaVersion/snapshotVersion et préserver la lecture des versions antérieures.
- Les migrations V1-01-A déplacent les anciens outputs éventuellement présents dans snapshot vers outputs, puis recalculent les checksums.

## 6. Outils et transactions

| Opération | Transaction |
|---|---|
| Création contexte + ContextRevision | Prisma transaction, rollback si révision échoue |
| Création/mise à jour brief + BriefRevision | Prisma transaction dans le service legacy encapsulé |
| Capture snapshot + JobRun + StepRun | Lecture des révisions, puis transaction JobRun+StepRun |
| QA + ArtifactVersion + outputs | Transaction Prisma : mise à jour QA de l artefact et outputs/checksum du JobRun |
| Statut des étapes | StepRun mis à jour par l exécutant, pas de transaction média |

Un test d intégration vérifie que JobRun et StepRun sont créés ensemble et qu une erreur de clé étrangère annule tout le JobRun.

## 7. Preuves sur runs réels

### Smoke 10 s après migration

Projet cmvl65teb0008hask98puyafk :

- deux JobRun : produce et correction, status succeeded ;
- snapshotVersion 1, snapshotChecksum de 64 caractères ;
- outputs non nul, outputsChecksum de 64 caractères ;
- snapshot ne contient plus outputs ;
- 5 scènes, 1 personnage ;
- contexte et brief reliés par revisionId ;
- 4 StepRun succeeded par job ;
- QA PASS.

### Cible 50 s

Projet cmvl690kf002hhasko6ar8vnl :

- JobRun produce succeeded ;
- snapshotVersion 1, snapshotChecksum 64, outputsChecksum 64 ;
- duration outputs.master = 49.97 ;
- master checksum feba893dbb22c945ccb2c41d5eb2021360a3d7c73cddb43e1ef21347941496b8 ;
- QA PASS, FFprobe 49,966667 s, H.264 1080x1920 + AAC ;
- hash fichier identique au checksum DB.

### Migration sur copie

Base copie vululu_v0 restaurée, migration deploy appliquée :

- 16 projets ;
- 13 ContextRevision ;
- 12 CharacterVersion ;
- 23 JobRun legacy ;
- colonnes snapshotVersion, snapshotChecksum, outputs, outputsChecksum présentes ;
- aucun échec.

## 8. Limites

- La capture lit les révisions, puis crée le JobRun dans une transaction séparée. Les révisions sont immuables, mais la capture et l insertion ne forment pas une seule transaction.
- Les fichiers médias ne sont pas transactionnels avec PostgreSQL ; un crash entre écriture fichier et mise à jour DB peut laisser un fichier orphelin.
- L exécution média reste in-process et non durable.
- Le provider et les paramètres de rendu sont déterministes et locaux.
- Le snapshot ne remplace pas un stockage S3 ni une provenance provider réelle.

## 9. Conclusion

Le schéma et le versionnement des snapshots sont réels, testés et reliés aux révisions immuables. Les outputs sont séparés et checksummés. Le lot est GO CONDITIONNEL : la reproductibilité documentaire est en place, la durabilité d exécution reste à traiter en V1-01-B.