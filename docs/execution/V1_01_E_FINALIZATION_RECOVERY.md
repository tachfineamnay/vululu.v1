# V1-01-E — FINALISATION, CRASH ET RECUPERATION

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Cycle de vie

    pending -> uploading -> staged -> ready
                         \-> failed
    sans reference DB -> orphaned (candidat d inventaire, jamais supprime automatiquement)

Ces etats sont portes par ArtifactObject. Les versions metier SceneVersion et ArtifactVersion ne sont creees qu a la finalisation transactionnelle, lorsque les octets sont deja transferes et verifies.

## 2. Sequence de reference

1. Le worker rend le media dans un espace temporaire local.
2. Le publisher calcule taille et SHA-256 du fichier.
3. Une ligne ArtifactObject est reservee avec une cle deterministe et l etat uploading.
4. Le fichier est transfere via ArtifactStoragePort.
5. head est relu et compare a SHA-256 et a la taille attendue.
6. ArtifactObject passe staged.
7. La transaction PostgreSQL cree SceneVersion ou ArtifactVersion et RunArtifact, passe ArtifactObject a ready et enregistre le manifest.
8. L approbation exacte D reste la condition du transfert.

Aucune transaction PostgreSQL n est ouverte pendant le rendu ou l upload.

## 3. Point de validation metier

Le point definitif est le commit de la transaction de finalisation. Avant ce commit, une version metier n est pas annoncee prete ; un objet staged peut devenir un orphelin visible. Apres le commit, checksum, taille, cle et reference sont coherents.

## 4. Crashs traites

| Crash | Comportement |
|---|---|
| avant upload | ArtifactObject pending/uploading, aucune version DB |
| pendant upload | objet partiel ou absent, retry idempotent |
| apres upload avant DB | objet staged, retry retrouve head/checksum |
| apres commit DB avant ack | RunArtifact existant, rejeu retourne la version existante |
| double finalisation | RunArtifact unique, pas de second master |
| retry reseau | meme cle, putFile/putObject idempotent si checksum identique |
| objet existant meme checksum | reutilise |
| objet existant checksum different | refus conflict |

## 5. Preuve de crash E

Run cmvni3lqt001phavwpfn1pm1g, backend S3 :

- worker tue pendant render-scenes apres sauvegarde de la premiere scene ;
- StepRun render-scenes running, output scenes=1, aucun objet finalise ;
- worker redemarre, render-scenes attempts=2, output scenes=5 ;
- finalisation S3, 6 ArtifactObject distincts (5 scenes + master), tous ready ;
- approbation exacte et transfert mock, JobRun succeeded.

Previous crash attempt cmvni13sy0010havw2hcnnnew had completed finalization before kill ; it was approved and succeeded and also proves no duplicate final artifact.

## 6. Preuve des productions

- 10 s local : JobRun cmvnhkbxl0004ha8s4z5cggea, master v8 storageKey local, 5 scenes, succeeded.
- 50 s local : JobRun cmvnhswis000xha8s5dzi1674, master v2 local, 793741 octets, succeeded.
- 10 s S3 : JobRun cmvnhy2iv0004havwyunhe7w5, master v10 S3, succeeded.
- Crash S3 : master v11 S3, succeeded apres approbation.

## 7. Limite

Le protocole ne realise pas de transaction distribuee S3/PostgreSQL. La reconciliation est l inventaire read-only ; les objets staged sans DB restent des candidats, pas des suppressions automatiques.
