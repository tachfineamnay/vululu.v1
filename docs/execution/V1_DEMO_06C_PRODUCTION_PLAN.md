# V1-DEMO — Plan de production et plafond avant mise en file

- Date : 2026-11-05 ; tranche 6C du lot 6, qui reste partiel.
- Exigences : PRD-03/06/13, CDC-F-020/024/030/033/061, CDC-N-001/005.
- Décision : ADR 0022 ; contrat `docs/releases/V1_DEMO_PRODUCTION_PLAN_CONTRACT.md`.

## Résultat

Le studio expose avant confirmation les étapes réellement exécutables et leurs dépendances, le ratio, le nombre de scènes, la durée, l’estimation indicative et le plafond MOCK du brief. Le rendu local affiche zéro invocation fournisseur et zéro coût simulé. Le chemin durable applique le catalogue figé, les capacités et les licences autorisées ; les candidats de fallback restent dans le plafond. Aucun paiement réel ni fournisseur IA connecté.

Le nouveau cas d’usage de lecture exige la propriété, y compris face à un super-admin, et ne crée aucun run, révision ou événement de coût. Le DTO expose une empreinte de provenance sans instructions privées d’agent. Les nouvelles révisions de brief possèdent un profil canonique même si un client omet les paramètres ; les anciennes révisions et leurs empreintes ne sont pas réécrites.

La transaction de lancement recalcule le plan avant création de JobRun, ProductionJob et outbox. Un budget insuffisant ou l’absence de modèle admissible refuse le lancement et conserve le statut précédent. Le snapshot conserve le plan effectivement retenu. Le plafond est confirmé avec la version exacte du brief ; l’estimation reste indicative, sans mécanisme de devis commercial.

Le plan utilise les durées du storyboard uniquement s’il appartient à la version courante du brief. Sinon il estime les durées du nouveau brief, jusqu’à régénération. L’interface recharge le plan avant confirmation ou lancement et demande une relecture si son empreinte a changé. Un bouton de recalcul permet de récupérer après une modification du catalogue ou une indisponibilité temporaire.

## Preuves

| Vérification | Résultat |
|---|---|
| RED initial de la nouvelle API | 5 FAIL : routes absentes, dépassement accepté, plan non figé, profil omis non canonique |
| API plan, isolation, lecture sans effets, budget et snapshot après raccordement | 5 PASS |
| Durée après modification du brief | RED : ancien storyboard 10 s au lieu de 15 s ; corrigé par contrôle de liaison au brief |
| Régression ciblée initiale des anciens parcours | 12 FAIL / 37 PASS / 2 SKIP ; fixtures durables sans catalogue admissible ou sans la capacité de workflow scene.generate |
| Domaine + API/transactions + durabilité/stockage/hardening + brief/plan | **204 PASS / 2 SKIP**, 24 fichiers, 153,86 s |
| Typecheck complet initial, build API/Web final | PASS |
| Lint strict final | PASS |
| E2E production final : profil/plan/plafond zéro et verticale existante | 2 PASS, 1,0 min ; hauteur du bouton de recalcul ≥44 px vérifiée dans le test |
| Mesure mobile après reprise de session | Fenêtre 390 px, document 390 px ; bouton recalcul 44 px après correction ; capture `.v1/production-plan-mobile.png` |
| Frontières / documents fondateurs | PASS : 23 fichiers domaine, 26 application, 9 empreintes fondatrices intactes |
| Scan de secrets / diff final | PASS, 469 fichiers ; git diff --check PASS et diff relu |

Commande de régression ciblée :

```powershell
pnpm exec vitest run tests/v1/production-plan.test.ts tests/v1/frozen-routing.test.ts tests/v1/v1-01-d-durable.test.ts tests/v1/v1-01-e-storage.test.ts tests/v1/v1-01-f-hardening.test.ts tests/v1/v1-01-application.test.ts tests/api.test.ts tests/v1/brief-profile.test.ts tests/domain
```

La première vérification du refus de budget a ensuite rencontré un champ Prisma de fixture inexistant dans le comptage d’outbox ; corrigé par une comparaison avant/après sur la base isolée. Les tests du plan créent une base PostgreSQL dédiée, conservée comme preuve, pour qu’un catalogue d’un autre test ne masque pas un refus de budget. Les anciens tests de pipeline déclarent désormais leur modèle de fixture explicitement MOCK ; aucun garde serveur n’a été assoupli. Le test du plafond worker oppose un modèle admissible à un modèle mieux classé mais trop cher : une valeur de budget augmentée par le worker ne permet pas de choisir le second.

La dernière régression complète disponible est celle de 6B (345 PASS / 2 SKIP). Elle précède les changements de 6C ; les 204 résultats ci-dessus sont une campagne ciblée, sans être présentés comme un nouveau passage complet. Les 2 SKIP concernent S3 et ne comptent pas comme succès. Docker/Linux/Hatchet/S3 et HTTPS Coolify : NOT_RUN pour cette tranche. Aucun push, déploiement ou publication externe.

## Limites et suite

La conversation et l’adaptation créative du storyboard restent à compléter. Les formats autres que Video et le mix audio restent bloqués jusqu’à leur qualification. La provenance globale et la liaison au brief restent conservatrices ; la précision des invalidations doit être examinée avec les dépendances média. Le compte démo complet, les échantillons audio et leur attribution dans l’export, MCP et l’exploitation restent suivis dans le plan global. Cette tranche ne clôt pas la V1 complète.

## Rollback

Aucune migration. Redéployer le candidat 6B en conservant les snapshots enrichis ; ne pas réécrire leurs checksums. Suspendre les nouveaux lancements pendant le rollback, car le contrôle de budget avant mise en file et l’affichage du plan ne seraient plus disponibles. Les versions existantes restent consultables et téléchargeables ; reprendre les lancements après retour au candidat vérifié.
