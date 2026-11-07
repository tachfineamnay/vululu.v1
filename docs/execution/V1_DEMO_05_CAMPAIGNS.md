# V1-DEMO — Lot 5, tranche campagnes

- Date : 2026-11-04 ; branche codex/v1-demo-coolify ; base 52c6537.
- Exigences : PRD-16, CDC-F-013, CDC-N-001/005/007 ; E02.
- Contrat : `docs/releases/V1_DEMO_CAMPAIGNS_CONTRACT.md` ; décision de modèle ADR-0017.
- Statut : verticale campagnes vérifiée localement ; bibliothèque d’actifs et lot 5 complet non clos.

## Comportement livré

Une campagne persistante regroupe les projets de son propriétaire. L’utilisateur crée une campagne, consulte ses projets, rattache un projet, le déplace ou le retire du groupe sans supprimer son contenu. Le nom et la description sont validés dans le domaine et dans le contrat HTTP. Les réponses publiques ne renvoient pas userId.

Les cas d’usage appliquent la propriété sans bypass super-admin ; l’adaptateur Prisma revalide les propriétaires du projet et de la campagne dans une transaction. Les mutations sont auditées et protégées par session/CSRF. Le regroupement ne modifie pas le snapshot d’un run existant.

L’écran /campaigns utilise les composants/styles du Studio, expose des erreurs et états de chargement, conserve la sélection dans l’URL et fonctionne sur mobile. Le catalogue marque désormais les campagnes disponibles ; les actifs restent NON CONNECTÉ tant que leur tranche n’est pas livrée.

Le bootstrap démo ajoute une campagne fictive et y rattache uniquement un projet nouvellement créé. Une relance conserve les affectations déjà choisies et refuse une collision avec un tiers. Les secrets de déploiement restent injectés ; les credentials du workflow CI sont exclusivement des fixtures publiques sur une DB jetable.

## Migration et architecture

Migration additive `20261104174000_v1_demo_campaigns` : table Campaign, index propriétaire, référence nullable Project.campaignId et index. Aucun ancien run, artefact ou projet n’est réécrit. Le retrait d’un regroupement change seulement cette référence.

Le domaine n’a aucune dépendance runtime ; l’application dépend de ports. La couche DB réexporte le client Prisma natif pour que le test de migration utilise sa propre connexion isolée, sans modifier le singleton ni ajouter de dépendance.

## Preuves réellement exécutées

| Commande / campagne | Résultat |
|---|---|
| Tests domaine campagnes avant implémentation | 8 FAIL attendus sur absence du comportement |
| Tests API campagnes avant routes | 7 FAIL attendus, endpoints absents |
| `pnpm db:generate` | PASS ; Prisma 6.19.3 |
| Tests domaine campagnes + pureté | 12 PASS |
| API campagnes après implémentation initiale | 7 PASS |
| `tests/domain` + campagnes + bootstrap démo enrichi | 115 PASS, 14 fichiers |
| Garde-fous unitaires applicatifs, sans transport | 2 PASS ; validation métier et absence de bypass super-admin |
| Régression `pnpm exec vitest run tests --reporter=dot` | 221 PASS / 2 SKIP, 26 fichiers ; avant ajout des deux tests unitaires et du test de migration supplémentaires |
| Migration ancienne version + API/snapshots, tests ciblés complémentaires | 9 PASS ; nouvelle base isolée, 12 migrations appliquées puis mise à jour vers la cible |
| E2E avant écran | FAIL attendu : titre Campagnes absent |
| E2E création/rattachement/reload/retrait | PASS sur Web de développement ; mobile inclus |
| E2E démo + campagnes sur `next start` après build | 2 PASS, 19,1 s ; compte ordinaire, API réelle sur DB isolée |
| Contrôle visuel | Capture .v1/campaigns.png inspectée ; contenu fictif, aucun secret |
| Seed enrichi sur DB E2E existante | PASS, données et affectations conservées |
| `pnpm typecheck` | PASS après correction du type frontend ProjectSummary |
| `LINT_STRICT=1 pnpm lint` | PASS |
| `pnpm build` | PASS API/Web ; route /campaigns incluse |
| Contrôle migrations, minimum 13 | PASS |
| Frontières | PASS : 21 fichiers domaine, 18 application |
| Scan de contenu | PASS : 413 fichiers au contrôle |
| Intégrité documentaire / fichiers suivis | PASS ; neuf empreintes fondatrices intactes |
| Docker Linux / CI distante / Coolify | NOT_RUN pour cette tranche |

Les 2 SKIP concernent les tests S3 nécessitant un service explicitement configuré. Ils ne sont pas comptés PASS. La migration et l’API ont aussi été revérifiées après l’ajout des assertions d’immutabilité des snapshots. Le test de migration conserve sa base et ses fichiers de preuve dans le cluster/dossier de test ; aucune base existante n’est effacée.

Les deux échecs initiaux de résolution de module et le champ frontend ajouté au mauvais type ont été corrigés ; ils ne sont pas présentés comme des preuves TDD métier. Le build et les vérifications finales passent après ces corrections.

## Sécurité des preuves

La configuration Playwright externe ne conserve plus de trace réseau : elle pourrait contenir credentials ou cookies d’une cible réelle. Les captures de page en cas d’échec restent actives. Le workflow CI continue d’utiliser uniquement des fixtures sur PostgreSQL éphémère. Aucun fournisseur IA, Postiz réel ou service payant n’a été appelé.

Les services locaux de recette écoutent sur des ports de test ; aucune ressource distante n’a été modifiée. L’environnement Linux nécessaire aux tests d’images a fait l’objet d’une demande de décision utilisateur, Docker Desktop local étant indisponible. Cette décision n’est pas remplacée par un succès source.

Réponse utilisateur : il dispose d’un serveur et déploie directement. La livraison prépare donc le déploiement et les commandes de validation sur son serveur ; les tests d’images Linux restent NOT_RUN tant que leurs résultats ne sont pas disponibles. Aucun déploiement distant n’a été effectué par cette tranche.

## Limites et suite

- Bibliothèque d’actifs, audio, formats avancés, interactions IA simulées enrichies, MCP et exploitation restent à livrer selon le plan complet.
- Pas de suppression de campagne ni purge automatique ; politique de rétention au lot 11.
- L’exécution CI distante reste NOT_RUN ; sa définition a été complétée pour initialiser le compte ordinaire des E2E.
- Observation pour le lot observabilité : le handler d’erreur historique journalise parfois une erreur Zod comme 500 avant de répondre correctement 400. Ne pas baser les futures alertes sur cet événement avant correction.
- Le transport MCP réutilisera CampaignUseCases ; aucun accès direct à la DB n’a été ajouté.

## Rollback

Revenir au code précédent en conservant la migration additive et les données. La référence nullable et la table supplémentaire sont ignorées par l’ancienne version. Ne pas supprimer table, colonnes, fichiers ou base pour effectuer ce rollback ; aucune réécriture de l’historique Prisma.
