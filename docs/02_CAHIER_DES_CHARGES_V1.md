# Cahier des charges fonctionnel et technique — VULULU IA V1.2
**Référence : CDC** · version 1.2 · 21/10/2026 · **P0** bloquant / **P1** différable

## A. Périmètre et critères généraux
Plateforme web interne sécurisée, connexion par invitation de super-utilisateur, 2 rôles, isolation forte des projets/contextes ; création de contenus pour TikTok, Instagram, LinkedIn ; workflow guidé, agentique multi-fournisseur, gestion scènes/personnages versionnée, contrôle qualité et livraison via Postiz, pilotage par MCP de première classe. Facturation, Memory Bank, partage public et publication autonome exclus.

## B. Exigences fonctionnelles
| ID | Priorité | Exigence testable | Preuve attendue |
|---|---|---|---|
| CDC-F-001 | P0 | Seul super-admin peut émettre/révoquer une invitation à durée limitée | Tests activation valide/invalide/expirée |
| CDC-F-002 | P0 | `user` n'accède pas aux ressources de `user` tiers ou administrateur | Tests API et MCP inter-tenant/IDOR |
| CDC-F-003 | P0 | Page super-admin : utilisateur, date invitation/activation, statut, projets, sans données inutiles | Parcours UI/permissions |
| CDC-F-010 | P0 | Plusieurs `BrandContext` créés par utilisateur : URL, produit/offre, marque, logos, actifs, social, notes | Persistance, validation des entrées |
| CDC-F-011 | P0 | Agent contextualisation analyse, suggère et distingue faits sourcés et hypothèses, puis demande validation | Revision immuable + log provenance |
| CDC-F-012 | P0 | Sélection du contexte dans chaque projet et snapshot figé au lancement | Changer contexte courant n'altère pas un run ancien |
| CDC-F-013 | P0 | Bibliothèque d'assets par contexte et regroupement simple par campagne, avec version/licence et sélection explicite | Assets retrouvés et réutilisables sans promotion automatique de préférence |
| CDC-F-020 | P0 | Choix réseau TikTok/Instagram/LinkedIn, format, ratio, usage organique/sponsorisé et création (image/carrousel/motion/vidéo) | Config valide/invalide, UI adaptative |
| CDC-F-021 | P0 | Voix off optionnelle : langue, voix autorisée, texte/script, aperçu si disponible | Cas aucune voix / voix renseignée |
| CDC-F-022 | P0 | Musique optionnelle : bibliothèque avec licences et provenance ou upload utilisateur | Blocage licence incompatible ads |
| CDC-F-023 | P0 | Mix réglable voix/musique, valeurs initiales calibrées, ducking, mesure crête et intelligibilité | Tests audio & comparaison niveau |
| CDC-F-024 | P0 | Échanges de brief, `BriefRevision` structuré/haché, confirmation avant run | Comparaison revisions |
| CDC-F-030 | P0 | Agent director planifie un DAG de steps/capabilities ; spécialistes exécutent ; QA vérifie | Run log et contrats |
| CDC-F-031 | P0 | Registre `AgentDefinition` / `AgentConfigVersion` ; soul/system prompt réglable par super-admin et rollback | Config promue explicitement |
| CDC-F-032 | P0 | Catalogue de fournisseurs/modèles/compétences versionné, testable, désactivable, actualisable par fournisseur | Test ajout/retrait sans modifier core |
| CDC-F-033 | P0 | Router applique compatibilité + licence + budget avant classement ; fallback admissible et traçable | Simuler panne primary |
| CDC-F-040 | P0 | `scene_id` immuable sur toutes les révisions ; `character_id` logique distinct des identifiants propriétaires | Corriger SCENE-003 sans renuméroter |
| CDC-F-041 | P0 | Versions d'artefacts immuables, checksums, liens de provenance, stockage originaux/proxies/master | Tentative d'overwrite refusée |
| CDC-F-042 | P0 | Correction ciblée recalcule dépendances réelles et ne regénère pas étapes non invalidées | Trace et delta de coût |
| CDC-F-043 | P0 | Exécution durable + pause, reprise, annulation sûre, retries bornés et idempotence | Crash/restart mid-run |
| CDC-F-044 | P0 | Preview/versions et comparaison ; feedback par scène ; maîtrise des erreurs | UAT scène + rendu |
| CDC-F-050 | P0 | QA machine : format/ratio/codec/durée/texte, audio clipping, droits, master checksum | Rapport pass/fail avec raisons |
| CDC-F-051 | P0 | Approbation humaine d'un `ArtifactVersion` exact, avant transfert | Refus autre version/absence approval |
| CDC-F-052 | P0 | Postiz via adaptateur idempotent, transfert journalisé, erreurs de destination explicites | Test réel ou limitation acceptée |
| CDC-F-060 | P0 | Interface admin minimale : invitations, agents/prompts/soul, modèles/fournisseurs, mesures run/coûts, audit | RBAC, rollback |
| CDC-F-061 | P0 | Estimation/plafond dépenses run, coûts réels normalisés par provider/modèle/étape | Refus dépassement de budget |
| CDC-F-070 | P0 | MCP HTTPS authentifié, mêmes use cases et RBAC que web, long runs non bloquants avec `run_id` | Tests IDE + cloud + replay |
| CDC-F-071 | P0 | Aucun outil MCP shell/SQL arbitraire, pas de bypass approval ou quotas | Tests sécurité MCP |
| CDC-F-080 | P1 | Modèles de storyboard et profils créatifs supplémentaires | Tests différés |

