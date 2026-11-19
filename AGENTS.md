# AGENTS.md — Instructions de développement pour agents IA

Ce fichier s'applique à tout agent (DeepSeek Harness, Codex, Claude, Cursor, MCP client) qui travaille dans ce dépôt. Il prime sur les habitudes génériques de l'agent.

## 1. Autorité documentaire

Ordre de lecture obligatoire :

1. README.md
2. docs/README.md
3. docs/01_PRD_V1.md
4. docs/02_CAHIER_DES_CHARGES_V1.md
5. docs/03_ARCHITECTURE_V1.md
6. docs/adr/README.md et les ADR applicables
7. docs/11_BACKLOG.md et docs/backlog/ROADMAP_V1.md
8. docs/backlog/P0_0_AUDIT_FONDATIONS.md
9. docs/INAUGURATION_REPORT.md

Les documents de docs/ sont fondateurs ou d'inauguration. Les documents importés (PRD, CDC, architecture, backlog, prompt, note V2) sont **verbatim** : ne jamais les modifier. Une évolution passe par un nouveau document, un ADR ou une révision explicite.

En cas de contradiction entre documents, **arrêter** et signaler le conflit. Ne pas choisir silencieusement.

## 2. Périmètre

- V1 uniquement : outil interne, invitations, contextes, workflow, agents, production média, correction par Scene ID, MCP, contrôle qualité, Postiz.
- **V2 interdit** : Memory Bank, mémoire sémantique, embeddings, apprentissage des préférences, contextes hiérarchiques enrichis, monétisation, abonnements, crédits, marketplace, Everything LLM.
- Les points d'extension V2 sont documentés ; les implémenter serait une violation de périmètre.
- Ne pas ajouter de fonctionnalité non demandée, même « utile ».
- Ne pas créer de structure applicative avant le lot qui la justifie.

## 3. Règles absolues

- **Aucun secret** dans le dépôt : clé API, token, mot de passe, certificat, fichier .env, identifiant privé, donnée client.
- **Jamais de git push --force**, de réécriture d'historique distant, de suppression de commit ou de fichier non demandée.
- **Jamais de publication** (Postiz, réseau social, déploiement public) sans approbation humaine explicite.
- **Aucun succès fictif** : si un test n'a pas tourné, écrire NOT_RUN ; si un fournisseur est mocké, écrire MOCK.
- **Aucune dépendance payante** ou compte externe sans autorisation.
- **Aucune modification silencieuse** du périmètre, des contrats ou des décisions d'architecture.
- **Aucun accès direct** depuis MCP à PostgreSQL, Hatchet ou Postiz.

## 4. Invariants d'architecture

- Domain Core pur : pas de SDK fournisseur, pas de Prisma, pas de Hatchet, pas de Postiz.
- Application Layer : cas d'usage, RBAC, budgets, idempotence, composition.
- Infrastructure : adaptateurs remplaçables derrière des ports.
- PostgreSQL source de vérité ; S3-compatible pour les binaires ; pas de blobs lourds en base.
- Snapshots figés au lancement d'un run : contexte, brief, configs agents, politique fournisseur, workflow.
- Identifiants stables : project_id, scene_id, character_id ; les identifiants fournisseurs sont des bindings facultatifs.
- Artefacts immuables : nouvelle version plutôt qu'écrasement ; checksum et provenance.
- Approbation d'une version exacte (version + checksum) avant transfert.
- Postiz est externe ; le transfert est idempotent et journalisé ; transféré ne signifie pas publié.
- MCP et web partagent les mêmes cas d'usage et le même RBAC.
- Workers désactivables sans casser l'interface ; reprise après crash sans duplication.

## 5. Méthode de travail par lot

Pour chaque lot :

1. Identifier les exigences PRD/CDC concernées et les lister.
2. Définir les interfaces, les contrats et les critères d'acceptation.
3. Implémenter uniquement le périmètre du lot.
4. Exécuter les tests pertinents (unitaires, contrat, intégration, E2E).
5. Fournir les preuves : commandes, résultats, limitations.
6. Vérifier le diff, l'absence de secrets et l'absence de régression.
7. Mettre à jour la roadmap et proposer la suite.

Un lot ne se termine pas sans preuve. Un lot qui échoue doit être reverté ou corrigé avant la suite.

## 6. Tests et preuves

