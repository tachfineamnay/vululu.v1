# Tests d'acceptation — Vululu AI V1

- **Version** : 1.1
- **Date** : 2026-10-21
- **Statut** : catalogue SPECIFIED, non exécuté, Mission 01
- **Source** : [CDC V1.2](02_CAHIER_DES_CHARGES_V1.md), section E et exigences CDC-F / CDC-N ; [PRD V1.2](01_PRD_V1.md)
- **Mission** : Mission 01 — consolidation des fondations
- **Portée** : P0 bloquant, P1 différé ; V2 exclue
- **Règle** : aucun test n'est exécuté dans cette mission ; tous sont au statut NOT_RUN

## 1. Objet

Ce document transforme les exigences du cahier des charges en tests d'acceptation observables. Il sert de référence pour les futurs lots P0-0 à P0-F. Aucun test ne peut être déclaré réussi sans preuve d'exécution (commande, réponse API, capture, journal, rapport de test automatisé).

## 2. Conventions

- **Identifiant** : T-001 à T-042, stable.
- **Priorité** : P0 bloquant pour la V1, P1 différé.
- **Statut** : NOT_RUN (non exécuté), PASS, FAIL, BLOCKED, SKIPPED.
- **Exigences** : références PRD-xx, CDC-F-xxx, CDC-N-xxx, UX-0.
- **Preuve attendue** : test automatisé, réponse API, capture d'écran, journal d'audit, rapport QA, reçu de transfert, commande reproductible.
- **Un test = un critère observable** ; les exigences voisines peuvent partager un test.
- **Aucune credential réelle** : les tests utilisent des comptes de test et des mocks tant que l'environnement réel n'est pas autorisé.

## 3. Environnement et préconditions

L'environnement d'exécution sera défini par P0-0 (stack, PostgreSQL, S3-compatible, Hatchet, fournisseurs mockés). Préconditions générales :

- base de test isolée, remise à zéro entre campagnes ;
- comptes de test super-utilisateur et invité ;
- fournisseurs IA en mode mock, puis réel uniquement après autorisation ;
- Postiz en mode mock, puis réel uniquement après autorisation ;
- jeux de données sans données personnelles réelles ;
- secrets fournis par variables d'environnement, jamais dans le dépôt ;
- preuve d'exécution archivée avec le test.

## 4. Couverture

| Domaine | Tests | Exigences principales |
|---|---|---|
| Identité et accès | T-001 à T-004 | CDC-F-001, 002, 003, 060 ; CDC-N-001 |
| Contextes, assets, campagnes | T-005 à T-007 | CDC-F-010 à 013 ; PRD-15, PRD-16 |
| Wizard, brief, audio | T-008 à T-013 | CDC-F-020 à 024 ; CDC-N-009 |
| Agents, registre, routage, coûts | T-014 à T-018 | CDC-F-030 à 033, 061 |
| Rendu, scènes, artefacts, audio | T-019 à T-023 | CDC-F-040 à 044, 050, 023 ; CDC-N-006 |
| QA, approbation, Postiz | T-024 à T-026 | CDC-F-050 à 052 ; CDC-N-009 |
| MCP | T-027 à T-029 | CDC-F-070, 071 |
| Durabilité, sauvegarde, audit, sécurité, accessibilité | T-030 à T-035 | CDC-F-043, 060 ; CDC-N-002 à 005, 008, 011, 012 |
| Verticales E2E et pilote | T-036 à T-040 | Objectifs PRD section 7 |
| P1 différé | T-041 | CDC-F-080 |
| Qualité des tests et reproductibilité | T-042 | CDC-N-007 |

La correspondance complète exigence vers test est dans [01_TRACEABILITY_MATRIX.md](foundations/01_TRACEABILITY_MATRIX.md).

## 4.1 Statut des exigences et classification

Le catalogue distingue le statut de l'exigence, le statut du test et le statut d'exécution.

| Catégorie | Éléments | Statut |
|---|---|---|
| Exigences V1 acceptées | PRD-01 à PRD-16 ; CDC-F-001 à CDC-F-071 ; CDC-N-001 à CDC-N-012, sauf mention contraire | ACCEPTED |
| Exigence P1 différée | CDC-F-080 | ACCEPTED, P1 |
| UX-0 | Interlocuteur unique, cinq intentions, parcours, états, critères UX | PROPOSED |
| Contrats API, agents, modèles, assets, MCP, Postiz | Documents non encore produits | PROPOSED / à produire |
| Environnement de test et credentials | Aucun environnement réel disponible | PROPOSED |
| Catalogue de tests lui-même | Tests définis à partir du CDC | SPECIFIED |

