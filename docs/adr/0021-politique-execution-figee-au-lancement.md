# ADR 0021 — Politique d’exécution figée au lancement

- Date : 2026-11-04 ; statut : accepté pour la tranche 6B.
- Exigences : PRD-07/11/13, CDC-F-031/032/033/043/061, CDC-N-004/005/010.
- Complète l’ADR 0019, sans modifier ses décisions.

Le snapshot transactionnel d’un run conserve la configuration exacte du directeur applicable (contenu, version, checksum et exigences), le catalogue de modèles sans credentials, le mode MOCK, l’usage et le plafond du brief, ainsi que la version et les dépendances du workflow. Le catalogue est un registre de simulations : aucun fournisseur réel n’est appelé par cette tranche.

Le worker route exclusivement à partir de cette copie. Promotion/rollback d’agent, modification du catalogue et changement de variable d’environnement après mise en file ne remplacent aucune entrée du run. Un directeur par défaut absent du registre est identifié comme politique intégrée, sans fausse référence de configuration. Une définition configurée mais sans version active valide bloque le lancement.

Un ancien run dont la résolution est déjà persistée réutilise son checkpoint. S’il manque la politique figée et le checkpoint, la résolution refuse d’inventer une configuration historique : conserver les données et lancer un nouveau run explicitement après relecture. Aucun backfill, réécriture de snapshot ou appel automatique à une nouvelle configuration.

La licence applicable est l’intersection entre les contraintes figées de l’agent et l’usage du projet ; un usage sponsorisé exige commercial. Le plafond de l’appel ne peut pas dépasser celui capturé au lancement. Les montants et invocations restent MOCK. La présentation du plan et de son estimation avant confirmation est une tranche distincte ; cet ADR ne certifie ni cette interface ni la recette Hatchet/Linux.
