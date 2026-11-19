# VULULU — RÈGLES DE TRAVAIL (Mission R00 → livraison)

- **Version** : 1.0 — 2026-11-19
- **Portée** : tout agent (humain ou IA) travaillant sur `vululu.v1`, y compris sur la branche de session `arena/c3982856-vululu-v1`.
- **Autorité** : ce document **complète** `AGENTS.md` sans le remplacer. En cas de conflit, `AGENTS.md` et les documents fondateurs priment ; le conflit doit être **signalé**, jamais tranché silencieusement.
- **Base factuelle** : `docs/delivery/VULULU_BASELINE.md`.

---

## R1 — Réutiliser l'existant avant d'écrire

**R1.1** Avant toute ligne nouvelle, chercher l'équivalent :
`grep` sur `packages/application/src/ports.ts` (1362 lignes de ports), puis `use-cases/`, puis `infrastructure/`.

**R1.2** Règle des trois refus :

| On ne fait pas | Parce que |
|---|---|
| un nouveau port | un port proche existe déjà (ex. `MediaRendererPort`, `DurableOrchestratorPort`, `CapabilityProviderPort`) |
| une nouvelle table Prisma | un des **39** modèles couvre souvent le besoin |
| un nouveau package | `domain` / `application` / `contracts` / `media` / `db` suffisent |

**R1.3** Toute réutilisation d'un composant **externe** (QeyNox, SocioPulse, bibliothèque tierce) exige :
licence vérifiée **par écrit**, compatibilité de contrat démontrée, **ADR** accepté.
La baseline (§6) établit qu'**aucun code QeyNox n'est présent** et que la décision `X-17` est **OPEN**.
Tant que cet ADR n'existe pas : **interdiction d'importer**.

**R1.4** Interdit absolu : copier-coller de code entre dépôts. Un portage, s'il est un jour autorisé,
se fait par réécriture justification-à-justification, avec le tableau de correspondance de la baseline §6.2.

---

## R2 — Développement incrémental

**R2.1** Un lot = **un** objectif vérifiable. Découpage imposé au-delà de :
- 400 lignes modifiées, **ou**
- 5 jours, **ou**
- 2 couches (ex. domaine + infra).

**R2.2** Ordre obligatoire dans un lot :
1. exigences concernées (IDs `PRD-xx`, `CDC-F-xxx`, `E00-xx`) ;
2. contrats et critères d'acceptation **écrits avant** le code ;
3. implémentation minimale ;
4. tests ;
5. **preuves** ;
6. revue du diff ;
7. mise à jour de `VULULU_DELIVERY_STATUS.md`.

**R2.3** **Aucune fonctionnalité non demandée**, même « utile ». C'est déjà la règle `AGENTS.md` §2 ; elle est
rappelée ici parce que la tentation est maximale quand un défaut P0 est identifié.
Un défaut découvert **pendant** un lot devient une **entrée de risque** ou une **story**, jamais un ajout spontané.

**R2.4** Périmètre V2 toujours interdit : Memory Bank, embeddings, apprentissage des préférences,
abonnements, crédits, marketplace, Everything LLM. **Y compris** quand la commercialisation les rendrait
« nécessaires » : dans ce cas, c'est une **décision de périmètre**, donc un **ADR**, pas un commit.

**R2.5** Chaque lot est **réversible** : le rollback est décrit dans la PR avant la fusion (migration
`down` ou procédure de restauration, feature flag, ou revert simple).

---

## R3 — Test live local après chaque modification

**R3.1** Règle : **on ne déclare jamais un lot fait sans l'avoir exécuté localement.** C'est la règle la plus
importante de ce document.

**R3.2** Boucle minimale après **chaque** modification, dans cet ordre :

```bash
pnpm lint                                    # 0 erreur, 0 warning
pnpm -r typecheck                            # 0 erreur
pnpm exec vitest run tests/domain             # 141 tests, doit rester ≥ 141 PASS
pnpm exec vitest run <tests du périmètre>    # tests ciblés
```

