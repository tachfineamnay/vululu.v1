# Vululu AI — Contrat de finition du produit (programme BUILD-FIRST P00–P13)

- **Date** : 2026-11-20 (P00)
- **Branche d'intégration** : `campaign/vululu-completion`
- **Base** : `main` @ `f5d515b` (merge PR #24, 2026-11-20)
- **Statut du document** : opérationnel pour toute la campagne. Il prime sur toute instruction contraire d'un skill, d'un README ou d'un document d'état daté. Il ne modifie ni les documents importés VERBATIM (PRD, CDC, architecture, backlog, prompt, note V2) ni les ADR acceptés.
- **Documents liés** : [inventaire courant](VULULU_FEATURE_INVENTORY.md) · [carte des lots P01–P11](VULULU_COMPLETION_PLAN.md) · `AGENTS.md` Partie C · `docs/product/VULULU_EXPERIENCE_VISION_2026-11-20.md` (révisée P00).

## 1. But

Terminer le produit Vululu AI — studio créatif et marketing augmenté par l'IA pour des entrepreneurs non-designers — sur **le code existant**, en construisant par lots successifs jusqu'à un parcours complet et utilisable, puis en vérifiant et en décidant la sortie (P12–P13). Ce contrat fixe les règles qui rendent cette campagne rapide **sans jamais produire de fausse preuve**.

## 2. Vision non négociable

Le parcours cible, dans cet ordre exact :

```text
OBJECTIF → CANAL → FORMAT → ASSETS UTILISATEUR → BRAINSTORMING IA
→ DIRECTIONS ARTISTIQUES → CHOIX HUMAIN → CRÉATION ÉDITABLE
→ REVUE → APPROBATION → EXPORT / PUBLICATION → RÉSULTATS
```

Règles produit qui en découlent :

1. **Les assets de l'utilisateur sont disponibles avant le brainstorming principal.** L'IA ne propose pas d'angles sans savoir quelles matières (photos, logo, couleurs, offres, références) sont autorisées.
2. **L'IA simplifie l'expérience ; elle ne multiplie pas les écrans.** Une question ou une décision principale à la fois quand c'est utile ; les étapes simples peuvent partager un écran ; l'interface n'expose pas la complexité technique.
3. **Tout reste éditable en brouillon versionné.** Une proposition, une direction, une scène ou un rendu peut être refusé ou retravaillé sans perdre les versions antérieures ; rien n'est téléchargé, payé ou publié par simple proposition.
4. **Le contrôle humain est réel** : choisir, corriger, refuser, comparer, approuver une version exacte (version + checksum).
5. **Aucune fausse capacité** : un fournisseur MOCK, non activé ou non vérifié n'est jamais présenté comme opérationnel.
6. **Le mode expert ne disparaît pas** : l'édition directe complète le parcours guidé, elle ne le remplace pas.

## 3. Point de départ (P00)

- HEAD `f5d515b`, 34 migrations, 66 modèles Prisma, 22 fichiers de routes API, 32 pages web, 26 specs Playwright, 85 fichiers Vitest.
- Les lots C02–C13 et F01–F07 ont livré : calendrier éditorial, compositions/versions, formats multiples, assistant Vertex (derrière budget), génération média Replicate/Runway (derrière flags), publication Postiz (derrière activation), facturation Stripe (gelée), comptes clients, résultats, rendu durable et **bêta gratuite** (BETA01).
- **Bêta gratuite active par défaut** : `VULULU_BETA_MODE` absent = `1`, aucun paiement client possible, commerce gelé, fournisseurs non activés.
- Aucun déploiement public, aucun fournisseur payant activé, aucune publication réelle n'a été effectuée ni n'est autorisée par ce contrat.
- Les documents d'état datés (ARENA_BASELINE, VULULU_BASELINE, VULULU_DELIVERY_STATUS, certification, rapports C/F) restent des **preuves historiques** ; l'état courant est l'inventaire.

## 4. Règles de construction

1. **On étend, on ne réécrit pas.** Next.js, Fastify, TypeScript, PostgreSQL, Prisma, Hatchet, Sharp, FFmpeg, Postiz et les intégrations existantes sont conservés. Le monolithe modulaire et ses frontières (Domain → Application → Infrastructure → API) restent.
2. **Invariants préservés à chaque lot** : isolation locataire et RBAC serveur, budgets et réservations, approbations d'une version exacte, immutabilité des artefacts (checksum + provenance), audit, idempotence, secrets côté serveur.
3. **Offres commerciales inchangées** ; paiements désactivés pendant la bêta gratuite ; aucune conversion de mode, aucun tarif inventé.
4. **Aucune publication externe, aucun appel fournisseur payant, aucun déploiement de production** sans autorisation humaine explicite et séparée (écrite, avec plafond et durée pour un coût).
5. **Infrastructure locale ou auto-hébergée uniquement** ; aucune dépendance à une CI externe pour prouver quoi que ce soit.
6. **Migrations additives uniquement** : `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN` nullable ou avec défaut. Aucun `DROP`, `RENAME`, `NOT NULL` sans défaut sur une table peuplée, aucune réécriture d'une migration appliquée, aucune perte de données.
7. **Aucune nouvelle dépendance** sans nécessité démontrée ; d'abord réutiliser l'existant (discipline `ponytail`).
8. **Pas de refonte d'architecture, pas de nouveau service, pas de microservices, pas de duplications de concepts existants** (Campaign, Project, BrandContext/ConfirmedOffer, BrandAsset, Brief, AssistantTurn, CreativeRevision/CreativeSpec, ContentItem, PublicationRequest, ResultEvent, ExecutionAccount/ToolBroker).
9. **Une seule branche d'intégration** pour toute la campagne ; `main` n'est pas touchée pendant P00–P11.
10. **Un lot = un commit** sur la branche d'intégration, relisible et réversible.

## 5. Interdits pendant P00–P11

- Exécuter la suite de tests complète, Playwright, pytest, le lint, le typecheck, le build complet, la certification ou les gates de release. Ces vérifications appartiennent à **P12–P13**.
- Déclarer un `PASS` : le mot est réservé aux commandes réellement exécutées en P12–P13. En P00–P11, on écrit `BUILD_UNVERIFIED`, `NOT_RUN`, `MOCK` ou `PROVIDER_DEPENDENT`.
- Push, merge, déploiement, publication sociale, appel IA/média payant, activation Postiz/Stripe, achat, compte externe.
- Migration destructive, suppression de code ou de données existantes, réécriture d'historique Git, commit de secrets ou de binaires.
- Ajouter une fonctionnalité V2 (mémoire sémantique, préférences apprises, marketplace…).
- Présenter une vérification manuelle de développement comme une certification.

## 6. Statuts de preuve de la campagne

| Statut | Sens |
|---|---|
| `BUILD_UNVERIFIED` | Code écrit et committé, non vérifié. Statut par défaut de tout lot P01–P11. |
| `BUILD_VERIFIED` | Vérifié en P12 avec une preuve rejouée (commande, date, HEAD, résultat réel). |
| `NOT_RUN` | Étape non exécutée, cause nommée. Jamais converti en succès. |
| `MOCK` | Adaptateur déterministe/simulé ; ne prouve aucune capacité fournisseur. |
| `PROVIDER_DEPENDENT` | Code complet mais opérationnel uniquement avec un fournisseur/flag configuré et autorisé ; l'appel réel n'est pas vérifié. |

Les vérifications manuelles minimales de développement (ouvrir une page, suivre un parcours avec la pile locale quand elle est disponible) sont autorisées, datées et décrites comme telles ; elles ne valent jamais certification et ne s'écrivent pas `PASS`.

## 7. Méthode d'un lot P01–P11

1. Lire ce contrat, l'inventaire et la fiche du lot dans `VULULU_COMPLETION_PLAN.md`.
2. Vérifier dans le code les points de départ indiqués ; ne pas recréer un concept existant.
3. Implémenter uniquement le périmètre du lot, avec migration additive si nécessaire et respect des invariants.
4. Vérification manuelle minimale si l'environnement le permet ; sinon le lot reste `BUILD_UNVERIFIED` sans autre prétention.
5. Mettre à jour l'inventaire (statut + preuve fichier) et la fiche du lot (fait / reste).
6. Commit unique : `feat(pXX): <titre> [BUILD_UNVERIFIED]` + description du périmètre, des limites connues et du rollback.
7. Ne pas enchaîner deux lots dans un même commit ; ne pas mélanger documentation de campagne et code d'un autre lot.

## 8. Definition of Done d'un lot BUILD_UNVERIFIED

- [ ] Périmètre du lot couvert, rien au-delà ; aucun concept dupliqué.
- [ ] Invariants préservés (RBAC/isolation, budgets, approbations, immutabilité, audit) ou explicitement hors périmètre du lot.
- [ ] Migration additive si nécessaire ; aucune donnée existante modifiée ou supprimée.
- [ ] Parcours existants non cassés par construction (contrats et routes conservés).
- [ ] Aucun secret, aucun binaire, aucun fichier runtime commité.
- [ ] Inventaire et fiche de lot à jour ; limites connues écrites.
- [ ] Commit `BUILD_UNVERIFIED` réversible (revert du commit ; migration laissée en place).
- [ ] Aucune action interdite (§5) tentée.

## 9. Programme P00–P13

| Lot | Objet | Statut attendu |
|---|---|---|
| **P00** | Préparation : contrat, inventaire, correction des consignes, branche d'intégration | **DONE** (ce commit) |
| **P01** | Parcours campagne : objectif → canal → format | `BUILD_UNVERIFIED` |
| **P02** | Assets d'abord : prérequis et confirmation avant brainstorming | `BUILD_UNVERIFIED` |
| **P03** | Brainstorming ancré dans l'identité et les assets confirmés | `BUILD_UNVERIFIED` |
| **P04** | Directions artistiques multiples et comparaison | `BUILD_UNVERIFIED` |
| **P05** | Choix humain de la direction (choisir / refuser / variation) | `BUILD_UNVERIFIED` |
| **P06** | Création éditable depuis la direction choisie | `BUILD_UNVERIFIED` |
| **P07** | Revue puis approbation exacte (version + checksum) | `BUILD_UNVERIFIED` |
| **P08** | Export et publication (désactivée par défaut) | `BUILD_UNVERIFIED` |
| **P09** | Boucle résultats → prochaine création | `BUILD_UNVERIFIED` |
| **P10** | Simplification UX et cohésion du parcours | `BUILD_UNVERIFIED` |
| **P11** | Durcissement, observabilité, préparation P12 | `BUILD_UNVERIFIED` |
| **P12** | Vérification finale : gates réels, tests ciblés puis suite, E2E, preuves rejouées, classement `FAIL réel` / `NOT_RUN environnemental` | `BUILD_VERIFIED` ou échecs qualifiés |
| **P13** | Décision de sortie : GO/NO-GO staging et activation ; toute activation exige une autorisation humaine explicite et séparée | décision humaine |

Le détail des lots P01–P11 (périmètre, points de départ fichier par fichier, critères d'acceptation, dépendances) est maintenu dans `VULULU_COMPLETION_PLAN.md`, qui peut être précisé lot après lot sans modifier les règles de ce contrat.

## 10. Git, branche et rollback

- Branche unique : `campaign/vululu-completion`, créée depuis `main` @ `f5d515b`. Aucun push, merge ou rebase de branche partagée sans GO explicite.
- Un commit par lot, message préfixé `feat(pXX):` et étiquette `[BUILD_UNVERIFIED]`. Les corrections d'un lot restent dans son commit autant que possible ; sinon commits `fix(pXX):`.
- Rollback d'un lot = `git revert` de son commit. Les tables/index ajoutés restent en place et sont inertes ; ne jamais écrire de migration descendante destructive.
- Aucune réécriture d'historique, aucun `push --force`, aucune suppression de branche distante.

## 11. Relation aux documents existants

- `AGENTS.md` parties A et B restent en vigueur ; la partie C et ce contrat précisent la campagne. En cas de conflit, la règle la plus restrictive s'applique.
- PRD, CDC, architecture, backlog, prompt maître et note V2 restent VERBATIM. Une évolution de spécification crée un nouveau document daté ou un ADR.
- Une décision structurante (contrat public, frontière de couche, modèle de données partagé, activation fournisseur) exige un **ADR** référencé dans le commit du lot ; elle ne se prend pas silencieusement.
- Tout écart constaté entre un document et le code est **signalé** dans l'inventaire ou le commit, jamais corrigé en silence dans un document historique.

## 12. Révision de ce contrat

Ce contrat ne peut être modifié que par une révision datée et explicite, autorisée par le porteur humain de la campagne, et référencée dans le commit. Une révision ne peut pas affaiblir les règles des parties A et B d'`AGENTS.md` ni les invariants du §4.
