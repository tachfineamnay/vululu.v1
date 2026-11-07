# Mes projets et démarrage d’une création — 2026-11-06

## Périmètre et contrats

Suite du raccordement Product Design bleu/jaune. Travail commencé le 2026-11-05, recette finalisée le 2026-11-06. Modifications locales précédentes et `.dsh/` préservées ; aucun commit applicatif, push, déploiement ou dépendance supplémentaire.

Exigences : PRD-02/03/06/13, CDC-F-010/012/020/024/061, CDC-N-001/003/007/008. Sources ciblées : kit de design, `V1_DEMO_BRIEF_PROFILE_CONTRACT.md`, `V1_DEMO_PRODUCTION_PLAN_CONTRACT.md` et contrats/API effectifs.

Interfaces conservées :

- `GET /api/auth/me`, `/api/projects`, `/api/contexts` : session et ressources autorisées.
- `POST /api/projects` : contexte, titre, objectif, plateforme et format obligatoires ; durée initiale optionnelle. L’interface n’invente pas une sauvegarde serveur sans ces champs.
- `PATCH /api/projects/:id/brief` : objectif, public, ton et CTA nécessaires ; paramètres normalisés par le serveur, révision immuable.
- `GET /api/projects/:id/production-plan` : livrables, admissibilité et prix MOCK sans création de run.
- `POST /api/projects/:id/brief/confirm` : version exacte et checksum ; plan relu avant confirmation et lancement.

Aucun changement backend, domaine, migration, RBAC, budget ou snapshot. Les champs réseau/format ne sont pas présentés comme modifiables après création : le serveur exige leur correspondance avec le projet. Le cadrage peut être adapté dans le brief.

## Parcours livré et recette

1. **Mes projets — PASS.** Nom, contexte autorisé, résultat recherché du projet, destination, état serveur traduit et prochaine action appropriée au stade connu. Le statut de liste ne permet pas d’inférer une confirmation exacte du brief : la prochaine action reste une invitation à relire le travail. `Nouveau projet` est l’action principale. États de chargement, erreur avec reprise et état vide distincts ; aucune statistique de remplissage. Accès direct au Studio pour reprendre un projet existant.
2. **Votre idée — PASS.** Nom et résultat recherché sans contenu fictif prérempli, validation native et possibilité de revenir modifier l’idée. Aucun modèle IA ni flow à construire.
3. **Vos références — PASS.** Contexte existant réutilisable, sans sélection implicite de fichiers. Un contexte est requis, mais pas une marque commerciale, un logo ou un site. Création d’un contexte via le formulaire existant puis retour au même brouillon vérifié. `returnTo=project` est une destination interne fixe, pas une URL de redirection libre.
4. **Votre destination — PASS.** Plateforme et format présentés avant l’enregistrement, cadre initial expliqué en mots et aperçu de proportions. Vidéo multiscène qualifiée ; libellé « Vidéo verticale (Reel) » lisible et production explicitement indisponible, comme les autres formats non qualifiés. Le cadre est un gabarit fonctionnel HTML, pas un média généré ou une image prétendument produite.
5. **Votre création — PASS.** Récapitulatif puis création réelle du projet sans lancement de production. Durée détaillée, public, ton, CTA et références de fichiers différables. L’usage initial organique est expliqué ; l’usage sponsorisé et ses droits se règlent dans les ressources du projet existant.
6. **Brief et reprise — PASS.** L’idée et les informations déclarées du contexte sont reprises dans les champs, sans enregistrement implicite. Arrivée au brief par focus pour un projet neuf sans brief ; les projets existants restent directement accessibles, sans refaire le démarrage. Saisie conservée lors des changements d’étape et d’un échec contrôlé de création. Protection d’un brief modifié avant navigation ; enregistrement, rechargement, confirmation et reprise serveur vérifiés.
7. **Avant production — PASS.** Livrables qualifiés, estimation indicative et plafond MOCK issus du plan serveur avant confirmation. Le bouton nomme la version et son plafond. Les modifications non enregistrées bloquent confirmation et production ; les vérifications de plan/checksum et d’admissibilité existantes restent actives. Aucun coût réel ou fournisseur connecté annoncé.

