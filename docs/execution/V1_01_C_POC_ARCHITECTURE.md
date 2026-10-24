# V1-01-C — POC HATCHET : ARCHITECTURE

- **Date** : 2026-10-24
- **Branche** : v1-01-c-hatchet-poc
- **Base** : v1-01-b-agentic-capabilities @ 5827a19
- **Branche de gate D conservée** : v1-01-d-gate-blocked @ 9b35d1e
- **Verdict** : GO CONDITIONNEL
- **Portée** : POC isolé, non branché au pipeline de production V1

## 1. Contexte

Le gate V1-01-D avait bloqué l'intégration faute de POC C. Ce lot construit le POC manquant, avec de vraies preuves de reprise après crash, d'idempotence, de retries, d'approbation persistante et de timeouts. Il ne modifie pas le pipeline V1 réel.

## 2. Versions épinglées

| Composant | Version |
|---|---|
| Hatchet engine / embedded sidecar | v0.110.5 |
| @hatchet-dev/typescript-sdk | 1.43.0 |
| Node.js | 24.21.0 |
| Worker TypeScript | séparé du processus API |
| Ledger POC | PostgreSQL vululu_hatchet_poc |
| WSL distro | docker-desktop (sidecar embedded) |
| Docker Desktop | 29.8.1, daemon indisponible |

Le sidecar et le SHA-256 sont documentés dans V1_01_C_OPERATIONS.md.

## 3. Limitation Docker

Docker Desktop a été démarré, mais le moteur a échoué avec une erreur de système de fichiers en lecture seule sur meta.db. Le disque de données WSL /dev/sdd ne présentait plus de système de fichiers. Aucun formatage ni effacement n'a été tenté, pour ne pas détruire les données Docker d'autres projets.

Alternative exécutée : le sidecar embedded officiel Hatchet v0.110.5 sous WSL2, avec le même engine, un worker Windows séparé et un ledger PostgreSQL. Le compose Docker est présent mais marqué NOT_RUN. Cette alternative est une condition du verdict.

## 4. Diagramme de dépendances

    POC driver (Windows Node/TS)
      -> SDK Hatchet 1.43.0
      -> TCP proxy localhost 7077/28243
      -> WSL2 hatchet-embedded-sidecar v0.110.5
      -> embedded Postgres Hatchet
      -> worker Windows Node/TS (processus séparé)
      -> workflow DAG durable
      -> ledger PostgreSQL vululu_hatchet_poc
      -> domain routeCapability (packages/domain, aucun SDK Hatchet)

Le processus API V1 n'exécute pas ce worker et n'importe pas Hatchet.

## 5. Composants du POC

- prepare : snapshot immuable, checksum, run ledger, contrainte d'un seul run actif.
- route : utilise le Domain existant routeCapability sur deux modèles mock ; refus budget.
- generate : cinq effets de scène avec clés d'idempotence ; support crash/retry.
- validate : vérifie les cinq checksums et le nombre d'effets.
- finalize : effet final idempotent, statut waiting_approval.
- approval : tâche durable waitForEvent ; ne bloque pas un worker.
- transfer : vérifie l'approbation, effet mock unique, coût idempotent.
- on-failure : projette l'échec terminal dans le ledger.
- timeout-step : workflow séparé avec executionTimeout: 2s.

## 6. Fichiers

- poc/hatchet/src/ledger.ts : schéma ledger, effets, approbations, coûts.
- poc/hatchet/src/pipeline.ts : DAG durable et provider mock.
- poc/hatchet/src/worker.ts : worker séparé.
- poc/hatchet/src/driver.ts : start/wait/approve/timeout/status.
- poc/hatchet/scripts/harness.ps1 : démarrage/arrêt worker, attente effets.
- poc/hatchet/scripts/start-sidecar.ps1, stop-sidecar.ps1.
- poc/hatchet/scripts/start-proxy.ps1, stop-proxy.ps1.
- poc/hatchet/docker-compose.hatchet.yml : configuration Docker pinned, NOT_RUN.

## 7. Frontières

- Aucun import Hatchet dans packages/domain ou packages/application.
- Le Domain routeCapability reste pur et réutilisé par le POC.
- Le worker est un processus séparé, pas le serveur HTTP.
- Le ledger POC est séparé des données V1 historiques.
- Aucun provider payant, aucun S3, aucun Postiz réel, aucune vidéo réelle.

## 8. Conclusion

Le POC est un laboratoire isolé mais réel : engine Hatchet v0.110.5, worker séparé, état durable, ledger propre, preuves exécutées. Il n'est pas encore intégré à la V1, conformément au périmètre C.