**R3.3** Boucle complète avant PR (dès que l'environnement C0 est disponible) :

```bash
pnpm db:generate
pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
pnpm exec prisma migrate status --schema packages/db/prisma/schema.prisma
pnpm exec vitest run                          # unitaires + intégration
pnpm build                                    # API + Next
pnpm exec playwright test e2e/ --reporter=list
```

**R3.4** **Test live applicatif** (au-delà des tests automatiques) pour tout lot touchant une route ou une page :
démarrer API (`API_PORT`) et Web, exécuter le parcours réel dans le navigateur, vérifier le rendu.
Un lot d'interface sans capture ou sans parcours vérifié n'est pas terminé.

**R3.5** Le **studio de production** exige une vérification média réelle : un PNG doit être **regardé**,
un MP4 doit être **lu**. Une assertion `status: 'PASS'` de QA ne suffit pas — la baseline §D-02 a été
établie en regardant un PNG, pas en lisant un rapport.

**R3.6** **Jamais la base de production comme base de test.** Bases autorisées : `vululu_v1_00_test`
(port `55432`) ou une base jetable. `envPolicy.ts` refuse déjà une DB non locale sans
`ALLOW_NON_LOCAL_DATABASE=1` : **ne jamais contourner ce garde-fou** pour aller plus vite.

**R3.7** Un test **n'est jamais** « vert par configuration » : on ne met pas une variable d'environnement
pour faire taire un test. On corrige ou on classe `NOT_RUN` avec la cause.

**R3.8** Trois statuts, jamais confondus — c'est la discipline `AGENTS.md` §3 :

| Statut | Signification | Exemple baseline |
|---|---|---|
| `PASS` | exécuté, assertion satisfaite | `vitest run tests/domain` → 141 PASS |
| `FAIL` | exécuté, assertion **contredite** | (à produire après C0) |
| `NOT_RUN` | **non exécutable** ici (binaire/service absent) | FFmpeg absent → `media.test.ts` |

**R3.9** `NOT_RUN` n'est **jamais** converti en `PASS` par raisonnement, ancienneté de documentation,
ou « ça marchait avant ». La baseline montre que 7 tests média sont `NOT_RUN` pour une raison purement
matérielle : ce constat doit rester visible.

---

## R4 — Sécurité dès le premier commit

**R4.1** Aucun secret dans le dépôt : clé, token, mot de passe, certificat, `.env`, identifiant privé.
`.gitignore` couvre déjà `.env*`, `*.pem`, `*.key`, `*.crt`, `secrets/`.
**`.env.example` ne contient que des placeholders** — le maintenir ainsi.

**R4.2** Ne **jamais** imprimer un secret dans une sortie de commande, un log, un rapport ou un message.
Si un secret apparaît : **arrêt immédiat**, signalement, rotation.

**R4.3** Toute route nouvelle reprend les invariants déjà en place :
- `app.authenticate` (session serveur, cookie haché) ;
- filtrage par propriétaire **en base** (`findOwned`/`*Owned`), pas en mémoire ;
- CSRF sur `POST/PATCH/PUT/DELETE` (`server.ts`, `CSRF_EXEMPT_PATHS` limité à login/activate) ;
- contrôle d'origine (`isAllowedOrigin`) ;
- rate limiting distribué (`rateLimitPreHandler`) sur tout point coûteux ;
- validation Zod depuis `@vululu/contracts`.

**R4.4** **Test IDOR obligatoire** pour toute route exposant une ressource : un utilisateur A ne doit
jamais lire/écrire une ressource de B. Non négociable.

**R4.5** Upload : conserver l'inspection **par octets** (`assetInspection.ts`), pas par extension.
Refus des formats actifs (SVG, HTML, ZIP), limite de taille et de pixels.

**R4.6** Frontières d'architecture = sécurité de conception : `packages/domain` reste **pur** (0 dépendance
runtime, vérifié par `tests/domain/purity.test.ts`), `packages/application` ne touche **ni** `fs` **ni**
`http` **ni** Prisma **ni** SDK fournisseur. Toute violation casse la testabilité et ouvre la porte aux fuites.

**R4.7** Validation des URLs sortantes (SSRF) obligatoire dès qu'un `fetch` apparaîtra — la baseline établit
qu'il n'y en a **aucun** aujourd'hui : c'est une garantie à **préserver**, pas à perdre au premier
branchement de fournisseur.

**R4.8** Journalisation : `actor_id`, `project_id`, `run_id`, `scene_id`, `provider_id`, `trace_id`,
versions, coûts, horodatage. Jamais de secret ni de contenu utilisateur brut non nécessaire.

---

## R5 — Aucune CI externe obligatoire

**R5.1** La **vérité de preuve est locale**. GitHub Actions n'est **pas** un prérequis de développement :
la baseline établit que `ci.yml` n'a **jamais tourné** et que le dépôt reste néanmoins auditable.

**R5.2** Conséquence pratique : le travail ne doit **jamais** être bloqué par l'absence de runner distant.
On exécute les **mêmes commandes** que `ci.yml` en local (elles sont toutes documentées dans le workflow).