## Sauvegarde du brouillon de démarrage

Avant la création serveur, la saisie est conservée dans `sessionStorage`, dans une clé liée à l’identité retournée par `/api/auth/me`. Seuls les champs autorisés sont repris après validation de leurs types, bornes et valeurs. Les contextes sont revalidés contre la liste du propriétaire. Aucun brouillon d’un autre compte n’est chargé par l’interface.

Le message distingue cette conservation dans l’onglet d’un enregistrement serveur. Fermer l’onglet peut perdre ce brouillon ; ce n’est ni une reprise multi-appareil ni une mémoire sémantique. Si le stockage navigateur est indisponible, le formulaire reste utilisable et la sortie est protégée contre la perte de saisie. Après confirmation de création serveur, le brouillon local est retiré. Le projet et les révisions de brief utilisent ensuite les mécanismes serveur existants.

## Portée visuelle

Le scope bleu est étendu à l’accueil `/` et `/projects/new`, puis au seul panneau du brief dans le Studio. Le reste du montage, des scènes et de la correction conserve son implémentation actuelle ; aucune refonte globale implicite. Une règle limitée à `.project-topbar .topbar-actions` corrige le retour à la ligne des liens de l’en-tête du Studio.

Le contrôle manuel a trouvé un débordement de 5 px dans cet en-tête mobile, invisible avec une simple comparaison à `innerWidth` qui inclut la gouttière de défilement. La règle a été corrigée et la recette compare désormais aussi `scrollWidth` à `clientWidth` au retour dans le projet. Focus d’arrivée sur le brief testé. Tokens canoniques réutilisés ; fallback de police du kit, aucune police réseau ajoutée. Login, administration et bannière démo conservés.

## Preuves exécutées

| Commande / contrôle | Résultat |
|---|---|
| `pnpm test -- tests/project-presentation.test.ts tests/domain/brief-production-settings.test.ts tests/v1/brief-profile.test.ts tests/v1/production-plan.test.ts` | **27 PASS**, 4 fichiers ; `.v1/projects-tests.log`. Inclut états inconnus, absence de publication fictive, reprise/validation du brouillon, profils, confirmation exacte, budget/admissibilité et isolation des plans. |
| `pnpm test:e2e e2e/projects-start.spec.ts e2e/contexts-design.spec.ts e2e/brief-profile.spec.ts e2e/conversation-demo.spec.ts` | Premier passage : **3 PASS / 2 FAIL**. Une assertion Playwright sur `<option disabled>` était inadéquate ; la recette média a dépassé 240 s en fin de contrôle sous charge parallèle. Aucun PASS global revendiqué pour ce passage. `.v1/projects-e2e.log`. |
| Rejeu seul `e2e/projects-start.spec.ts` | **1 PASS**, 43,3 s, après vérification de la propriété native `disabled` ; `.v1/projects-start-final.log`. |
| Rejeu seul `e2e/brief-profile.spec.ts` | **1 PASS**, 49,0 s ; `.v1/projects-brief-profile-final.log`. Brief, révisions, storyboard périmé, durée personnalisée, production déterministe, dimensions/durée du média et QA contrôlés. |
| Rejeu final `e2e/projects-start.spec.ts` après focus/en-tête | **1 PASS**, 34,8 s ; `.v1/projects-start-focus-final.log`. Validation native, création contexte/retour, étapes précédentes, rechargement, erreur 503 explicitement injectée, vrai projet/brief/plan, confirmation et reprise, absence de débordement mobile. |
| `pnpm typecheck` | **PASS**, monorepo ; `.v1/projects-typecheck-final.log`. |
| `$env:LINT_STRICT='1'; pnpm lint` | **PASS** ; `.v1/projects-lint-final.log`. |
| `pnpm build` final exécuté seul | **PASS**, API + frontend ; compilation Next.js et TypeScript ; `.v1/projects-build-final.log`. Premier lancement interrompu pour réduire la charge, sans être présenté comme réussi. |
| Contrôles finaux | **PASS** : `git diff --check`, `node docs/design-system/scripts/check.mjs` (57 tokens), `scripts/check-secrets.ps1` (546 fichiers), `scripts/verify-foundation-docs.ps1` (9 empreintes). Lint strict rejoué après les dernières corrections : **PASS**. |
| Contrôle navigateur du build sur `127.0.0.1:3200` | **PASS** : Mes projets rendu, données réelles, action bleu `rgb(35,71,190)`, hauteur 49,6 px, aucune ombre ; aucune erreur console dans le relevé. Serveur lié à 127.0.0.1, arrêté après inspection. |