Points ouverts qui ne changent pas le statut de l'exigence mais bloquent sa preuve :

- politique de routage complète : PRD-07 contre CDC-F-033 ;
- métriques de succès des campagnes : PRD-16 et CDC-F-013 ;
- niveaux d'approbation : un ou plusieurs niveaux humains à préciser ;
- authentification MCP : mécanisme à trancher ;
- API Postiz : à qualifier ;
- fournisseur S3 et résidence : à décider ;
- budgets, devise et rétention : valeurs à fixer.

**Classification des tests** :

- **SPECIFIED** : le test est défini, avec préconditions, étapes, résultat attendu et preuve.
- **NOT_RUN** : le test n'a pas été exécuté ; aucun code applicatif n'existe.
- **PASS / FAIL** : réservés à une exécution future avec preuve.
- **MOCK** : réservé aux tests exécutés contre un fournisseur simulé.
- Aucun test de ce document n'est PASS. Tous sont SPECIFIED et NOT_RUN.

## 5. Catalogue des tests

### 5.1 Identité et accès

**T-001 — Cycle d'invitation valide**
- Priorité : P0
- Exigences : PRD-01, CDC-F-001
- Préconditions : super-utilisateur connecté ; aucun compte invité existant ; service d'invitation disponible.
- Étapes : 1) émettre une invitation nominative avec durée de validité ; 2) vérifier le jeton et sa date d'expiration ; 3) activer le compte ; 4) consulter la liste des utilisateurs et le journal.
- Résultat attendu : invitation à durée limitée, activation unique, compte créé avec rôle invité, trace d'audit.
- Preuve attendue : réponse API, entrée d'audit, test automatisé du cycle.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : dépend de l'environnement P0-A.

**T-002 — Invitation invalide, expirée ou révoquée**
- Priorité : P0
- Exigences : CDC-F-001
- Préconditions : invitation de test expirée, révoquée ou inexistante.
- Étapes : 1) tenter l'activation avec un jeton expiré ; 2) tenter avec un jeton révoqué ; 3) tenter avec un jeton inexistant ; 4) vérifier l'absence de création de compte.
- Résultat attendu : refus explicite, aucun compte créé, aucun contournement, événement audité.
- Preuve attendue : réponses d'erreur, journal, tests automatisés.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : inclure la réutilisation d'un jeton déjà consommé.

**T-003 — RBAC et isolation inter-utilisateurs**
- Priorité : P0
- Exigences : PRD-01, CDC-F-002, CDC-N-001
- Préconditions : deux utilisateurs invités avec des ressources distinctes ; un super-utilisateur.
- Étapes : 1) tenter la lecture d'un contexte d'un autre utilisateur via API ; 2) tenter une modification par identifiant direct (IDOR) ; 3) tenter l'accès aux ressources d'administration ; 4) répéter les tentatives via MCP.
- Résultat attendu : refus systématique, aucun contenu tiers révélé, refus journalisé.
- Preuve attendue : tests API et MCP, journal de sécurité.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : inclure les listes paginées et les recherches.

**T-004 — Page super-utilisateur minimale**
- Priorité : P0
- Exigences : PRD-11, CDC-F-003, CDC-F-060
- Préconditions : super-utilisateur ; plusieurs invités à statuts différents.
- Étapes : 1) ouvrir la page d'administration ; 2) vérifier les colonnes utilisateur, invitation, activation, statut, projets ; 3) vérifier l'absence de données inutiles ; 4) vérifier l'accès refusé pour un invité.
- Résultat attendu : page lisible, données strictement nécessaires, RBAC appliqué.
- Preuve attendue : capture, test d'autorisation, requête API.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : l'administration doit rester minimale conformément à PRD-11.

### 5.2 Contextes, assets et campagnes

