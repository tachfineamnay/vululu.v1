# V1-DEMO — Conversation guidée et storyboard issu du brief

- Date : 2026-11-05 ; tranche 6D, lot 6 toujours partiel.
- Références : ADR 0023 et `docs/releases/V1_DEMO_CONVERSATION_CONTRACT.md`.
- Exigences : PRD-03/06/08/09, CDC-F-024/030/040/042/044, CDC-N-001/003/005.

## Résultat

La conversation propose un brief structuré à reprendre en brouillon, aide à clarifier les quatre champs et prépare une correction par Scene ID. Chaque réponse est marquée MOCK. Les valeurs déclarées/enregistrées sont distinguées des exemples. Le chat n’enregistre pas de brief, ne confirme pas de version, ne produit pas de média et ne transfère rien automatiquement.

La reprise respecte les saisies déjà présentes : champs vides complétés, valeurs du message explicitement déclarées appliquées, autres saisies conservées. La provenance et les références de version sont persistées avec la proposition. Les boutons deviennent inactifs lorsque brief, scène, master ou source contextuelle pertinente ont changé. Le message en cours reste dans l’éditeur si son envoi échoue.

Le storyboard reprend objectif, audience et CTA du brief confirmé, avec des formulations génériques de ton. Les Scene ID et Character ID sont conservés lors d’une nouvelle version du brief. Les anciennes versions et snapshots ne sont pas réécrits. La migration 17 ajoute uniquement Message.proposal nullable ; les anciennes lignes gardent leur contenu et une proposition absente.

## Preuves

| Vérification | Résultat |
|---|---|
| API avant implémentation | 6 FAIL, sur propositions, marque MOCK, storyboard et validation manquants |
| Domaine applicatif + API initiale | 16 PASS |
| Cas enrichis conversation, brief et transactions | 31 PASS, 3 fichiers, 41,75 s |
| URL déclarée dans un message | Serveur HTTP local de preuve : zéro requête reçue |
| Upgrade 12/13/14/15/16 → 17 | 5 PASS ; messages, révisions et snapshots historiques conservés |
| Régression complète `pnpm exec vitest run` | **360 PASS / 2 SKIP**, 42 fichiers, 334,11 s |
| Typecheck complet et lint | PASS |
| Build API/Web puis rebuild Web après reprise du brouillon | PASS |
| Premier E2E | API temporairement indisponible au login ; échec de démarrage de recette, pas compté comme preuve métier |
| E2E après disponibilité confirmée | RED observé : un brouillon partiel bloquait le bouton tout en empêchant la sauvegarde des champs vides |
| E2E après correction de reprise | PASS, 26,1 s : proposition, saisie conservée, sauvegarde explicite, obsolescence, vidéo puis correction SCENE-003 vers master v2 |
| Rejeu final conversation + profil/plan + verticale existante | 3 PASS, 1 min ; rejeu conversation avec assertion de persistance du brouillon : 1 PASS, 37,7 s |
| Mobile | Capture locale `.v1/conversation-card-mobile.png`, inspectée à 390 px : carte et boutons lisibles, sans débordement visible |
| Frontières, fondations et migrations | PASS : Domain/Application isolés, 9 empreintes conformes, 17 migrations |
| Secrets, fichiers suivis et diff | PASS : 477 fichiers scannés, aucun secret ; aucun fichier interdit suivi ; `git diff --check` sans erreur |

La reprise partielle n’a pas été contournée par un délai de test : elle complète désormais le formulaire sans écraser les autres saisies. La disponibilité API/Web a été observée avant le rejeu. Les tests de proposition de correction utilisent des chemins fictifs explicitement annotés ; la preuve des fichiers et de la QA réelle vient du navigateur et des tests média.

Les 2 SKIP concernent S3 et ne sont pas comptés comme succès. Linux/Hatchet/S3/HTTPS Coolify : NOT_RUN pour cette tranche. Aucun appel IA, push, déploiement ou publication externe.

## Limites et suite

La conversation traite les commandes et champs déclarés ; elle n’interprète pas librement un échange comme un LLM. La disponibilité de nouveaux formats et du mix reste liée à la qualification média. La distinction durée héritée/personnalisée des scènes existantes doit être corrigée avant de finaliser les changements de durée du brief ; une simple estimation du nouveau défaut ne suffit pas à prouver la durée effectivement régénérée. Les scénarios MOCK timeout/résultat invalide restent également à compléter.

Le lot 6 et la V1 complète restent ouverts. L’audio libre est préparé comme source locale, avec licence et attribution à intégrer au lot média. MCP, stockage/durabilité Linux et exploitation restent suivis par le plan global.

## Rollback

Redéployer le candidat 6C en gardant la colonne nullable et les propositions enregistrées. Ne pas supprimer la colonne ni réécrire les messages historiques. Les propositions peuvent être ignorées par l’ancien client ; les briefs et fichiers restent consultables. Suspendre les nouveaux lancements pendant le rollback, puis vérifier login, historique et lecture des versions avant retour au candidat corrigé.
