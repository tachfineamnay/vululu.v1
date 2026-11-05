# V1-DEMO — Contrat du plan de production et du plafond

- Date : 2026-11-05 ; tranche 6C vérifiée localement, ADR 0022.
- Exigences : PRD-03/06/13, CDC-F-020/024/030/033/061, CDC-N-001/005.

`GET /api/projects/:id/production-plan` exige une session et la propriété du projet, sans bypass super-admin. Un brief enregistré est requis. La lecture ne crée aucun run, coût, révision ou invocation fournisseur. Elle utilise une vue cohérente de PostgreSQL et le mode d’orchestration de l’API.

La réponse porte schemaVersion=1, mode=MOCK, executionMode, workflowVersion, briefVersion, format, ratio, sceneCount, durationSeconds, steps (key/dependsOn/capability), pricing (estimatedCents/maxPossibleCents/ceilingCents), ready, issues et checksum. Aucun contenu de configuration d’agent ou credential n’est exposé. L’empreinte inclut la provenance privée par son hash ; ce checksum permet de comparer deux plans, sans devenir un jeton d’autorisation.

Le plan décrit les seules opérations qualifiées. Video sans fichier audio est qualifié dans cette tranche ; les autres formats et le mix restent bloqués jusqu’à leur recette média. Les capacités locales correspondent à Sharp/FFmpeg et au contrôle qualité ; le transfert conserve la mention MOCK. Aucune orchestration autonome LLM n’est suggérée.

Le chemin local n’invoque pas de fournisseur : son estimation est nulle. Le chemin durable actuel simule une invocation scene.generate par run, avec tarif du modèle admissible dans le catalogue figé. maxPossibleCents est une borne conservatrice des candidats admissibles, pas un débit facturé. Les échecs de simulation n’ajoutent pas de coût et le fallback reste borné par le même plafond. Les tarifs ne sont ni un devis commercial ni des coûts IA réels.

Le plafond appartient au profil du brief et participe à son checksum. Une nouvelle valeur exige une nouvelle révision et une confirmation de cette version. L’estimation reste indicative : le serveur recalcule l’admissibilité sous transaction avant création de JobRun, ProductionJob et outbox. Un catalogue modifié peut changer le choix sans autoriser un dépassement du plafond confirmé. Un budget insuffisant répond budget_exceeded ; une capacité ou licence sans modèle admissible refuse aussi le lancement. Les données et le statut antérieurs sont conservés après le rollback transactionnel.

L’interface affiche le plan avant la confirmation, désactive les actions lorsque le plan est indisponible/inadmissible et actualise le plan avant confirmation ou lancement. Une différence de checksum est présentée pour relecture avant un nouveau clic. Le snapshot conserve le plan effectivement calculé au lancement et la politique d’exécution complète. Les anciennes empreintes et fichiers ne sont pas réécrits.

Recette requise : plan avant confirmation, refus de session/IDOR, aucun effet de lecture, budget insuffisant sans job/outbox/coût, snapshot du plan valide, défauts canoniques même sans paramètres client, révision du plafond et du storyboard, catalogue/configurations figés, E2E sur build production et mobile. Ce contrat ne remplace pas les résultats d’exécution ; Linux/Hatchet/S3 restent qualifiés séparément.