**T-005 — Création et validation d'un contexte**
- Priorité : P0
- Exigences : PRD-02, CDC-F-010, CDC-F-011
- Préconditions : utilisateur invité ; URL, description, produits et logos de test.
- Étapes : 1) créer un contexte avec URL, description, offres, identité, assets et liens sociaux ; 2) lancer l'analyse assistée ; 3) distinguer faits sourcés et hypothèses ; 4) valider manuellement la fiche ; 5) vérifier context_id et revision_id.
- Résultat attendu : contexte persisté, révision immuable, provenance des faits, validation explicite.
- Preuve attendue : test API, comparaison de révisions, journal de provenance.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : une URL inaccessible ne doit pas produire de contenu inventé.

**T-006 — Révision de contexte et snapshot de run**
- Priorité : P0
- Exigences : PRD-02, CDC-F-012
- Préconditions : contexte validé, projet lancé avec ce contexte.
- Étapes : 1) lancer un run sur la révision A ; 2) modifier le contexte courant vers la révision B ; 3) rejouer l'ancien run ; 4) vérifier les snapshots.
- Résultat attendu : l'ancien run reste attaché à la révision A ; aucune altération rétroactive.
- Preuve attendue : enregistrements de run, comparaison des snapshots.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : vérifier aussi les briefs et configs d'agents figés.

**T-007 — Bibliothèque d'assets, licences et campagnes**
- Priorité : P0
- Exigences : PRD-15, PRD-16, CDC-F-013
- Préconditions : contexte avec assets graphiques, audio et documents.
- Étapes : 1) importer des assets avec licence et provenance ; 2) retrouver un asset par contexte ; 3) regrouper plusieurs projets dans une campagne ; 4) sélectionner explicitement un asset dans un brief.
- Résultat attendu : assets versionnés et licenciés, campagne identifiable, aucune préférence apprise automatiquement.
- Preuve attendue : test API, rapport de licence, vue de bibliothèque.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les métriques de succès des campagnes restent à préciser.

### 5.3 Wizard, brief et audio

**T-008 — Réseau, format et objectif**
- Priorité : P0
- Exigences : PRD-03, CDC-F-020
- Préconditions : contexte validé ; profils TikTok, Instagram et LinkedIn.
- Étapes : 1) choisir un réseau ; 2) choisir un format, un ratio et une durée ; 3) choisir organique ou sponsorisé ; 4) choisir image, carrousel, motion ou vidéo ; 5) tester des combinaisons invalides.
- Résultat attendu : seules les combinaisons supportées sont proposées ; les formats indisponibles sont expliqués ; la configuration est persistée.
- Preuve attendue : test d'interface ou API, matrice de compatibilité.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les profils média doivent être versionnés.

**T-009 — Voix off optionnelle**
- Priorité : P0
- Exigences : PRD-05, CDC-F-021
- Préconditions : script de test ; voix autorisée disponible ou mock.
- Étapes : 1) choisir l'absence de voix ; 2) choisir une voix, une langue et un script ; 3) demander un aperçu ; 4) tester une voix non autorisée.
- Résultat attendu : les deux cas fonctionnent, la voix non autorisée est refusée, le texte lu est versionné.
- Preuve attendue : test audio, contrat de voix, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : l'aperçu peut être indisponible ; l'alternative doit être affichée.

**T-010 — Musique, licence et provenance**
- Priorité : P0
- Exigences : PRD-05, CDC-F-022, CDC-N-009
- Préconditions : bibliothèque licenciée de test ; fichier utilisateur de test.
- Étapes : 1) choisir une musique licenciée ; 2) importer un fichier utilisateur avec provenance ; 3) tester une licence incompatible avec la publicité ; 4) vérifier le blocage.
- Résultat attendu : provenance et licence attachées, musique incompatible refusée pour un brief sponsorisé.
- Preuve attendue : fiche de licence, test de blocage, audit.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la vérification des droits doit être rejouée avant publicité.

**T-011 — Mix voix et musique**
- Priorité : P0
- Exigences : PRD-05, CDC-F-023
- Préconditions : voix et musique de test.
- Étapes : 1) générer un mix initial ; 2) vérifier le ducking et les limites de crête ; 3) ajuster manuellement voix et musique ; 4) comparer les niveaux.
- Résultat attendu : mix calibré, ducking effectif, crêtes maîtrisées, correction manuelle persistée.
- Preuve attendue : analyse audio, captures de niveaux, test automatisé.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les valeurs de calibration seront fixées en P0-B/P0-D.

