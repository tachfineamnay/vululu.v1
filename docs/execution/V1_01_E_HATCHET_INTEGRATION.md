# V1-01-E — INTEGRATION HATCHET ET WORKER MEDIA

- **Date** : 2026-10-25
- **Commit code E** : 4595d03

## 1. Worker

Le worker D execute le pipeline :

    validate-snapshot
      -> resolve-capabilities
      -> render-scenes
      -> assemble-master
      -> qa
      -> finalize (publie les octets + DB)
      -> approval durable
      -> transfer mock

Le rendu Sharp/FFmpeg s execute dans le worker, pas dans Fastify. Le worker ecrit dans un workspace local ; seul l upload vers ArtifactStoragePort rend les outputs durables.

## 2. Responsabilites

- Le worker ne connait pas S3 : il utilise ArtifactPublisherPort et ArtifactStoragePort.
- L API ne sert pas de fichiers locaux en mode S3 : ArtifactAccessPort ouvre un flux storage et supporte Range.
- Une reprise apres crash ne suppose pas que le disque du worker precedent contient l output : la version finale est lue par storageKey.
- Une version deja finalisee ne cree pas un second objet : cle deterministe + RunArtifact unique.

## 3. Preuves d integration

| Scenario | Run | Backend | Resultat |
|---|---|---|---|
| Production 10 s | cmvnhkbxl0004ha8s4z5cggea | local | succeeded, master v8 storage local |
| Production 50 s | cmvnhswis000xha8s5dzi1674 | local | succeeded, master v2 local |
| Correction SCENE-003 | cmvnhuymj001qha8se848if8p | local | succeeded, nouveau master, versions conservees |
| Production 10 s | cmvnhy2iv0004havwyunhe7w5 | s3 | succeeded, master v10 S3 |
| Crash worker | cmvni3lqt001phavwpfn1pm1g | s3 | reprise, render attempts 2, 6 objets distincts ready |

## 4. Acces HTTP

- Image S3 servie par API : HTTP 200, image/png, 202071 octets.
- Master S3 avec Range: bytes=0-9 : HTTP 206, 10 octets, Content-Range bytes 0-9/263130.
- Les routes passent par ArtifactAccessPort et l autorisation proprietaire, pas par un chemin brut.

## 5. Limites

- Le renderer ne lit pas encore des medias d entree distants ; il rend a partir du snapshot et des descriptions.
- Le worker n est pas supervise.
- Le 50 s S3 n a pas ete rejoue ; le 50 s local et le 10 s S3 sont les preuves.
- La reprise complete du moteur Hatchet reste NOT_RUN.
