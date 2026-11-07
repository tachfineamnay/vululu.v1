# Fondations bleues et Marques et références — 2026-11-05

## Livraison et périmètre

Suite autorisée des trois prompts : [diagnostic initial](PRODUCT_DESIGN_DIAGNOSTIC_2026-11-05.md), fondations, puis parcours contextes/ressources. Product Design utilisé pour l’audit et la vérification navigateur. Pas d’exploration graphique supplémentaire, pas de Visualize, pas de bibliothèque UI, pas de dépendance ajoutée, pas de déploiement ni de push.

Exigences : PRD-02/15, CDC-F-010/011/012/013, CDC-N-001/003/007/008/009, E02-01/02/03/04. Les contrats API, la propriété serveur, le CSRF, les révisions immuables, la confirmation humaine et `expectedVersion` restent les mécanismes existants. Aucun changement backend ou migration.

## Résultat du parcours

1. **Retrouver — PASS.** Recherche locale insensible aux accents sur les seuls contextes retournés par l’API autorisée ; nombre de résultats, sélection nommée, absence de résultat et effacement. L’URL conserve le contexte sélectionné.
2. **Consulter — PASS.** Fiche en lecture avant édition : identité, activité/offre/sujet, références, contraintes/consignes. Les informations déclarées, les révisions confirmées et les champs facultatifs manquants sont distingués. Aucun pourcentage de complétude inventé.
3. **Créer — PASS.** Nom et description obligatoires, aucune donnée fictive préremplie ; public/ton, site/couleurs et aide aux contraintes à la demande. Après réponse serveur, ouverture de la fiche créée. Validation native, erreur contrôlée 503 conservant les données et reprise vérifiées.
4. **Modifier — PASS.** Éditeur à la demande, confirmation explicite, nouvelle révision et historique réel. Navigation protégée lorsque le brouillon change ; focus d’entrée et de retour. Le conflit réel 409 conserve la saisie ; aucune révision concurrente écrasée. Les anciens runs gardent leurs snapshots selon les tests existants.
5. **Ressources — PASS.** Contexte conservé depuis la fiche, formulaire d’import replié, fichiers réels, anciennes versions accessibles, droits/provenance et sélection d’une version exacte pour un projet. Droits inconnus et usage sponsorisé incompatible expliqués. Les sélections ne sont pas modifiables si leur chargement a échoué.
6. **Retour au projet — PASS.** Création d’un projet avec le contexte choisi, retour depuis le Studio à sa fiche et à ses ressources, retour au même projet depuis la bibliothèque. Aucune production lancée par cette navigation.

## Fondations et cascade

`atelier-blue.css` importe directement la source canonique `tokens.css`. Les valeurs restent vérifiées contre `tokens.json`. Le scope `data-vululu-theme="blue"` est posé uniquement sur `/contexts`, `/contexts/new` et `/assets`. Les classes existantes sont adaptées dans ce scope ; le reset global et le thème des autres routes restent en place.

Typographie, couleurs, espaces, boutons, champs, liens, sélection, focus, messages et états de chargement raccordés. Fallback système déclaré : aucun fichier DM Sans livré, aucun téléchargement réseau ajouté. Contrôles de 48 px minimum, focus bleu 2 px avec décalage 3 px, liens soulignés dans le contenu, détails et sélections natifs. Le jaune marque sobrement les éléments à compléter. Les couleurs des contextes sont des données de création, indépendantes des boutons Vululu.

La route représentative `/contexts` a été inspectée avant extension. Contrôle du build compilé en boucle locale : bouton secondaire blanc, texte `rgb(35, 71, 190)`, aucune ombre ; aucun débordement en 1440 × 1024 et 390 × 844. Le login conserve son dégradé historique et ne possède aucun shell bleu après navigation. L’administration refuse toujours le compte ordinaire et ne possède aucun shell bleu. La bannière MODE DÉMO reste visible. Ce contrôle ne certifie pas toutes les sections administrateur.

## Commandes et preuves