**T-012 — BriefRevision structuré et comparé**
- Priorité : P0
- Exigences : PRD-03, PRD-06, CDC-F-024
- Préconditions : brief de test avec plusieurs options.
- Étapes : 1) compiler un brief structuré ; 2) calculer son hash ; 3) modifier une option et créer une nouvelle révision ; 4) comparer les deux révisions ; 5) confirmer une révision.
- Résultat attendu : révisions immuables, hash stable, comparaison lisible, confirmation explicite avant run.
- Preuve attendue : test de contrat, diff de révisions, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : aucun run ne doit démarrer sur un brief non confirmé.

**T-013 — Débrief conversationnel et estimation**
- Priorité : P0
- Exigences : PRD-06, PRD-13, CDC-F-024, CDC-F-061
- Préconditions : brief en cours ; grille de coûts mock.
- Étapes : 1) dialoguer avec l'agent de brief ; 2) vérifier la synthèse des choix ; 3) obtenir une estimation de coût avant production ; 4) confirmer ou revenir en arrière.
- Résultat attendu : synthèse fidèle, estimation affichée, aucune production avant confirmation, coût estimé tracé.
- Preuve attendue : transcript, estimation, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les valeurs de budget seront fixées en P0-0.

### 5.4 Agents, registre, routage et coûts

**T-014 — AgentDefinition, configuration et rollback**
- Priorité : P0
- Exigences : PRD-06, PRD-11, CDC-F-031, CDC-N-010
- Préconditions : super-utilisateur ; agent de test.
- Étapes : 1) modifier le soul ou les instructions d'un agent ; 2) promouvoir explicitement une configuration ; 3) lancer un run ; 4) revenir à la version précédente ; 5) vérifier le gel de la version active au lancement.
- Résultat attendu : configuration versionnée, promotion explicite, rollback possible, run figé.
- Preuve attendue : historique de configuration, test de rollback, snapshot de run.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : aucun changement silencieux de configuration.

**T-015 — Registre des fournisseurs, modèles et capacités**
- Priorité : P0
- Exigences : PRD-07, CDC-F-032
- Préconditions : adaptateur mock d'un fournisseur.
- Étapes : 1) ajouter un fournisseur et un modèle ; 2) déclarer une capacité ; 3) désactiver le fournisseur ; 4) vérifier que le cœur ne change pas ; 5) tester un modèle non qualifié.
- Résultat attendu : registre versionné, activation et désactivation sans modification du domaine, refus des capacités non déclarées.
- Preuve attendue : test de contrat, configuration, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la qualification réelle des fournisseurs reste à faire.

**T-016 — Routage et fallback**
- Priorité : P0
- Exigences : PRD-07, CDC-F-033
- Préconditions : deux fournisseurs mock pour une capacité ; budgets et licences de test.
- Étapes : 1) lancer une demande ; 2) vérifier les critères de compatibilité, licence et budget ; 3) simuler la panne du fournisseur principal ; 4) vérifier le fallback et la trace ; 5) comparer avec les critères de qualité, latence et santé du PRD-07.
- Résultat attendu : routage traçable, fallback admissible, brief inchangé, critères complets explicités.
- Preuve attendue : journal de décision de routage, test de panne.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : point de contradiction PRD-07 contre CDC-F-033 à trancher en P0-C.

**T-017 — Estimation, plafond et coût réel**
- Priorité : P0
- Exigences : PRD-13, CDC-F-061
- Préconditions : grille de coûts mock ; seuil de test.
- Étapes : 1) estimer un run ; 2) fixer un plafond ; 3) exécuter un run sous le plafond ; 4) tenter un run au-dessus du plafond ; 5) vérifier le coût réel par fournisseur, modèle et étape.
- Résultat attendu : refus au-dessus du plafond, coût réel normalisé, alerte si seuil approché, trace auditable.
- Preuve attendue : test de coût, journal, rapport.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : devise et seuils à fixer en P0-0.

**T-018 — Planification et exécution en étapes**
- Priorité : P0
- Exigences : PRD-06, CDC-F-030
- Préconditions : brief confirmé ; trois agents mock.
- Étapes : 1) demander un plan ; 2) vérifier le graphe de dépendances ; 3) exécuter les étapes ; 4) injecter un échec ; 5) vérifier les états et la reprise.
- Résultat attendu : plan explicite, étapes ordonnées, états corrects, échec isolé et traçable.
- Preuve attendue : journal de run, graphe, test d'échec.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la granularité des étapes sera fixée en P0-C.