- Tests unitaires sur le domaine et les cas d'usage.
- Tests de contrat sur les adaptateurs (providers, Postiz, stockage, MCP).
- Tests d'intégration sur PostgreSQL et les files.
- Tests E2E sur la verticale concernée.
- Mocks explicites quand un fournisseur réel n'est pas disponible.
- Toute limitation est écrite dans le rapport de lot.
- Les tests de sécurité (IDOR, RBAC, SSRF, upload) sont obligatoires sur les lots concernés.

## 7. Documentation et décisions

- Toute décision structurante devient un ADR dans docs/adr/.
- Ne pas modifier un ADR accepté : en créer un nouveau qui le remplace.
- Les documents importés restent verbatim ; les ajouts vont dans docs/.
- Langue : documentation en français, identifiants de code en anglais. Toute exception doit être justifiée.
- Dates au format ISO 8601. Référencer les IDs PRD-xx, CDC-F-xxx, CDC-N-xxx, E00-xx.

## 8. Git

- Branche de référence : main.
- Commits courts, au présent, préfixés : feat, fix, docs, chore, test, refactor, adr.
- Un commit doit être relisible et réversible.
- Pas de commit de fichiers générés, de secrets ou de dépendances lourdes.
- Avant commit : scripts/check-secrets.ps1, git diff --check, relecture du diff.
- Pas de force push. Pas de réécriture d'une branche partagée.
- Protection de main et PR obligatoire : décision ouverte D-10.

## 9. Sécurité

- RBAC côté serveur, filtrage par propriétaire sur toutes les lectures et écritures, tests IDOR.
- Secrets uniquement côté serveur ; jamais dans le frontend, les logs, les artefacts ou les erreurs.
- Validation des entrées, protection SSRF sur les URLs, contrôle des uploads.
- Journalisation : actor_id, project_id, run_id, scene_id, provider_id, trace_id, versions, coûts, horodatage.
- Ne jamais afficher un secret dans une sortie de commande ou un rapport.

## 10. Definition of Done

- Code typé et documenté, migration si nécessaire.
- Tests unitaires et de contrat verts, intégration/E2E pertinents verts.
- RBAC et isolation vérifiés.
- Coûts et traces mesurés.
- Documentation/ADR mis à jour.
- Diff relu, aucun secret.
- Preuves fournies, limitations écrites.
- Rollback décrit.

## 11. Conditions d'arrêt

Arrêter et demander une décision si :

- une spécification est contradictoire ou manquante ;
- le dépôt distant n'est pas vide alors qu'un premier push est attendu ;
- une action destructive est nécessaire ;
- un secret est détecté ;
- une fonctionnalité V2 est demandée ;
- un coût fournisseur doit être engagé sans budget ;
- l'environnement ne permet pas d'exécuter un test obligatoire.

## 12. Références

