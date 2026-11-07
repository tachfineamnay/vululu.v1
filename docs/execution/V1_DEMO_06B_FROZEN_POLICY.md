# V1-DEMO — Politique d’exécution figée

- Date : 2026-11-04 ; tranche 6B, ADR 0021.
- Exigences : PRD-07/11/13, CDC-F-031/032/033/043/061, CDC-N-004/005/010.

## Contrat et résultat

Le lancement transactionnel conserve `executionPolicy` dans le snapshot : mode MOCK, version du workflow, étapes et dépendances, usage, plafond, directeur/configuration exacts et catalogue sans credentials. Le contenu de la configuration est vérifié contre son checksum. Une définition sans configuration active valide bloque le lancement avant toute création de run. Le directeur intégré absent du registre est explicitement identifié, sans identifiant de configuration inventé.

Le service de routage lit uniquement le snapshot du run et vérifie son checksum ainsi que l’association au projet. Une promotion, modification de modèle ou changement d’environnement après mise en file ne remplace plus les entrées du worker. La simulation reçoit la configuration figée. Les injections de panne d’environnement sont elles aussi capturées au lancement ; une injection explicite par dépendance reste disponible dans les tests.

Les droits sont l’intersection entre la licence autorisée par l’agent et l’usage du projet : le sponsorisé exige commercial, unknown n’est pas admissible. Le budget transmis au worker ne peut pas dépasser le plafond capturé dans le brief. Les tarifs enregistrés par ce chemin sont les tarifs du catalogue figé, explicitement MOCK ; ils ne représentent aucune facture fournisseur. Le chemin local sans invocation conserve un coût nul.

La provenance globale du master inclut désormais la politique agent/catalogue/version de workflow. Une correction après un changement de cette politique requiert une production complète. La sélection est volontairement conservatrice : le catalogue capturé est complet et un changement global peut donc demander une régénération même si un seul modèle a été modifié. Les étapes locales de production/correction restent exclues de cette comparaison pour permettre les corrections successives.

Un ancien run sans politique ne consulte pas silencieusement le catalogue courant. Si un checkpoint de résolution existe, le cas d’usage le réutilise ; sinon la résolution répond `routing_snapshot_required`. Conserver le travail et lancer un nouveau run après relecture. Aucun snapshot historique n’est réécrit.

## Preuves

| Vérification | Résultat |
|---|---|
| RED avant correction | 2 FAIL : configuration/catalogue remplacés au démarrage du worker et absence de garde de provenance historique |
| API brief + gel initial | 15 PASS |
| Campagne ciblée enrichie : transactions, brief, corrections durables, droits et plafond | 34 PASS, 4 fichiers, 36,06 s |
| Régression complète `pnpm exec vitest run`, incluant l’injection de panne après lancement | **345 PASS / 2 SKIP**, 40 fichiers, 367,98 s ; les SKIP S3 ne sont pas comptés comme succès |
| Typecheck complet et lint strict | PASS |
| Build API | PASS ; Web inchangé depuis le build production validé en 6A |
| E2E production après relance de l’API | 2 PASS, 1,3 min : profil réel 4:5 et verticale vidéo/correction/approbation/transfert MOCK |
| Frontières et documents fondateurs | PASS, 23 fichiers domaine / 24 application, 9 empreintes fondatrices intactes |
| Scan de secrets | PASS, 461 fichiers |

Les tests modifient réellement la configuration active, le modèle, l’environnement et le checksum en PostgreSQL. Un port espion vérifie les instructions initiales et l’absence d’invocation en cas de budget, droits, projet ou empreinte incorrects. Le test de fallback existant utilise désormais un vrai run avec catalogue figé, au lieu d’identifiants de jobs fictifs, et conserve son refus de budget insuffisant.

## Limites et suite

L’estimation et le refus de budget avant mise en file, le plan présenté à l’utilisateur, la conversation structurée et l’adaptation du storyboard restent ouverts. Cette tranche n’autorise aucune IA réelle et ne certifie pas la reprise Hatchet/Linux. Les 2 tests S3 habituellement désactivés restent à distinguer de résultats PASS dans la campagne complète. Aucun déploiement, push ou publication externe.

## Rollback

Aucune migration. Redéployer le candidat 6A en conservant snapshots et coûts, puis suspendre les nouveaux lancements jusqu’au retour d’un candidat validé : l’ancien routeur relit la configuration active. Ne pas réécrire les snapshots ni leurs checksums pour les rendre compatibles. Les sorties et checkpoints existants restent consultables.