### 5.5 Rendu, scènes, artefacts et audio

**T-019 — Image et carrousel conformes**
- Priorité : P0
- Exigences : PRD-04, PRD-14, CDC-F-040, CDC-F-050
- Préconditions : fournisseur d'image mock ; profil Instagram.
- Étapes : 1) générer une image ; 2) générer un carrousel ; 3) vérifier ratio, dimensions et codec ; 4) vérifier le preview et le master ; 5) demander un format non supporté.
- Résultat attendu : fichiers conformes au profil, preview disponible, format indisponible expliqué.
- Preuve attendue : inspection des fichiers, rapport QA, test automatisé.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les profils média sont versionnés.

**T-020 — Continuité des Scene ID et Character ID**
- Priorité : P0
- Exigences : PRD-08, CDC-F-040
- Préconditions : projet vidéo multiscène avec personnages.
- Étapes : 1) créer trois scènes ; 2) relever scene_id et character_id ; 3) créer de nouvelles révisions ; 4) vérifier la stabilité des identifiants ; 5) vérifier que les identifiants fournisseurs restent des bindings facultatifs.
- Résultat attendu : identifiants applicatifs stables, aucune renumérotation, bindings fournisseurs séparés.
- Preuve attendue : export des identifiants, comparaison de versions.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la continuité cross-provider n'est pas garantie et doit être documentée.

**T-021 — Correction ciblée d'une scène**
- Priorité : P0
- Exigences : PRD-08, PRD-09, CDC-F-042, CDC-F-044
- Préconditions : vidéo de trois scènes approuvée en version 1.
- Étapes : 1) demander la modification de la scène 3 ; 2) vérifier la nouvelle SceneVersion ; 3) vérifier les étapes dépendantes relancées ; 4) vérifier les scènes 1 et 2 inchangées ; 5) demander une scène inexistante.
- Résultat attendu : seule la scène 3 et ses dépendances sont recalculées, l'ancienne version est conservée, la scène inexistante est refusée.
- Preuve attendue : diff de versions, delta de coût, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la musique, les transitions et le grading peuvent invalider davantage d'étapes.

**T-022 — Artefacts immuables et checksums**
- Priorité : P0
- Exigences : PRD-08, PRD-15, CDC-F-041, CDC-N-006
- Préconditions : artefacts de test en stockage S3-compatible.
- Étapes : 1) créer un artefact ; 2) calculer son SHA256 ; 3) tenter de l'écraser ; 4) créer une nouvelle version ; 5) vérifier l'URI temporaire et la provenance.
- Résultat attendu : écrasement refusé, nouvelle version numérotée, checksum et provenance conservés, base sans blob lourd.
- Preuve attendue : test de stockage, empreintes, inspection base.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la politique de rétention reste à fixer.

**T-023 — Master audio et contrôle qualité**
- Priorité : P0
- Exigences : PRD-05, PRD-14, CDC-F-023, CDC-F-050
- Préconditions : voix et musique de test ; master vidéo.
- Étapes : 1) produire le mix ; 2) vérifier normalisation, ducking et crêtes ; 3) exporter le master ; 4) lancer le QA audio ; 5) comparer voix et musique.
- Résultat attendu : master conforme, QA pass ou fail motivé, aucune saturation non signalée.
- Preuve attendue : rapport QA, analyse audio, master.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les seuils de crête et d'intelligibilité restent à calibrer.

### 5.6 QA, approbation et Postiz

**T-024 — Rapport QA technique et droits**
- Priorité : P0
- Exigences : PRD-14, CDC-F-050, CDC-F-044, CDC-N-009
- Préconditions : artefact de test avec licence et provenance.
- Étapes : 1) lancer le QA machine ; 2) vérifier format, ratio, codec, durée, texte, clipping et checksum ; 3) vérifier la licence et la provenance ; 4) provoquer un échec ; 5) consulter le rapport.
- Résultat attendu : rapport pass/fail avec raisons, blocage si droit incompatible, feedback ciblé par scène.
- Preuve attendue : rapport QA, journal, test d'échec.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la revue humaine reste obligatoire avant approbation.

