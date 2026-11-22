# ADR-0047 — Résultats d'outils volumineux stockés hors base

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P12-02)
- **Sources** : ADR-0011 (artefacts immuables, stockage interchangeable), ADR-0031 (frontière d'exécution), ADR-0046 (provenance des coûts), `docs/delivery/P12-02_LOSSLESS_TOOL_RESULTS.md`.

## Contexte

`ExecutionOperation.result` conservait la sortie d'un outil en JSON inline. Le broker bornait cette colonne à
32 Kio et, au-delà, remplaçait silencieusement la valeur par `{ truncated: true, sizeBytes }`. Une transcription
audio volumineuse (200 segments), une analyse Python ou une liste d'assets dépassent cette borne : l'utilisateur
perdait une donnée payée et `apply` échouait sur un résultat devenu inexploitable. Aucun mécanisme ne permettait de
relire la valeur d'origine.

Contraintes : conserver la borne de 32 Kio sur le JSON opérationnel en base (pas de JSON illimité), ne pas créer de
migration destructive ni de nouvelle colonne, réutiliser le stockage durable existant (`ArtifactStoragePort` local ou
S3), préserver les transitions d'état, les incidents et la frontière d'effet externe exactement-une-fois, ne jamais
rejouer un appel fournisseur payé, et rester transparent pour les consommateurs d'API existants.

## Décision

1. **Borne inline conservée** : un résultat dont le JSON tient en 32 768 caractères reste dans `result`, à l'identique.
2. **Payload immuable au-delà** : la valeur est écrite dans le stockage durable existant sous la clé
   `execution-results/<accountId>/<operationId>/v1.json` (préfixe de propriété, identifiant d'opération unique donc
   écriture non ambiguë), avec en-tête `application/json`, taille et SHA-256 fournis au port ; le port vérifie
   l'empreinte à l'écriture.
3. **Référence bornée en base** : `result` contient alors `{ __resultPayload: 1, provider, key, sha256, sizeBytes, contentType }`
   (moins de 512 octets). La version de schéma est portée par le marqueur et par le suffixe `/v1.json`.
4. **Jamais de troncature silencieuse** : plus aucun code ne produit `{ truncated: true }`. Si l'écriture du payload
   échoue, l'exécution bascule en incident (`UNKNOWN`, réservation conservée) au lieu de perdre la sortie ; les
   marqueurs historiques déjà en base restent lisibles tels quels.
5. **Ordre crash-safe** : le payload est écrit **avant** le règlement, donc avant toute comptabilisation. Une panne
   entre la réponse fournisseur et le règlement laisse l'opération `CLAIMED`, reprise en incident par `recover()`,
   sans réinvocation du moteur : aucun appel payé dupliqué.
6. **Résolution transparente** : les routes et services relisent la valeur d'origine (`loadOperationResult`) avant de
   répondre ; les listes utilisent une résolution par ligne qui, en cas d'échec, renvoie `result: null` **et**
   `resultUnavailable: true` (jamais une valeur fausse ni un silence).
7. **Contrôles à la lecture** : préfixe de propriété du compte vérifié (une référence d'un autre compte est refusée sans
   lire l'objet), fournisseur de stockage identique à la référence, taille et SHA-256 recalculés sur les octets lus,
   borne de 16 Mio, JSON obligatoirement relisible. Toute anomalie lève une erreur 409 typée
   (`result_payload_foreign`, `_missing`, `_corrupt`, `_unavailable`).
8. **Aucune migration, aucun nouveau service** : la colonne `result` reste `Json?` non contrainte, le stockage est
   celui des artefacts, et aucun moteur de workflow n'est ajouté.

## Conséquences

- **Positives** : aucun résultat payé n'est plus perdu ; les transcriptions et analyses volumineuses deviennent
  applicables ; la base reste bornée ; la propriété et l'intégrité sont vérifiées à chaque lecture ; les incidents
  conservent une sortie exploitable pour le rapprochement.
- **Négatives / coûts** : une lecture de liste peut désormais coûter une lecture de stockage par ligne volumineuse
  (30 lignes maximum par endpoint) ; les payloads sont lus sans cache ; un payload orphelin peut subsister si le
  processus meurt entre l'écriture et le règlement (clé déterministe, écrasement inoffensif, aucune purge automatique
  dans ce lot) ; l'API renvoie un corps plus volumineux qu'avant (la vraie valeur au lieu d'un marqueur tronqué).
- **Exploitation** : le stockage doit rester disponible pour relire un historique ; en cas d'indisponibilité, les
  détails échouent explicitement (409) et les listes signalent `resultUnavailable`.
- **Sécurité** : l'identifiant de compte est le préfixe de clé et est vérifié à chaque lecture ; aucune donnée d'un
  autre locataire n'est lisible via une référence forgée ; aucune donnée secrète n'est journalisée.

## Alternatives envisagées

- **Colonne `resultKey`/table de payloads** : rejeté — migration non vérifiable localement en P12-02 et risque de JSON
  illimité en base si l'écriture échoue ou si la valeur dépasse la borne.
- **Créer un asset par résultat** : rejeté — pollue la bibliothèque utilisateur, expose des métadonnées internes comme
  des ressources, et mélange un artefact métier avec un journal d'exécution.
- **Compression en base** : rejeté — la borne de 32 Kio resterait franchie pour les gros résultats et la lecture
  deviendrait opaque pour les consommateurs existants.
- **Conserver le marqueur tronqué et prévenir l'utilisateur** : rejeté — perte de donnée payée, et `apply` reste cassé.

## Références

- ADR-0011, ADR-0031, ADR-0046
- [Preuves P12-02](../delivery/P12-02_LOSSLESS_TOOL_RESULTS.md)
