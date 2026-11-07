# V1-DEMO — Durées de scène cohérentes avec le plan

- Date : 2026-11-05 ; tranche 6E, lot 6 toujours partiel.
- Références : ADR 0024, `docs/releases/V1_DEMO_SCENE_DURATION_CONTRACT.md`.
- Exigences : PRD-03/06/08/13, CDC-F-020/030/040/042/061, CDC-N-001/003/004/005/007.

## Correction

La durée d’une scène indique maintenant son origine : défaut du brief, personnalisation explicite, ou historique inconnu. Le storyboard régénéré actualise uniquement les scènes suivant le brief ; le plan conserve les valeurs personnalisées et historiques. Le retour au défaut est une action explicite. La migration 18 ajoute une colonne nullable sans modifier les anciennes durées, versions ou snapshots.

L’écriture vérifie la propriété et prend le même verrou de projet que les lancements ; elle refuse un projet en production, y compris dans l’adaptateur si le contrôle applicatif était devenu obsolète. Le contrat HTTP rejette les combinaisons ambiguës et les valeurs hors bornes. L’interface décrit l’origine, conserve le brouillon et recalcule le plan après changement de mode.

## Preuves

| Vérification | Résultat |
|---|---|
| Test avant correction | 4 FAIL / 5 PASS : total personnalisé et historique incorrects, reset et isolation de son nouveau corps absents |
| Tests ciblés plan, infrastructure, brief et application | 52 PASS, 4 fichiers, 104,98 s |
| Exemple personnalisé | 17 secondes prévues puis régénérées, mêmes Scene ID ; reset puis défaut repris |
| Exemple historique | 19 secondes prévues puis régénérées ; origine inconnue conservée |
| Typecheck complet et lint strict | PASS |
| Migration locale | 18 migrations appliquées aux bases de test et E2E ; Prisma 6.19.3 régénéré |
| Régression complète `pnpm exec vitest run` | **364 PASS / 2 S3 SKIP**, 42 fichiers, 713,03 s |
| Upgrade 12/13/14/15/16/17 → 18 | 6 PASS, 190,87 s ; ancienne scène à 7 s et origine null, messages et snapshots conservés |
| Build API/Web | PASS ; build de production Next.js utilisé pour la recette |
| E2E `brief-profile.spec.ts` | 1 PASS, 58,4 s (1,3 min avec démarrage) : 11 s après régénération, puis reset à 10 s ; MP4 réel 1080×1350 et durée 10 s, mêmes Scene ID et persistance après rechargement |
| Mobile | `.v1/duration-mobile.png` inspecté à 390 px : origine et action de reprise lisibles |
| Frontières, fondations et migrations | PASS : couches isolées, 9 empreintes conformes, 18 migrations |
| Secrets, fichiers suivis et diff | PASS : 481 fichiers scannés, aucun secret ; aucun fichier interdit suivi ; `git diff --check` sans erreur |

Les preuves ci-dessus sont locales et utilisent des comptes et données de recette. Aucun appel IA, publication, push ou déploiement. S3 et Linux/Hatchet/HTTPS Coolify ne sont pas qualifiés par cette tranche.

Commandes : `pnpm typecheck`, lint avec `LINT_STRICT=1`, `pnpm build`, `pnpm exec vitest run`, Playwright via `playwright.external.config.ts` sur API/Web disponibles, puis scripts `check-architecture-boundaries`, `verify-foundation-docs`, `check-migrations`, `check-secrets`, `check-tracked-files` et `git diff --check`. Logs locaux ignorés dans `.v1/duration-*.log`. Les deux SKIP ne sont pas comptés comme succès.

## Limites et suite

Le lot 6 reste ouvert pour les scénarios MOCK timeout/résultat invalide ; les autres formats, le compositing et l’audio libre restent au lot média. La durée numérique d’une ancienne scène ne permet pas d’inférer son intention : l’origine reste inconnue jusqu’à une action utilisateur. Les snapshots déjà créés gardent leur durée exacte.

## Rollback

Suspendre les nouveaux runs et changements de durée, revenir au candidat précédent en conservant la colonne nullable et toutes les versions. L’ancien code conserve les durées existantes mais ne sait pas suivre leur origine : ne pas présenter les changements de défaut comme opérationnels pendant ce retour. Rejouer lecture, historique et lancement sur une copie avant reprise des écritures. Aucun effacement de données n’est nécessaire.