**T-025 — Approbation d'une version exacte**
- Priorité : P0
- Exigences : PRD-09, PRD-10, CDC-F-051
- Préconditions : deux versions d'un master ; utilisateur habilité.
- Étapes : 1) approuver la version A avec checksum ; 2) tenter de transférer la version B ; 3) tenter de transférer sans approbation ; 4) vérifier l'audit.
- Résultat attendu : seule la version exacte approuvée peut être transférée, les autres sont refusées, l'audit est complet.
- Preuve attendue : enregistrement d'approbation, test de refus, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : l'approbation doit être liée à version et checksum.

**T-026 — Transfert Postiz idempotent**
- Priorité : P0
- Exigences : PRD-10, CDC-F-052
- Préconditions : master approuvé ; adaptateur Postiz mock.
- Étapes : 1) transférer ; 2) vérifier le payload et l'état ; 3) répéter le transfert ; 4) simuler une panne Postiz ; 5) vérifier la conservation du master et l'état d'échec.
- Résultat attendu : un seul transfert effectif, états pending/submitted/acknowledged/failed, erreur de destination explicite, aucune régénération.
- Preuve attendue : journal de transfert, test d'idempotence, reçu mock.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : l'API réelle Postiz reste à qualifier.

### 5.7 MCP

**T-027 — Authentification, scopes et refus**
- Priorité : P0
- Exigences : PRD-12, CDC-F-070, CDC-F-071
- Préconditions : serveur MCP de test ; client autorisé et client non autorisé.
- Étapes : 1) se connecter avec un token valide ; 2) appeler un outil autorisé ; 3) tenter un scope insuffisant ; 4) tenter un outil shell ou SQL ; 5) révoquer le token.
- Résultat attendu : accès conforme aux scopes, refus des outils interdits, révocation effective, audit des appels.
- Preuve attendue : tests MCP, journal d'authentification.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : le mécanisme OAuth ou token reste à trancher en P0-0.

**T-028 — Outils MCP de lecture et de mutation**
- Priorité : P0
- Exigences : PRD-12, CDC-F-070
- Préconditions : contexte, brief, run et artefact de test.
- Étapes : 1) lister les contextes ; 2) lire un brief ; 3) lancer un run long ; 4) suivre le run par run_id ; 5) demander une approbation et un transfert mock.
- Résultat attendu : outils typés, run_id immédiat, suivi non bloquant, mêmes règles que le web.
- Preuve attendue : transcript MCP, run_id, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : aucun accès direct à PostgreSQL, Hatchet ou Postiz.

**T-029 — Parité web/MCP et replay**
- Priorité : P0
- Exigences : PRD-12, CDC-F-070, CDC-F-071
- Préconditions : même scénario exécuté via web et via MCP.
- Étapes : 1) exécuter le scénario via web ; 2) l'exécuter via MCP ; 3) comparer les résultats et les autorisations ; 4) rejouer un appel ; 5) vérifier l'absence de contournement d'approbation ou de quota.
- Résultat attendu : résultats équivalents, RBAC identique, idempotence respectée, aucun accès admin non autorisé.
- Preuve attendue : comparaison, tests de sécurité, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la matrice de clients IDE et cloud sera produite en P0-E.

### 5.8 Durabilité, sauvegarde, audit, sécurité et accessibilité

**T-030 — Crash, reprise et idempotence**
- Priorité : P0
- Exigences : PRD-13, CDC-F-043, CDC-N-004
- Préconditions : run multi-étapes avec un appel externe mock payant.
- Étapes : 1) démarrer le run ; 2) tuer le worker au milieu d'une étape ; 3) redémarrer ; 4) vérifier la reprise ; 5) compter les appels externes.
- Résultat attendu : reprise sans perte d'étapes valides, aucun double appel, retries bornés, pause et annulation sûres.
- Preuve attendue : journal de run, compteur d'appels, test de crash.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : test central du POC Hatchet en P0-0.

**T-031 — Sauvegarde et restauration**
- Priorité : P0
- Exigences : CDC-N-011
- Préconditions : base et stockage de test avec artefacts.
- Étapes : 1) sauvegarder ; 2) restaurer en préproduction ; 3) vérifier les checksums ; 4) vérifier les références base vers stockage.
- Résultat attendu : restauration complète, artefacts intacts, procédure documentée.
- Preuve attendue : rapport de restauration, checksums, runbook.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les objectifs RPO et RTO restent à définir.