**R5.3** On ne **crée pas** de nouvelle CI, on ne **modifie pas** `ci.yml` dans un lot fonctionnel, et on
n'introduit **aucune** dépendance à un service CI payant ou à un compte externe.

**R5.4** Le statut CI reste `NOT_RUN` jusqu'à un run distant **autorisé**. Il est **interdit** d'écrire
« CI verte » sur la base d'un run local.

**R5.5** Les gates PowerShell (`scripts/check-*.ps1`, 9 scripts) sont la référence locale. Comme `pwsh`
n'est pas garanti partout (baseline §1.2), tout lot touchant la sécurité doit fournir, en plus, une
**vérification manuelle reproductible** (grep, commande) consignée dans la PR. Une future migration vers
Node/`sh` est un **lot dédié**, pas un effet de bord.

---

## R6 — Aucune dépense réelle non autorisée

**R6.1** **Tolérance zéro** : aucun appel payant (IA, TTS, vidéo, stockage cloud, Postiz) sans
**autorisation écrite explicite** du porteur du projet, mentionnant le **plafond en cents** et la **durée**.

**R6.2** Interdits par défaut, sans autorisation :
- toute clé API réelle dans un `.env` de travail ;
- tout `fetch` vers un fournisseur facturé ;
- toute création de compte externe (OpenAI, Anthropic, Google, Postiz, S3, Hatchet Cloud) ;
- tout service managé, même en essai gratuit, et **surtout** en essai gratuit qui expire
  (facturation surprise).

**R6.3** Le socle actuel est **sain sur ce point** : zéro `fetch`, coûts `mode: 'MOCK'`, budget
`maxMockCents`. **Ne pas dégrader cette propriété.** Le premier branchement d'un fournisseur (C6 de la baseline)
est le point de bascule : il exige un ADR + une autorisation écrite **avant** la première ligne de code.

**R6.4** Tout lot qui *pourrait* générer un coût doit afficher dans la PR :
coût unitaire attendu, nombre d'appels maximum, plafond dur, et **qui coupe** en cas de dérive.

**R6.5** Budget = **arrêt dur**, pas un warning. Un dépassement silencieux est un incident, pas un détail.

**R6.6** Aucune donnée de production dans un environnement de test (cf. R3.6), et aucune donnée de test
envoyée à un fournisseur réel.

---

## R7 — Aucun push / merge / deploy de production sans GO explicite

**R7.1** Sont soumis à **GO explicite et nominatif** du porteur du projet :

| Action | Statut par défaut |
|---|---|
| `git push` vers `main` / `origin/main` | **INTERDIT** sans GO |
| fusion de PR vers `main` | **INTERDIT** sans GO |
| `git push --force` (toute branche) | **INTERDIT — absolu**, même avec GO |
| déploiement Coolify / staging / production | **INTERDIT** sans GO |
| publication Postiz ou tout réseau social | **INTERDIT** sans GO |
| application de migration sur une base non jetable | **INTERDIT** sans GO |
| achat / souscription / activation de clé payante | **INTERDIT** sans GO |

**R7.2** Le travail de session reste **sur la branche de session** (`arena/c3982856-vululu-v1`).
On ne crée pas, ne renomme pas et n'utilise pas d'autre branche. Les modifications sont enregistrées
automatiquement ; il n'est **pas nécessaire** de committer ou pusher pour les préserver.

**R7.3** « GO » signifie : une phrase explicite du porteur du projet, désignant l'action et la cible.
Une absence de réponse n'est **pas** un GO. Une validation antérieure ne couvre **pas** une action ultérieure.

**R7.4** Avant toute demande de GO, la PR doit contenir : objet, SHA de base, tableau
PASS/FAIL/NOT_RUN, risques résiduels, rollback, et la liste des actions encore `NOT_RUN`.

**R7.5** Un GO de fusion n'est **pas** un GO de déploiement. Les deux sont distincts et jamais groupés.

**R7.6** En cas de doute sur une action destructive (suppression, réécriture, migration irréversible) :
**s'arrêter et demander**. `AGENTS.md` §11 liste les conditions d'arrêt — elles sont toutes applicables.

---

## R8 — Documents et décisions

**R8.1** Documents **verbatim** (jamais édités) : `docs/01_PRD_V1.md`, `docs/02_CAHIER_DES_CHARGES_V1.md`,
`docs/03_ARCHITECTURE_V1.md`, `docs/10_ACCEPTANCE_TESTS.md`, `docs/11_BACKLOG.md`,
`docs/PROMPT_DEEPSEEK_HARNESS.md`, `docs/v2/`, `docs/source/`.