- [README](README.md)
- [Index documentaire](docs/README.md)
- [Rapport d'inauguration](docs/INAUGURATION_REPORT.md)
- [Roadmap](docs/backlog/ROADMAP_V1.md)
- [ADR](docs/adr/README.md)
- [Baseline R00](docs/delivery/VULULU_BASELINE.md) — état factuel du dépôt
- [Règles de travail](docs/delivery/VULULU_WORKING_RULES.md) — règles de conduite détaillées
- [Statut de livraison](docs/delivery/VULULU_DELIVERY_STATUS.md) — avancement et preuves
- [Baseline Arena A00](docs/delivery/ARENA_BASELINE.md) — capacités réelles de la sandbox

---

# PARTIE B — AMENDEMENT ARENA (A00, 2026-11-19)

> Les sections 1 à 12 restent **intégralement en vigueur**. Cette partie B les **complète**
> pour le travail mené dans la sandbox Arena Agent Mode. En cas de conflit, la section la plus
> restrictive s'applique. Aucune règle existante n'est supprimée ni affaiblie.

## 13. Position produit : professionnel, jamais démo

**13.1** La cible est un **produit SaaS professionnel et commercialisable** pour indépendants.
Ce n'est **ni une démo, ni un MVP jetable**. Cette phrase est un critère d'arbitrage : face à deux
options, on choisit celle qui reste tenable en production.

**13.2** Une **démonstration** est un état assumé et transitoire, jamais une finalité. Un
comportement de démonstration doit être :
- identifié comme tel dans le code (`MOCK`, `DEMO`, `deterministic`) ;
- documenté dans `docs/delivery/` ;
- associé à un lot de remplacement identifié.

**13.3** Interdit : livrer une fonctionnalité dont on sait qu'elle ne peut pas être exploitée
commercialement **sans l'annoncer** dans la matrice de capacités.

**13.4** L'état actuel est documenté dans `ARENA_BASELINE.md` : le socle produit un **diaporama
typographique déterministe** avec mentions `DÉMO MOCK`, sans génération IA, sans composition
d'assets, sans publication ni facturation. **Aucune de ces limites ne doit être masquée.**

## 14. Préservation du code et des contrats existants

**14.1** **Règle par défaut : on étend, on ne remplace pas.** Toute suppression, renommage de contrat
ou changement de signature d'un port passe par un **ADR**.

**14.2** Avant d'écrire du code neuf, chercher l'existant (voir `VULULU_WORKING_RULES.md` R1).
Le socle contient déjà : 20 cas d'usage, 39 modèles Prisma, 19 migrations, 10 fichiers de routes,
23 modules de domaine, 4 ports média/orchestration réutilisables.

**14.3** Les **contrats publics** à ne pas casser sans ADR : `packages/application/src/ports.ts`,
`packages/contracts/src/`, les routes HTTP de `apps/api/src/routes/`, les 19 migrations appliquées.

**14.4** **Migrations additives uniquement** : `ADD COLUMN` nullable ou avec défaut, `CREATE TABLE`,
`CREATE INDEX`. Interdit sans ADR : `DROP`, `RENAME`, rétrécissement de type, `NOT NULL` sans défaut
sur une table peuplée.

**14.5** **Les données sont préservées.** Aucune migration destructive. Les artefacts historiques sans
`storageKey` restent lisibles (mécanisme `resolveKeyForLegacy`) : ne pas le retirer.

**14.6** Le domaine doit rester **pur** : `packages/domain` sans dépendance runtime, frontière vérifiée
par `tests/domain/purity.test.ts`. Ne jamais y importer Prisma, Fastify, Hatchet, Sharp ou un SDK.

## 15. Une mission = une branche = une PR

**15.1** Une mission livrée = **un périmètre** + **des tests ciblés** + **une PR**. Pas de PR
fourre-tout, pas de branche éternelle.

**15.2** **Contrainte de session Arena** : une session est liée à **une seule branche**. La branche
courante est celle nommée par le contexte de session. **Il est interdit d'en changer** : toute
création ou bascule de branche détacherait le travail de la session. Quand une mission demande
explicitement une branche nommée différente, **on livre sur la branche de session et on le
documente** (voir `ARENA_BASELINE.md` §7).

**15.3** Chaque PR contient : objet, périmètre, SHA de base, tests ciblés exécutés,
tableau `PASS` / `FAIL` / `NOT_RUN`, risques résiduels, rollback, et liste des `NOT_RUN` restants.

**15.4** **Aucune PR n'est ouverte sans GO** de l'humain responsable, sauf demande explicite.
**Aucun merge. Aucun push sur `main`.**

## 16. Vérité des preuves

**16.1** Trois statuts, jamais mélangés :
- `PASS` — commande **exécutée**, assertion satisfaite ;
- `FAIL` — commande **exécutée**, assertion **contredite** ;
- `NOT_RUN` — commande **non exécutée**, avec la cause nommée.

**16.2** Interdit, sans exception :
- déclarer `PASS` un test non exécuté ;
- présenter un `MOCK` comme opérationnel ;
- convertir un `NOT_RUN` en `PASS` par raisonnement, ancienneté ou « ça marchait avant » ;
- écrire « CI verte » sans run réel ;
- masquer un échec par un `skip`, un `continue-on-error` ou une variable d'environnement.

**16.3** Un `FAIL` d'origine **environnementale** (binaire ou service absent) doit être déclaré
`NOT_RUN` **avec sa cause vérifiée**, et non compté comme un `PASS`. La distinction
`FAIL réel` / `NOT_RUN environnemental` est **obligatoire** dans chaque rapport.

**16.4** Toute preuve importante est conservée dans `docs/delivery/` : commande exacte, résultat,
date, SHA. Un rapport sans commande reproductible n'est pas une preuve.

## 17. Environnement d'exécution (sandbox Arena)

**17.1** **Aucune connexion au poste de l'utilisateur, à Coolify, à un runner CI, ni à une base de
production.** La sandbox est isolée et ne doit pas tenter de l'être moins.

**17.2** **PostgreSQL n'est jamais remplacé par SQLite.** Le schéma est `provider = "postgresql"` et
le reste. Si PostgreSQL est indisponible, les contrôles concernés sont `NOT_RUN` et une **recette
PostgreSQL reproductible** est fournie (`scripts/arena/pg16-local.sh`).

**17.3** Bases autorisées : `vululu_v1_00_test` sur `127.0.0.1:55432`, ou une base jetable locale.
`envPolicy.ts` refuse une base non locale sans `ALLOW_NON_LOCAL_DATABASE=1` : **ne jamais contourner
ce garde-fou**.

**17.4** Les binaires manquants s'obtiennent par des moyens vérifiables et hors dépôt
(`scripts/arena/bootstrap-media-tools.sh`). **On ne commite aucun binaire.** Les installations vont
dans `$HOME`, jamais dans le dépôt.

**17.5** Un outil déclaré disponible doit être **prouvé fonctionnel**, pas seulement présent
(`ffmpeg -version` ne suffit pas : on encode réellement, voir le smoke test du script).

## 18. Secret et jeton

**18.1** Aucun secret, jeton, clé, certificat ou `.env` dans le dépôt. `S3_ACCESS_KEY_ID`,
`HATCHET_CLIENT_TOKEN`, `SESSION_SECRET`, `POSTIZ_API_KEY`, clés IA : **placeholders uniquement**
dans `.env.example`.

**18.2** Aucune valeur secrète dans une sortie de commande, un log, un rapport, une PR ou un message.
`gh auth status` s'affiche **masqué** : ne jamais forcer son affichage brut.

**18.3** Les identifiants d'authentification GitHub sont fournis par la plateforme : on ne les
demande jamais à l'humain et on ne les écrit nulle part.

## 19. Coûts et effets externes

**19.1** **Interdits sans autorisation écrite explicite** (plafond en cents + durée) :
appel IA payant, TTS, génération vidéo, stockage cloud, Postiz réel, achat, abonnement, essai gratuit
qui expire.

**19.2** **Aucune publication externe** : réseau social, Postiz, déploiement public. Le dépôt est
explicitement conçu pour ne pas pouvoir le faire par accident (`PostizMockAdapter`, `externalId: null`) :
**ne pas dégrader cette propriété**.

**19.3** Le premier branchement d'un fournisseur facturé est un **point de bascule** : ADR + budget
dur + autorisation écrite **avant** la première ligne de code.

## 20. Git, push et déploiement — interdits

**20.1** **Interdit sans GO explicite et nominatif :**
- `git push` vers `main` / `origin/main` ;
- merge de PR vers `main` ;
- tout déploiement (Coolify, staging, production) ;
- toute publication externe.

**20.2** **Interdit en absolu, même avec GO** : `git push --force`, réécriture d'historique,
suppression de branche distante, suppression de commit.

**20.3** Le push est autorisé **uniquement** vers la branche de session courante
(`git push origin <branche-de-session>`).

**20.4** L'historique local ne contient qu'**un commit** (voir `ARENA_BASELINE.md`) : ne pas tenter
de le reconstruire, et justifier tout état par le **code présent** et des **commandes rejouées**.

## 21. CI externe non obligatoire

**21.1** La **vérité de preuve est locale**. GitHub Actions n'est pas un prérequis : `ci.yml`
n'a **jamais** été exécuté.

**21.2** On ne crée pas de nouvelle CI, on ne modifie pas `ci.yml` dans un lot fonctionnel, on
n'introduit aucune dépendance à un service CI payant.

**21.3** Les 4 jobs de `ci.yml` sont reproductibles en local ; c'est cette reproduction qui constitue
la preuve, et son résultat qui est consigné dans `docs/delivery/`.

## 22. Definition of Done — complément Arena

Un lot n'est terminé que si, **en plus** de la section 10 :

- [ ] les commandes exécutées et leurs résultats sont consignés dans `docs/delivery/` ;
- [ ] la distinction `FAIL réel` / `NOT_RUN environnemental` est explicite ;
- [ ] aucun binaire, artefact ou secret n'a été ajouté au dépôt ;
- [ ] les migrations sont **additives** et les données préservées ;
- [ ] `pnpm lint` et le typecheck des paquets touchés sont verts ;
- [ ] la PR (si demandée) est unique et documentée ;
- [ ] aucune action interdite par la section 20 n'a été tentée.

## 23. Conditions d'arrêt — complément Arena

Arrêter et demander une décision, **en plus** de la section 11, si :

- la mission exige un changement de branche (conflit avec la session) ;
- la mission exige un push sur `main`, un merge ou un déploiement ;
- une preuve demandée ne peut pas être produite honnêtement ;
- la seule façon de faire avancer le lot serait d'utiliser SQLite à la place de PostgreSQL ;
- un coût ou une publication externe serait engagé sans autorisation écrite.