**T-032 — Rétention et purge**
- Priorité : P0
- Exigences : CDC-N-011
- Préconditions : ressources de test avec dates de rétention.
- Étapes : 1) configurer une durée courte ; 2) attendre l'échéance ; 3) vérifier la purge ; 4) vérifier l'absence de résidus non prévus ; 5) vérifier la minimisation.
- Résultat attendu : purge conforme à la politique, preuve de suppression, aucune fuite résiduelle.
- Preuve attendue : rapport de purge, journal, test automatisé.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : les durées restent à fixer (D-13).

**T-033 — Audit, journalisation et monitoring**
- Priorité : P0
- Exigences : PRD-11, PRD-13, CDC-F-060, CDC-N-005, CDC-N-012
- Préconditions : run de test avec routage et transfert mock.
- Étapes : 1) exécuter un run ; 2) vérifier les champs actor, project, run, scene, provider, trace, versions, coûts et timestamp ; 3) provoquer une panne ; 4) vérifier l'alerte et la trace.
- Résultat attendu : audit complet, traces corrélées, alertes de panne, de coût et de fallback.
- Preuve attendue : export d'audit, tableau de bord, test d'alerte.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : l'outil d'observabilité sera choisi en P0-0.

**T-034 — Secrets, SSRF et uploads**
- Priorité : P0
- Exigences : CDC-N-002, CDC-N-003
- Préconditions : environnement de test ; URLs internes et fichiers malveillants de test.
- Étapes : 1) vérifier qu'aucun secret n'apparaît dans les logs, erreurs ou frontend ; 2) tester une URL interne (SSRF) ; 3) tester un upload non autorisé ; 4) tester CSRF et expiration de session.
- Résultat attendu : secrets côté serveur uniquement, SSRF bloquée, uploads validés, protections actives.
- Preuve attendue : tests de sécurité, scan de logs, rapport.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : inclure la révocation et la rotation des secrets.

**T-035 — Accessibilité et expérience Vululu**
- Priorité : P0
- Exigences : CDC-N-008, UX-0
- Préconditions : maquettes ou prototype UX-0 ; parcours clavier.
- Étapes : 1) parcourir les écrans au clavier ; 2) vérifier contrastes et labels ; 3) vérifier la voix unique Vululu ; 4) vérifier l'absence de jargon ; 5) vérifier les états vides, erreur et chargement.
- Résultat attendu : navigation clavier, contrastes et labels conformes, langage clair, expérience conversationnelle cohérente.
- Preuve attendue : rapport d'accessibilité, revue de contenu, test utilisateur.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : dépend du lot UX-0, avant tout frontend.

### 5.9 Verticales E2E et pilote

**T-036 — Verticale image de bout en bout**
- Priorité : P0
- Exigences : PRD-04, PRD-09, CDC-F-020, CDC-F-040, CDC-F-050, CDC-F-051, CDC-F-052
- Préconditions : environnement mock complet ; compte invité ; contexte validé.
- Étapes : 1) inviter ; 2) créer un contexte ; 3) produire un brief Instagram image ; 4) lancer un run mock ; 5) produire un artefact ; 6) QA ; 7) approuver ; 8) transférer vers Postiz mock ; 9) vérifier l'audit.
- Résultat attendu : parcours complet reproductible, aucune étape contournée, preuves à chaque étape.
- Preuve attendue : run E2E, captures, journaux, reçu mock.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : objectif de pilote PRD section 7.

**T-037 — Verticale audiovisuelle de bout en bout**
- Priorité : P0
- Exigences : PRD-04, PRD-05, CDC-F-021, CDC-F-022, CDC-F-023, CDC-F-040, CDC-F-050
- Préconditions : voix et musique licensiées de test ; profil Instagram ou TikTok.
- Étapes : 1) créer un brief vidéo ; 2) choisir voix et musique ; 3) produire les scènes ; 4) mixer ; 5) QA ; 6) approuver ; 7) transférer mock.
- Résultat attendu : master audiovisuel conforme, mix et licences valides, parcours complet.
- Preuve attendue : master, rapport QA, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : objectif de pilote PRD section 7.

**T-038 — Interchangeabilité des fournisseurs**
- Priorité : P0
- Exigences : PRD-07, CDC-F-032, CDC-F-033
- Préconditions : deux fournisseurs pour une capacité, ou un mock de contrat.
- Étapes : 1) produire avec le fournisseur A ; 2) rejouer avec le fournisseur B ; 3) vérifier le brief inchangé ; 4) vérifier les droits et le coût ; 5) vérifier la trace du choix.
- Résultat attendu : même brief, résultats normalisés, coût et droits visibles, décision de routage tracée.
- Preuve attendue : comparaison de sorties, journal de routage, rapport de coût.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : sans fournisseur réel, le mock de contrat doit être certifié.

