# V1-DEMO — Échecs d’invocation, fallback et journaux cohérents

- Date : 2026-11-05 ; tranche 6F, lot 6 encore partiel.
- Références : ADR 0025, `docs/releases/V1_DEMO_INVOCATION_FAILURES_CONTRACT.md`.
- Exigences : PRD-07/11/13/14, CDC-F-031/032/033/043/050/061, CDC-N-002/004/005/007.

## Résultat

Les invocations MOCK sont bornées, annulables et validées avant succès. Le fallback utilise uniquement les candidats admissibles selon la politique figée. Les réponses invalides ou tardives et les messages d’erreur privés ne deviennent pas une décision réussie. Le tarif durable reste celui du catalogue figé ; aucune facturation réelle. Les scénarios opérateur et le délai sont capturés au lancement.

Les journaux HTTP distinguent la validation domaine/contrat d’une panne interne : le statut annoncé correspond à la réponse. Aucun payload fournisseur n’est journalisé par le nouveau chemin.

Le routeur administrateur refuse aussi le coût retourné au-dessus du plafond et ne comptabilise aucun succès dans ce cas. Les conversions JSON ne peuvent masquer une racine chaîne ou une Map perdant ses données.

## Preuves

| Vérification | Résultat |
|---|---|
| Premier lancement du nouveau fichier | Erreur de résolution d’import de test corrigée ; pas comptée comme preuve RED métier |
| Invocations avant correction | **14 FAIL** : timeout non borné, réponses invalides acceptées, absence de causes terminales fiables |
| Premier test de journal | 429 lié au compteur de login partagé ; remplacé par deux routes de validation de fixture sans auth/DB |
| Journal avant correction | FAIL : validations effectivement 400 mais journalisées 500 avec codes différents |
| Premier GREEN ciblé | **23 PASS**, 3 fichiers, 22,51 s : 14 scénarios, journal et 8 tests de routage existants |
| Capture, PostgreSQL, reprise durable et sécurité intermédiaires | **92 PASS / 2 S3 SKIP**, 10 fichiers, 165,21 s ; timeout de 5000 ms et tarif de fallback figés vérifiés |
| Cas supplémentaires avant correction | 4 FAIL / 25 PASS : racines JSON converties en chaîne, coût administrateur au-delà du plafond, statut inconnu journalisé différent ; puis 2 FAIL ciblés pour Map perdant des données |
| Racines JSON, plafond et statuts supplémentaires | **29 PASS**, 3 fichiers, 22,95 s, avant ajout des deux cas Map |
| Rejeu final incluant les cas Map, politique capturée, sécurité et reprise | **99 PASS / 2 S3 SKIP**, 10 fichiers, 178,29 s |
| Typecheck complet, build API et lint strict | PASS ; Web inchangé depuis le build de production 6E |
| Frontières, fondations et migrations | PASS : Domain/Application isolés, 9 empreintes conformes, 18 migrations |
| Secrets, fichiers suivis et diff | PASS : 487 fichiers scannés, aucun secret ; aucun fichier interdit suivi ; `git diff --check` sans erreur |
| Trois parcours navigateur sur nouvelle API | **3 PASS**, 2,1 min : profil/durées, conversation/correction, verticale avec approbation et transfert MOCK |

Les faux ports DB des tests rapides sont explicites. Les tests de capture et de reprise utilisent PostgreSQL local ; ils ne constituent pas une preuve du moteur Hatchet Linux. Images/S3/HTTPS Coolify : NOT_RUN pour cette tranche. Aucun push, déploiement, publication ou appel IA.

Commandes : `pnpm exec vitest run` avec les 10 fichiers ciblés (`invocation-failures`, `http-error-status`, `frozen-routing`, `v1-01-b/d/e/f`, `production-plan`, `auth-security`, `api`), `pnpm typecheck`, `pnpm --filter @vululu/api build`, lint strict, cinq scripts de contrôle du dépôt et `git diff --check`. Logs locaux ignorés `.v1/invocation-*.log`. La régression complète précédente demeure la preuve 6E (364 PASS / 2 S3 SKIP) ; aucun total complet extrapolé n’est revendiqué ici.

## Suite et rollback

Conserver les snapshots et checkpoints lors d’un retour au code précédent ; suspendre les nouveaux lancements pendant la bascule. Les colonnes DB ne changent pas. L’ancien candidat ignore les nouveaux champs de simulation : ne pas rejouer un run de panne comme s’il avait les mêmes garanties. Revenir au candidat corrigé avant qualification de ces scénarios.

Le lot média, le jeu démo complet, MCP, l’administration et l’exploitation restent suivis dans le plan global. L’audio libre n’est pas encore intégré ; son original et sa licence sont préparés localement.
