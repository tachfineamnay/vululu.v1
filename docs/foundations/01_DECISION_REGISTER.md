# 01 — Registre des décisions

- **Version** : 1.0
- **Date** : 2026-10-21
- **Mission** : Mission 01 — consolidation des fondations
- **Statut** : registre documentaire ; aucune décision fermée sans validation
- **Base** : main 69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50
- **Sources** : [Rapport d'inauguration](../INAUGURATION_REPORT.md), [ADR](../adr/README.md), [Audit du corpus](01_CORPUS_AUDIT.md), [Matrice](01_TRACEABILITY_MATRIX.md)

## 1. Objet

Reprendre les 13 décisions ouvertes D-01 à D-13 de la Mission 00, fournir une recommandation motivée, identifier le blocage réel et ajouter les décisions nouvelles apparues depuis. Aucune décision n'est transformée en fait sans validation humaine.

## 2. Statuts

- **ACCEPTED** : décision validée par le porteur ou déjà imposée par le corpus.
- **PROPOSED** : recommandation de l'équipe, non validée.
- **OPEN** : décision non tranchée.
- **BLOCKED** : décision impossible sans preuve ou sans arbitrage.
- **CLOSED** : décision sans objet ou contrainte de fait.

## 3. Décisions de la Mission 00

| ID | Sujet | Statut M01 | Recommandation | Blocage réel |
|---|---|---|---|---|
| D-01 | Visibilité du dépôt public | OPEN | Décider avant nouvelles spécifications stratégiques et avant tout push ; recommandation : privé avant contenu sensible | Push et stratégie commerciale |
| D-02 | Corpus officiel : 9 sources contre pack annoncé de 45 | OPEN | Confirmer que les 9 sources sont le corpus effectif ; ne pas reconstituer les 36 autres | Exhaustivité documentaire |
| D-03 | Documents manquants | PROPOSED | Produire M01, M05, M08, M09 ; ne pas inventer 04 | Traçabilité et contrats |
| D-04 | Stack et structure | PROPOSED | Direction TS full-stack, validée par matrice M04 | Démarrage P0-A |
| D-05 | Authentification MCP | OPEN | OAuth 2.1 resource server, scopes, audience, révocation | MCP P0 |
| D-06 | Hatchet définitif | OPEN / BLOCKING | POC M07 obligatoire ; fallback derrière OrchestratorPort | GO technique P0-A |
| D-07 | Stockage S3 et résidence | OPEN | MinIO local, fournisseur compatible à décider en M04/M09 | Déploiement et conformité |
| D-08 | API et mode Postiz | OPEN | Qualifier l'API en M09 ; mock explicite si UNVERIFIED | Handoff P0-E |
| D-09 | Licence | OPEN | Décider avant commercialisation ; ne pas ajouter de licence sans accord | Juridique |
| D-10 | Protection de main | OPEN | Activer après M10 et premier push autorisé | Gouvernance |
| D-11 | Nom du dépôt vululu.v1 | CLOSED | Conserver l'URL fournie ; documenter l'écart avec vululu-ai | Aucun |
| D-12 | Budget, devise, plafonds | OPEN | Fixer en M04 et M10 | Coûts et garde-fous |
| D-13 | Rétention et purge | OPEN | Fixer en M08/M09 avec CDC-N-011 | Conformité et stockage |

## 4. Nouvelles décisions

| ID | Sujet | Statut | Recommandation | Blocage |
|---|---|---|---|---|
| D-14 | Direction visuelle UX-0 | OPEN | Trois directions en M03, choix humain obligatoire avant frontend | Frontend P0-A |
| D-15 | Ordre de production des contrats | PROPOSED | M05 domaine, M06 agents/providers, M08 MCP, M09 média/Postiz | Contrats P0 |
| D-16 | Qualification réelle des providers | OPEN | M06 vérifie les docs officielles à date ; aucun modèle « meilleur » sans benchmark | Routing et coûts |
| D-17 | Capacité réelle du VPS partagé | OPEN | Mesurer si accessible, sinon hypothèse et plan de mesure en M04 | Exploitation |
| D-18 | Canal d'invitation | OPEN | Lien d'invitation copiable, email optionnel plus tard | UX et auth |

## 5. Classification des blocages

### 5.1 Bloque la documentation maintenant

- D-02 : sans confirmation du corpus, l'audit reste partiel.
- D-04 : la stack conditionne l'architecture et les contrats.
- D-06 : le POC Hatchet conditionne la durabilité, pas les documents.
- D-15 : les contrats doivent être ordonnés pour éviter les doublons.

### 5.2 Bloque le GO technique P0-A

- D-04 : stack acceptée.
- D-05 : auth MCP définie.
- D-06 : POC Hatchet PASS.
- D-07 : stockage choisi.
- D-12 : budget et plafonds définis.
- D-15 : contrats de base produits.
- D-16 : providers qualifiés ou mocks explicites.

### 5.3 Bloque le déploiement ou la commercialisation

- D-01 : visibilité du dépôt.
- D-08 : Postiz qualifié.
- D-09 : licence.
- D-10 : protection de main.
- D-13 : rétention et purge.
- D-17 : capacité VPS.
- D-18 : canal d'invitation.

### 5.4 P1 ou V2

- D-11 : résolu par contrainte.
- D-14 : design, avant frontend mais après M02.
- Studio Pro, Memory Bank, monétisation : V2, hors fondations.

## 6. Recommandations détaillées

### D-01 — Visibilité

Le dépôt est public. Les documents de fondation ne contiennent pas de secrets, mais les spécifications stratégiques, contrats commerciaux, données clients et maquettes confidentielles ne doivent pas y être poussés. Recommandation : statuer avant tout push stratégique ; si le produit reste interne, passer le dépôt en privé. Aucune modification de visibilité dans cette mission.

### D-02 — Corpus

Les 9 sources sont vérifiées et suffisent pour la Mission 01. Le pack de 45 fichiers n'est pas intégralement présent. Il ne faut ni le reconstituer ni prétendre que les 9 sources sont exhaustives. Recommandation : confirmer le corpus effectif et documenter les 36 fichiers manquants comme lacune.

### D-06 — Hatchet

Hatchet reste candidat conditionnel. Le POC M07 doit prouver reprise après crash, idempotence d'un effet externe, approbation persistée et correction ciblée. Un NOT_RUN, FAIL ou PARTIAL interdit le GO technique P0-A. Le port OrchestratorPort permet un moteur alternatif sans réécrire le domaine.

### D-09 — Licence

Aucune licence n'est ajoutée. Le dépôt public reste sans licence explicite, ce qui n'autorise pas la réutilisation commerciale. Recommandation : décider avant toute ouverture commerciale ou distribution externe.

### D-12 / D-13 — Coûts et rétention

Les valeurs ne sont pas fixées. Recommandation : définir devise, plafond par run, seuil d'alerte et durées de rétention avant le GO P0-A et avant tout déploiement. Ne pas inventer de montants dans les documents.

## 7. Décisions qui ne doivent pas être prises par l'IA

- Visibilité du dépôt.
- Licence.
- Budget et prix.
- Choix de la direction visuelle.
- Validation du corpus.
- Autorisation de push ou de déploiement.
- Autorisation d'appels fournisseurs payants ou de publication sociale.

## 8. Règle de mise à jour

- Toute décision validée passe de OPEN/PROPOSED à ACCEPTED avec date, auteur et preuve.
- Une décision refusée est marquée REJECTED avec motif.
- Aucune décision n'est fermée par simple préférence de l'IA.
- Les décisions structurantes deviennent un ADR.

## 9. Références

- [Rapport d'inauguration](../INAUGURATION_REPORT.md), section 9
- [ADR README](../adr/README.md)
- [Audit du corpus](01_CORPUS_AUDIT.md)
- [Matrice de traçabilité](01_TRACEABILITY_MATRIX.md)
- [Tests d'acceptation](../10_ACCEPTANCE_TESTS.md)