Cinq scénarios E2E distincts validés au total après les rejeux : démarrage (1), contextes/cascade (2), brief/média (1), conversation (1). Les répétitions ne sont pas comptées comme de nouveaux scénarios. Tests locaux avec API réelle et données fictives isolées ; assistance et tarifs MOCK déclarés. Aucun appel IA payant ni transfert social.

## Captures inspectées

Fichiers locaux non commités, sous `.v1/projects-design-captures/` :

- `01-projects-before.jpg`, `02-start-before.jpg` : existant capturé avant intervention.
- `03-idea-after.jpg` : idée et saisie, focus visible.
- `04-destination-desktop.jpg` : format, cadre indicatif, réglages différables.
- `05-summary-mobile.jpg` : récapitulatif et action d’enregistrement à 390 px.
- `06-plan-mobile.jpg` : confirmation de la version et du plafond, avant la correction de l’en-tête ; preuve de l’itération, pas capture finale d’absence de débordement.
- `07-projects-desktop.jpg`, `08-projects-mobile.jpg` : accueil avec métadonnées et prochaines actions réelles.
- `09-projects-production.jpg` : rendu compilé stabilisé, viewport 1440 × 1024.

Une capture compilée blanche et une capture prise trop bas dans la liste ont été rejetées et remplacées. Aucun assemblage ni image remplaçant l’application. Recette responsive : 1440/1024/768/390/320 px sur le démarrage ; Mes projets et reprise du Studio vérifiés à 390 px. Le build et les tests ne sont pas une certification d’accessibilité.

## Limites et suite

- Le contexte, le réseau et le format ne peuvent pas être différés au-delà de la création avec l’API actuelle. Public, ton et CTA peuvent attendre le brief mais sont nécessaires à son enregistrement.
- Avant création, conservation limitée à l’onglet et au compte courant. Aucun endpoint de brouillon partiel de projet n’a été ajouté. Navigation entre étapes et retour après création de contexte testés ; l’historique natif du navigateur n’est pas transformé en historique de chaque étape.
- La liste utilise l’objectif et l’état du projet exposés par l’API ; elle n’invente pas le détail d’une confirmation ou d’une QA absent de cette réponse.
- Seule la production Video est qualifiée. Reel, image, carrousel et motion restent annoncés indisponibles, sans simulation de capacité.
- Le prévisionnel et le plafond restent MOCK. Aucun branchement de modèle IA, flow éditable, publication, paiement ou fonctionnalité V2.
- Comparaison exacte au PNG privé : **NOT_RUN**, source toujours absente ; [QA de fidélité](../../design-qa.md) maintenue bloquée séparément. Contrôle du rendu et des tokens effectué sur les surfaces réellement accessibles.
- Suite globale du dépôt et scénario historique `v0.spec.ts` : **NOT_RUN** pour cette tranche. Son démarrage a été adapté aux quatre étapes ; le scénario ciblé nouveau et les régressions brief/conversation/contextes sont exécutés.

Suite proposée : migration du Studio complet autour de la création, sans modifier ses contrats métier ni activer les formats non qualifiés.

## Rollback et Git

Les modifications précédentes du parcours contextes restent présentes. Pour revenir sur cette seule tranche, isoler les changements Mes projets/démarrage/brief et les ajouts de styles correspondants, en conservant les modifications antérieures et toute édition utilisateur ultérieure. Aucun rollback de données ou migration nécessaire. Le brouillon local de démarrage est indépendant des projets déjà persistés.

Base de recette locale isolée et artefacts conservés, `.env` inchangé. Aucun commit applicatif ni push ; le seul commit additionnel reste celui du kit demandé lors de la tranche précédente. Les fichiers générés par Next sont retirés du diff après vérification. Scan de secrets, intégrité documentaire et vérification du diff : PASS.