**R8.2** Documents **de preuve datée** (jamais corrigés, seulement supersédés) : `docs/certification/`,
`docs/reviews/`, `docs/review/`, `docs/reports/`, `docs/releases/`.

**R8.3** Toute décision structurante → **ADR** dans `docs/adr/`. Un ADR accepté n'est pas modifié :
on en crée un qui le remplace.

**R8.4** Langue : documentation en **français**, identifiants de code en **anglais**. Dates ISO 8601.
Référencer les IDs `PRD-xx`, `CDC-F-xxx`, `CDC-N-xxx`, `E00-xx`.

**R8.5** Ne pas ajouter de nouvelle structure documentaire sans nécessité : `docs/delivery/` (créé par R00)
est le point d'entrée de l'exécution et ne doit contenir que ces trois documents plus, le cas échéant,
les comptes rendus de lot.

---

## R9 — Git

**R9.1** Commits courts, au présent, préfixés : `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `adr`.

**R9.2** Un commit = un sujet relisible et réversible. Jamais de fichier généré, de secret, de dépendance lourde.

**R9.3** Avant commit : `git diff --check`, revue du diff, contrôle de secrets.
Si `pwsh` est disponible : `pwsh -NoProfile -File scripts/check-secrets.ps1`.
Sinon : contrôle manuel documenté (grep sur motifs de clés, vérification que rien de sensible n'apparaît).

**R9.4** **Jamais** de force push, de réécriture d'une branche partagée, de suppression de commit.

**R9.5** Rappel de la baseline §1.1 : l'historique local ne contient qu'**un** commit.
Conséquence pratique — **ne pas s'appuyer sur l'historique** pour justifier ou expliquer un état :
justifier par le **code présent** et par les **commandes rejouées**. Et **ne pas** tenter de
« reconstruire » un historique : ce serait une réécriture, donc interdit.

---

## R10 — Conditions d'arrêt immédiat

L'agent **s'arrête et demande une décision** si :

1. une spécification est contradictoire ou manquante ;
2. une action destructive est nécessaire (suppression, migration irréversible, réécriture) ;
3. un secret est détecté ;
4. une fonctionnalité **V2** est demandée, ou la commercialisation l'imposerait ;
5. un **coût fournisseur** devrait être engagé sans autorisation écrite ;
6. l'environnement ne permet pas d'exécuter un test **obligatoire** (et ce test ne peut pas être
   raisonnablement classé `NOT_RUN` avec une cause externe vérifiée) ;
7. une preuve demandée ne peut pas être produite honnêtement ;
8. le périmètre d'un lot impose de **réécrire** le socle au lieu de l'étendre.

**Dans tous ces cas : signaler, ne pas improviser.**

---

## R11 — Definition of Done (rappel opérationnel)

Un lot est terminé **si et seulement si** :

- [ ] le périmètre demandé est couvert, **et rien de plus** ;
- [ ] `pnpm lint` → 0/0 ;
- [ ] `pnpm -r typecheck` → 0 erreur (hors dérivées environnementales documentées) ;
- [ ] tests ciblés verts, et `tests/domain` ≥ 141 PASS ;
- [ ] parcours **live** vérifié si route/page touchée ;
- [ ] vérification média réelle si production touchée (PNG regardé, MP4 lu) ;
- [ ] test IDOR si ressource exposée ;
- [ ] diff relu, **aucun secret**, aucun fichier généré ;
- [ ] preuves PASS / FAIL / NOT_RUN consignées avec les commandes exactes ;
- [ ] risques résiduels écrits (aucun lot n'est exempt de risques) ;
- [ ] rollback décrit ;
- [ ] `VULULU_DELIVERY_STATUS.md` mis à jour ;
- [ ] ADR si décision structurante.

Un lot dont une case est vide **n'est pas terminé** — il est `IN_PROGRESS`, même si le code fonctionne.

---

## R12 — Ce que ces règles interdisent explicitement pour la suite

Pour éviter toute ambiguïté après R00 :

1. démarrer un lot **fonctionnel** (IA, composition d'assets, monétisation) avant que C0–C2 de la baseline ne soient verts ;
2. refondre l'architecture sous prétexte qu'elle est « mock » — les frontières sont saines et testées ;
3. importer QeyNox ou tout code externe sans licence vérifiée + ADR ;
4. présenter un résultat `MOCK` comme réel, dans le code, l'UI, la doc ou un message ;
5. rejouer un test `NOT_RUN` en le déclarant `PASS` ;
6. pousser, fusionner ou déployer sur la base d'une validation implicite ;
7. engager une dépense fournisseur, même minime, sans autorisation écrite.