| Contrôle exécuté | Résultat |
|---|---|
| `node docs/design-system/scripts/check.mjs` | PASS : 57 tokens synchronisés, liens et 13 couples de contrastes |
| `pnpm typecheck` | PASS, monorepo ; build final TypeScript également PASS |
| `$env:LINT_STRICT='1'; pnpm lint` | PASS, sortie 0 ; journal `.v1/design-lint-final.log` |
| `pnpm build` | PASS API + Next.js, toutes les routes compilées ; `.v1/design-build-final.log` |
| `pnpm test -- tests/domain/context-validation.test.ts tests/domain/context-brief.test.ts tests/v1/context-review.test.ts tests/v1/context-review-use-cases.test.ts tests/v1/assets.test.ts tests/v1/asset-use-cases.test.ts` | 28 PASS ; premier passage ressources bloqué par une ancienne fixture immuable, puis rejeu ci-dessous |
| `pnpm test -- tests/v1/assets.test.ts` | 16 PASS : binaires réels, versions, droits, IDOR, CSRF, validation upload et snapshots ; `.v1/design-assets-tests.log` |
| `pnpm test:e2e e2e/contexts-design.spec.ts e2e/context-review.spec.ts e2e/assets.spec.ts` | 4 PASS, 2,6 min ; `.v1/design-e2e-final.log` |
| `pnpm test:e2e e2e/contexts-design.spec.ts` après ajout de la recette brouillon/conflit | 2 PASS, 1,5 min ; `.v1/design-conflict-e2e.log` |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | PASS : aucun secret dans l’arbre scanné |
| `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | PASS : 9 empreintes, corpus intact |
| `git diff --check` | PASS après normalisation des fins de fichiers |

Les quatre scénarios E2E distincts couvrent aussi clavier, erreurs, rechargement, révisions, imports réels, deux versions, sélection de projet, refus de sélection sans droits et cascade vers login/admin. Responsive : 1440/1024/768/390/320 px sur les contextes, 390 px sur les ressources. L’API est réelle ; seul l’échec 503 de recette est injecté explicitement. L’assistance de contexte reste MOCK, sans fetch d’URL. Les tests API couvrent le conflit, l’isolation et la persistance des versions. Aucun coût fournisseur engagé.

Les tests existants de ressources utilisaient un identifiant fixe pour leur image de recette. Les fichiers conservés d’une ancienne exécution provoquaient un conflit immuable. Les fixtures API/E2E utilisent désormais un identifiant unique ; aucun ancien fichier n’a été effacé ou écrasé. Les sélecteurs E2E ont été adaptés aux sections repliables, au nouveau retour après création et aux messages locaux, sans retirer les assertions métier.

## Captures navigateur inspectées

Captures locales, non commitées :

- `.v1/design-captures/01-contexts-before.jpg` : état vide initial.
- `.v1/design-captures/02-create-before.jpg` : formulaire initial.
- `.v1/design-captures/03-review-before.jpg` : consultation initiale en formulaire intégral.
- `.v1/design-captures/04-foundations.jpg` : première route raccordée.
- `.v1/design-captures/05-context-after.jpg` : lecture puis édition à la demande.
- `.v1/design-captures/06-context-mobile.jpg` : parcours mobile en développement.
- `.v1/design-captures/07-assets-desktop.jpg` : bibliothèque et sélection réelle de projet.
- `.v1/design-captures/08-context-production-desktop.jpg` : build final, viewport 1440 × 1024.
- `.v1/design-captures/09-context-production-mobile.jpg` : build final, viewport 390 × 844.

Les captures en chargement ont été rejetées ou remplacées. Le navigateur a échoué sur certaines captures pleine page après raccordement ; les captures finales utilisent le viewport réel, sans recomposition. Les erreurs console du build sur la fiche consultée : aucune dans le relevé. Ce relevé ne certifie pas toutes les routes.

## Limites explicites

- **Fidélité à la maquette PNG : NOT_RUN**, fichier absent du dépôt et non disponible dans cette conversation. Le lien privé du kit n’a pas été présenté comme une image consultée. [QA de fidélité](../../design-qa.md) bloquée sur cette seule comparaison, sans certification fictive.
- Aucun endpoint de contraintes distinct : consignes dans la description, ton dans son champ existant ; aucun pseudo-champ enregistré silencieusement ailleurs.
- Aucun fetch/analyse distante d’URL. La proposition existante reste déterministe et porte MOCK.
- Suppression/renommage de ressource indisponibles ; l’import d’une nouvelle version reste la voie réelle disponible.
- Les trois entrées de navigation cibles et la refonte du Studio complet ne sont pas généralisées dans cette tranche ; les destinations existantes restent accessibles. Seuls leurs libellés utiles sont clarifiés.
- Pas de qualification S3/Linux, fournisseur IA live, Postiz réel, lecteur d’écran complet ou certification WCAG. Suite média complète et E2E historique `v0.spec.ts` : NOT_RUN dans cette tranche ; son parcours de création a été mis à jour, les E2E ciblés sont exécutés.
- Préflight de contexte Product Design persistant : commande tentée, Python local non configuré. Aucun nouveau contexte persistant annoncé ; sources explicites du dépôt utilisées.

## Git, environnement et rollback

Seul le commit du kit demandé est dans l’historique local (`f2556b6`). Modifications applicatives et rapports laissés non commités pour revue ; `.dsh/` préservé, `.env` inchangé, aucune fusion de branche. Les changements générés par Next dans `AGENTS.md` et `next-env.d.ts` ont été retirés du diff après les contrôles ; le kit et les instructions utilisateur restent intacts.

Recette sur la base isolée `vululu_design_20261105` (19 migrations existantes), avec comptes de recette et données fictives ; bases utilisateur existantes inchangées. L’application de développement reste sur le port 3100 et son API sur 3101. Le serveur de production de contrôle sur 3200, lié uniquement à 127.0.0.1, a été arrêté après inspection. Aucun secret affiché ou ajouté au dépôt.

Rollback applicatif : après conservation de tout travail utilisateur ultérieur, revenir aux versions de fichiers du commit du kit `f2556b6` pour cette tranche. Aucun rollback de données ni migration nécessaire. La base et les artefacts de recette restent isolés et conservés ; aucune suppression automatique.

Suite proposée : fournir le PNG pour clôturer la comparaison visuelle, puis migrer Mes projets et le Studio par tranches, en conservant leurs contrats réels.