**T-039 — MCP sur clients IDE et cloud**
- Priorité : P0
- Exigences : PRD-12, CDC-F-070
- Préconditions : un client IDE et un client cloud compatibles et autorisés.
- Étapes : 1) connecter le client IDE ; 2) lister les contextes ; 3) lancer un run long ; 4) approuver ; 5) répéter avec le client cloud.
- Résultat attendu : deux clients fonctionnels, scopes respectés, run suivi, approbation tracée.
- Preuve attendue : transcripts, captures, journal.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : la disponibilité des clients sera qualifiée en P0-E.

**T-040 — Plafond de coût de bout en bout**
- Priorité : P0
- Exigences : PRD-13, CDC-F-061
- Préconditions : grille de coûts mock ; plafond bas.
- Étapes : 1) estimer ; 2) lancer un run sous le plafond ; 3) augmenter la demande au-delà du plafond ; 4) vérifier le refus et l'absence de production.
- Résultat attendu : plafond appliqué avant effet payant, refus explicite, coût réel calculé et audité.
- Preuve attendue : test, journal, rapport de coût.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : objectif de pilote PRD section 7.

### 5.10 P1 et qualité des tests

**T-041 — Templates, recherche et comparaison de modèles**
- Priorité : P1
- Exigences : CDC-F-080
- Préconditions : fonctionnalités P1 livrées.
- Étapes : 1) appliquer un template ; 2) rechercher un asset avancé ; 3) comparer deux modèles.
- Résultat attendu : fonctionnalités disponibles après stabilisation P0.
- Preuve attendue : tests dédiés.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : différé ; ne bloque pas la V1 interne.

**T-042 — Reproductibilité des tests et CI**
- Priorité : P0
- Exigences : CDC-N-007
- Préconditions : dépôt avec code et CI.
- Étapes : 1) exécuter les tests unitaires ; 2) exécuter les tests de contrat ; 3) exécuter l'intégration ; 4) exécuter l'E2E ; 5) vérifier les mocks fournisseurs et l'absence de secrets.
- Résultat attendu : suite reproductible, environnement documenté, aucun test dépendant d'un service réel non mocké.
- Preuve attendue : rapport CI, logs, documentation.
- Spécification : SPECIFIED
- Statut : NOT_RUN
- Notes : dépend de la stack choisie en P0-0.

## 6. Critères d'entrée et de sortie

### 6.1 Entrée d'une campagne de tests

- environnement de test disponible et documenté ;
- jeux de données anonymisés ;
- comptes de test et fournisseurs mockés ;
- build identifié par un SHA ;
- secrets fournis hors dépôt.

### 6.2 Sortie d'une campagne P0

- tous les tests P0 exécutés ou explicitement BLOCKED avec justification ;
- aucun FAIL non analysé ;
- preuves archivées ;
- limitations écrites ;
- décision GO ou NO-GO documentée.

## 7. Règles d'exécution

- Un test NOT_RUN ne vaut jamais PASS.
- Un test exécuté avec un mock doit indiquer MOCK.
- Un test non exécutable doit être BLOCKED avec cause et plan.
- Toute correction de test met à jour la matrice de traçabilité.
- Aucun test ne peut être marqué PASS sans preuve vérifiable.

## 8. Limites actuelles

- Aucun code applicatif n'existe : tous les tests sont NOT_RUN.
- Les environnements, comptes et fournisseurs ne sont pas encore définis.
- Les contrats ne sont pas produits : les tests de contrat restent à écrire.
- Les valeurs de budget, rétention et calibration audio restent à fixer.
- Le mécanisme d'authentification MCP reste à trancher.

## 9. Références

- [Cahier des charges V1.2](02_CAHIER_DES_CHARGES_V1.md)
- [PRD V1.2](01_PRD_V1.md)
- [Matrice de traçabilité](foundations/01_TRACEABILITY_MATRIX.md)
- [Audit du corpus](foundations/01_CORPUS_AUDIT.md)
- [Addendum UX-0](backlog/UX0_ADDENDUM.md)