## C. Qualité, sécurité et exploitation
| ID | Priorité | Exigence |
|---|---|---|
| CDC-N-001 | P0 | RBAC sur le serveur, ressources filtrées par propriétaire dans toutes les lectures/écritures/web/MCP ; tests IDOR |
| CDC-N-002 | P0 | Clés AI/Postiz uniquement serveur/secret store, zéro secret dans log/asset/erreur/frontend |
| CDC-N-003 | P0 | HTTPS, authentification adaptée MCP distante, révocation, expiration, audience et scopes, protection CSRF/SSRF/uploads |
| CDC-N-004 | P0 | Workflow repris après arrêt worker/service ; pas de double envoi / double facturation API idempotente |
| CDC-N-005 | P0 | Audit `actor_id`, `project_id`, `run_id`, `scene_id`, `provider_id`, `trace_id`, version prompt/modèle, coûts, timestamp |
| CDC-N-006 | P0 | Artefacts stockés S3-compatible avec checksums, URLs temporaires et durée de conservation configurable ; DB sans blobs lourds |
| CDC-N-007 | P0 | Tests unitaires, contracts, intégration et E2E reproductibles ; environnement avec provider mocks |
| CDC-N-008 | P0 | Accessibilité de base (navigation clavier, contrastes, labels), UI réactive et tâche asynchrone |
| CDC-N-009 | P0 | Métadonnées de licence/provenance attachées à chaque ressource audio/visuelle et revalidées avant publicité |
| CDC-N-010 | P0 | Publication des versions agents/prompts uniquement sur approbation super-admin ; rollback possible |
| CDC-N-011 | P0 | Backups/restauration vérifiés en préproduction ; politique de purge tenant/actifs et minimisation des données |
| CDC-N-012 | P0 | Monitoring health/API/workers/queue/stockage et alertes coûts/pannes/fallback |

## D. Contrats et états
**États run :** `draft → brief_ready → queued → running → awaiting_review → approved → transfer_pending → transferred`. États alternatifs : `paused`, `failed`, `cancelled`; ne jamais assimiler `transferred` à « publié sur réseau ».
**États step :** `pending → ready → running → succeeded` ou `retryable_failed / terminal_failed / skipped / cancelled`.
**États transfer :** `pending → submitted → acknowledged / failed` ; `acknowledged` = confirmé par Postiz selon API, pas publié.
**Idempotence obligatoire :** création de run coûteux, correction, approbation, transfert. Toutes les transitions explicites sont auditées.

## E. Critères de recette bloquants
Voir `docs/10_ACCEPTANCE_TESTS.md`. Couverture obligatoire : invitation ; fuite inter-user ; création contexte ; toutes options essentielles de brief ; audio licence/mix ; capacité par provider/fallback ; continuité ID scène et personnage ; correction ciblée et reprise ; QA/versioning ; approbation version exacte ; Postiz et répétition idempotente ; matrice MCP IDE/cloud/scopes ; suppression/retention ; redémarrage worker.

## F. Limitations / arbitrages techniques à instruire
- Choix code de départ : audit du dépôt cible ; les docs n'autorisent ni migration directe du V1 QeynoX ni reprise aveugle de SocioPulse.
- **Hatchet** retenu comme orchestration VULULUIA dans l'architecture cible ; test d'intégration préproduction obligatoire pour la reprise/approbation/step granularity. Postiz gère indépendamment son Temporal.
- Prestataires IA et API Postiz : qualification réelle avant de déclarer le lot « fonctionnel ».
- Profils média par réseau : configuration versionnée ; limites mises à jour selon spécifications du canal, pas codées en dur.
- Mémoire V2 strictement exclue (pas de vector DB, recommandations auto-apprises, graphe d'héritage sémantique).

## G. Livraison
Livrables : code, migrations, exemples .env non secrets, schémas/contrats versionnés, mocks providers, CI, preuves tests, runbook/rollback, UI invitée/admin, serveur MCP, pipeline média + QA, Postiz adapter validé et matrice de conformité V1. Aucun GO PROD sans tests P0 verts et autorisation explicite de mise en ligne.
