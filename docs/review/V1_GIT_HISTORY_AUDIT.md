# V1 — Audit de l'historique Git (Phase A)

- **Date de l'audit** : 2026-10-25T13:08Z (fenêtre 2026-10-25T12:24Z → 2026-10-25T13:08Z)
- **Agent** : git-auditor (équipe certification V1-01-H — revue Git, sécurité, CI, verdict)
- **Worktree audité** : `C:\Users\hp\Desktop\vululu-ai-v1-00`
- **Branche auditée** : `v1-01-g-architecture-certification`
- **HEAD audité** : `bcf2c582a7e0277b193de0dc78dd766f319c2e5c`
- **Base PR** : `main` = `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50`
- **Mode** : lecture seule sur Git et sur le code (aucun push, add, commit, checkout, reset, stash, merge, rebase, tag, worktree add/remove exécuté).
- **Outils** : git 2.48.1.windows.1, pwsh 7, Node 24.
- **Livrable complémentaire** : [V1_DIFF_REVIEW.md](V1_DIFF_REVIEW.md) (Phase C — diff et périmètre de la PR).

> **Verdict Phase A : historique PUBLIABLE — aucune réécriture nécessaire, PR fast-forward possible.**
> Aucun blocage Git. Trois branches locales abandonnées (non poussées) et des modifications non commitées apparues en fin d'audit (agents parallèles) sont signalées sans impact sur la PR.

---

## 1. Dépôt, remote et absence de credentials

Commandes :

```powershell
git remote -v
git config --get-regexp "^remote\."
git ls-remote --heads origin
```

Résultats :

| Élément | Valeur |
|---|---|
| `origin` (fetch) | `https://github.com/tachfineamnay/vululu.v1.git` |
| `origin` (push) | `https://github.com/tachfineamnay/vululu.v1.git` |
| Userinfo / token dans l'URL | **aucun** (URL HTTPS nue, pas de `user:token@`) |
| `remote.origin.url` | `https://github.com/tachfineamnay/vululu.v1.git` |
| `remote.origin.fetch` | `+refs/heads/*:refs/remotes/origin/*` |
| `git ls-remote --heads origin` | `69c6549…	refs/heads/main` (une seule ref ; commande réussie sans prompt d'authentification) |

- Les helpers d'identification constatés (Git Credential Manager, cache, GitHub CLI) sont configurés **hors du dépôt** (configuration utilisateur de la machine) ; aucun credential n'est stocké dans `.git/config` ni dans l'URL.
- **Aucun fichier de credentials suivi** : seul `.env.example` est versionné (valeurs vides ou placeholders `change-me`), le `.env` local est ignoré par `.gitignore:6` et n'a jamais été affiché dans cet audit.

## 2. Branche courante, HEAD et propreté du dépôt

Commandes :

```powershell
git branch --show-current
git rev-parse HEAD
git status --porcelain=v1
git rev-parse --abbrev-ref --symbolic-full-name "@{u}"
```

Résultats :

| Élément | Valeur |
|---|---|
| Branche courante | `v1-01-g-architecture-certification` |
| HEAD (SHA complet) | `bcf2c582a7e0277b193de0dc78dd766f319c2e5c` |
| Upstream de la branche | **aucun** (sortie d'erreur « no upstream configured ») |
| `git status --porcelain` (ouverture, 2026-10-25T12:25Z) | **vide** → dépôt propre, aucun fichier non suivi |

### 2.1 Note de clôture — modifications concurrentes hors HEAD (non imputables à la PR)

Le dépôt était propre à l'ouverture. En fin d'audit (snapshot 2026-10-25T13:08Z), d'**autres agents de l'équipe travaillant en parallèle dans le même worktree** avaient introduit des changements **non commités**, qui ne font pas partie de HEAD ni de la PR :

```
 M .github/workflows/ci.yml
 M apps/web/next-env.d.ts
 M scripts/check-secrets.ps1
?? scripts/check-architecture-boundaries.ps1
?? scripts/check-migrations.ps1
?? scripts/check-tracked-files.ps1
```

- Snapshot complémentaire 2026-10-25T13:15Z : `package.json` est également modifié, et `docs/review/V1_PRE_PUSH_SECURITY_AUDIT.md` (autre agent) a été ajouté. Ces éléments restent **hors HEAD**.
- Ces fichiers sont **hors périmètre de la branche** : le présent audit et le diff de la PR portent exclusivement sur HEAD `bcf2c58`.
- `apps/web/next-env.d.ts` modifié est un fichier généré par Next.js (exécution locale) : ne pas le committer par accident.
- **Recommandation au Lead** : avant le commit de certification final, vérifier que ces modifications sont soit exclues, soit revues et committées séparément ; ne pas les mélanger au contenu certifié. (Aucune action Git n'a été faite par l'auditeur.)

## 3. Worktrees

Commande : `git worktree list --porcelain`

| Worktree | HEAD | Branche | État |
|---|---|---|---|
| `C:/Users/hp/Desktop/vululu Ai` | `ddda015e641d679c5d78e271da0ce429ad2a1195` | `v0-fullstack-sprint` | non verrouillé |
| `C:/Users/hp/Desktop/vululu-ai-v1-00` | `bcf2c582a7e0277b193de0dc78dd766f319c2e5c` | `v1-01-g-architecture-certification` | non verrouillé (worktree de certification) |

Justification : deux worktrees seulement, sur le **même dépôt** (`.git` partagé). Le worktree `vululu Ai` conserve la verticale V0 (`ddda015` = commit de clôture V0, **ancêtre de HEAD**) pour la démonstration/non-régression V0 ; le worktree `vululu-ai-v1-00` porte la certification. Le répertoire de session par défaut (`vululu Ai`) n'a pas été utilisé pour l'audit (aucune commande Git d'écriture, aucune modification).

## 4. main, merge-base, fast-forward et linéarité

Commandes :

```powershell
git rev-parse main origin/main HEAD
git merge-base main HEAD
git merge-base --is-ancestor main HEAD; $LASTEXITCODE
git rev-list --count main..HEAD
git rev-list --count HEAD..main
git rev-list --merges main..HEAD
git rev-list --merges HEAD --count
git rev-list --left-right --count main...HEAD
```

Résultats :

| Contrôle | Résultat |
|---|---|
| `main` locale | `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50` |
| `origin/main` | `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50` (identique) |
| Merge-base `main` / HEAD | `69c6549` (= main) |
| `main` est ancêtre de HEAD | **OUI** (exit code 0) |
| Commits HEAD non dans main | **37** |
| Commits main non dans HEAD | **0** |
| Commits de merge dans `main..HEAD` | **0** (aucun) |
| Commits de merge dans tout l'historique de HEAD | **0** |
| Divergence `main...HEAD` | `0 37` (aucun commit côté main) |

**Conclusion** : l'historique est **strictement linéaire** (aucun merge, aucune réécriture) ; `main` étant ancêtre direct de HEAD, la PR est **fast-forward possible**, sans conflit attendu. Total : 39 commits atteignables depuis HEAD (2 sur main + 37 de la branche).

## 5. Inventaire des 37 commits `main..HEAD`

Commande : `git log --reverse --format="%h|%H|%aI|%s" main..HEAD` (dates ISO 8601 UTC).

| # | SHA court | Date | Type | Lot | Sujet |
|---:|---|---|---|---|---|
| 1 | `3a85382` | 2026-10-21T17:25:39Z | docs | fondations | add Mission 01 corpus audit and decision register |
| 2 | `7fae726` | 2026-10-21T17:25:39Z | docs | fondations | add traceability matrix and acceptance tests |
| 3 | `b2a17ec` | 2026-10-21T17:25:40Z | docs | fondations | add UX-0 and V2 roadmap addenda |
| 4 | `0bb1bb6` | 2026-10-21T17:26:39Z | docs | fondations | document source versions in traceability matrix |
| 5 | `0693b8f` | 2026-10-23T07:57:01Z | feat | V0 | build fullstack vululu studio vertical slice |
| 6 | `f2a7e10` | 2026-10-23T08:01:36Z | docs | V0 | add certification progress, runbook and verification |
| 7 | `3a6d54f` | 2026-10-23T08:36:13Z | feat | V0 | support configurable scene durations and approval invalidation |
| 8 | `6683632` | 2026-10-23T08:45:02Z | fix | V0 | allow verify-v0 explicit project target |
| 9 | `4bcbb87` | 2026-10-23T08:45:02Z | docs | V0 | record duration scenarios and independent QA recette |
| 10 | `de92e24` | 2026-10-23T09:20:49Z | fix | V0 | harden audit findings and add brief revision history |
| 11 | `5d2042a` | 2026-10-23T09:24:03Z | test | V0 | assert stable scene and character IDs |
| 12 | `ddda015` | 2026-10-23T09:30:39Z | docs | V0 (clôture) | add V0 final audit and V1 implementation baseline |
| 13 | `a7f4b8d` | 2026-10-23T13:47:25Z | feat | V1-00 | add persistent sessions, RBAC, domain core and ports |
| 14 | `008e136` | 2026-10-23T14:30:04Z | chore | V1-00 | add lint, CI and acceptance tooling |
| 15 | `83abb8e` | 2026-10-23T14:30:04Z | docs | V1-00 | add progress, architecture, security and acceptance reports |
| 16 | `5dffb0e` | 2026-10-23T16:33:43Z | feat | A | migrate routes to use cases and version production snapshots |
| 17 | `165aa2d` | 2026-10-23T16:33:44Z | docs | A | add migration, snapshot and test reports |
| 18 | `b1824c1` | 2026-10-23T17:52:02Z | refactor | A1 | remove legacy workflow and enforce atomic use cases |
| 19 | `429a93e` | 2026-10-23T18:05:13Z | docs | A1 | add consolidation, transactions, artifact and test reports |
| 20 | `759c9a3` | 2026-10-23T18:41:19Z | feat | B | add agentic capability registry, routing and fallback |
| 21 | `5827a19` | 2026-10-23T18:41:20Z | docs | B | add agentic capabilities report and evidence |
| 22 | `fea95ed` | 2026-10-24T09:12:04Z | feat | C | add Hatchet durable workflow POC and harness |
| 23 | `85cd3b0` | 2026-10-24T09:16:17Z | docs | C | document Hatchet POC durability evidence and verdict |
| 24 | `acf6c54` | 2026-10-24T09:21:44Z | docs | C (ADR) | record conditional Hatchet POC durability decision (ADR-0009) |
| 25 | `87eb18d` | 2026-10-24T09:26:39Z | docs | C | record V1 non-regression evidence |
| 26 | `1110240` | 2026-10-24T19:33:07Z | feat | D | integrate durable Hatchet orchestration, outbox and state machine |
| 27 | `2e27f6c` | 2026-10-24T19:39:23Z | docs | D | document durable orchestration, evidence and conditional verdict |
| 28 | `88921e7` | 2026-10-24T19:39:56Z | chore | D | align isolated POC lint and final references |
| 29 | `4595d03` | 2026-10-25T07:42:43Z | feat | E | add provider-independent artifact storage, finalization and provenance |
| 30 | `addbe70` | 2026-10-25T07:47:24Z | docs | E | document interchangeable artifact storage, recovery and evidence |
| 31 | `d2446ca` | 2026-10-25T07:47:59Z | docs | E | record final commit references and validation status |
| 32 | `c4b5ab2` | 2026-10-25T09:51:21Z | feat | F | harden sessions, rate limits, tracing, worker supervision and ops |
| 33 | `f31f259` | 2026-10-25T10:02:15Z | docs | F | document security hardening, observability and operational evidence |
| 34 | `11e11e5` | 2026-10-25T10:02:51Z | docs | F | record docs checkpoint reference |
| 35 | `0e79c08` | 2026-10-25T11:17:19Z | fix | G | close structural gaps in dispatch, storage access, media ranges and ops |
| 36 | `4fbce9d` | 2026-10-25T11:25:15Z | docs | G | certify architecture, invariants and deployment readiness |
| 37 | `bcf2c58` | 2026-10-25T11:25:37Z | docs | G | record certification checkpoint reference (= HEAD) |

### 5.1 Synthèse par lot

| Lot | Commits | Objet |
|---|---:|---|
| Fondations (Mission 01) | 4 | corpus audit, registre de décision, matrice de traçabilité, catalogue d'acceptation, addendas UX-0/V2 |
| V0 | 8 | verticale fullstack V0, durées/invalidation d'approbation, durcissement, IDs stables, clôture V0 |
| V1-00 | 3 | sessions persistantes, RBAC, Domain Core, ports, outillage lint/CI |
| A | 2 | migration des routes vers use cases, snapshots versionnés |
| A1 | 2 | consolidation applicative, suppression du workflow legacy, atomicité |
| B | 2 | registre de capacités agentiques, routeur, fallback |
| C | 4 (dont ADR-0009) | POC Hatchet durable, harnais, preuves, non-régression |
| D | 3 | orchestration durable Outbox/Hatchet, machine à états, preuves |
| E | 3 | stockage d'artefacts interchangeable, finalisation, provenance |
| F | 3 | durcissement sécurité, rate limits, tracing, supervision worker, ops |
| G | 3 | corrections structurales, certification architecture/déploiement |

### 5.2 Contrôles d'anomalies sur les commits

- **Aucun commit merge** (0).
- **Aucun commit vide** (vérifié par parsing des numstat par commit : 37 commits / 37 entrées non vides).
- **Aucun commit WIP / tmp / revert / fixup / debug** : recherche insensible à la casse sur les sujets → 0 résultat ; aucun « commit hors sujet » identifié (chaque commit correspond à son lot).
- **Préfixes conventionnels respectés** : `feat`, `fix`, `docs`, `chore`, `test`, `refactor` sur les 37 sujets.
- **Identité unique** : auteur et committer = `tachfineamnay <tachfine.amnay@gmail.com>` sur les 37 commits (couples auteur/committer distincts : 1).
- **Dates cohérentes/chronologiques** : 2026-10-21T17:25Z → 2026-10-25T11:25Z, ordre croissant, toutes postérieures à main (2026-10-21T16:12Z).
- **Aucune signature ni note Git** (acceptable : aucune politique de signature exigée par le dépôt).

## 6. Matrice de containment des branches locales

Commandes : `git for-each-ref refs/heads`, `git merge-base --is-ancestor <tip> HEAD`, `git rev-list --count <tip>..HEAD`, `git rev-list --count HEAD..<tip>`, `git branch --contains <tip>`, `git merge-base HEAD <tip>`.

| Branche | Tip | Date du tip | Ancêtre de HEAD | Commits HEAD absents du tip | Commits du tip absents de HEAD | Statut |
|---|---|---|---:|---:|---:|---|
| `main` | `69c6549` | 2026-10-21T16:12:14Z | **OUI** | 37 | 0 | référence ; contenue par les 15 branches locales |
| `mission-01-doc-consolidation` | `7147c6b` | 2026-10-21T16:48:03Z | non | 37 | **1** | abandonnée/superseded ; merge-base = main ; version du catalogue `docs/10_ACCEPTANCE_TESTS.md` non fusionnée telle quelle (livrable réintroduit et étendu par `7fae726`) |
| `mission-01-foundations` | `0bb1bb6` | 2026-10-21T17:26:39Z | **OUI** | 33 | 0 | intégrée (4 commits fondations) ; contenue par 12 branches |
| `mission-02-ux0` | `779e4e1` | 2026-10-21T16:54:12Z | non | 37 | **4** | abandonnée ; merge-base = main ; `docs/ux/*` absents de HEAD ; couverture partielle par `docs/backlog/UX0_ADDENDUM.md` (`b2a17ec`) |
| `v0-fullstack-sprint` | `ddda015` | 2026-10-23T09:30:39Z | **OUI** | 25 | 0 | intégrée ; worktree secondaire V0 |
| `v1-00-foundation` | `83abb8e` | 2026-10-23T14:30:04Z | **OUI** | 22 | 0 | intégrée |
| `v1-01-a-application-layer` | `165aa2d` | 2026-10-23T16:33:44Z | **OUI** | 20 | 0 | intégrée |
| `v1-01-a1-consolidation` | `429a93e` | 2026-10-23T18:05:13Z | **OUI** | 18 | 0 | intégrée |
| `v1-01-b-agentic-capabilities` | `5827a19` | 2026-10-23T18:41:20Z | **OUI** | 16 | 0 | intégrée |
| `v1-01-c-hatchet-poc` | `87eb18d` | 2026-10-24T09:26:39Z | **OUI** | 12 | 0 | intégrée |
| `v1-01-d-durable-orchestration` | `88921e7` | 2026-10-24T19:39:56Z | **OUI** | 9 | 0 | intégrée |
| `v1-01-d-gate-blocked` | `9b35d1e` | 2026-10-24T06:57:19Z | non | 16 | **1** | abandonnée ; merge-base = `5827a19` (B) ; branche de blocage temporaire, remplacée par l'implémentation réelle D (`1110240`) ; ses 2 documents de gate absents de HEAD |
| `v1-01-e-storage-media` | `d2446ca` | 2026-10-25T07:47:59Z | **OUI** | 6 | 0 | intégrée |
| `v1-01-f-hardening-observability` | `11e11e5` | 2026-10-25T10:02:51Z | **OUI** | 3 | 0 | intégrée |
| `v1-01-g-architecture-certification` | `bcf2c58` | 2026-10-25T11:25:37Z | **OUI** (= HEAD) | 0 | 0 | branche courante = HEAD |

Bilan : **12 branches dont le tip est ancêtre de HEAD** (main + 11), **3 branches abandonnées** (1 commit, 4 commits et 1 commit hors HEAD). Les 3 branches abandonnées sont **purement locales** (aucun upstream, jamais poussées) : elles n'ont aucun effet sur la PR et peuvent rester telles quelles (aucune action destructive demandée). Aucune branche n'a été réécrite ni force-pushée.

## 7. Tags, refs distantes et branches poussées

Commandes : `git tag`, `git for-each-ref refs/tags`, `git branch -r`, `git for-each-ref --format="%(refname:short)|upstream=%(upstream:short)" refs/heads`, `git ls-remote --heads origin`.

| Contrôle | Résultat |
|---|---|
| Tags locaux | **aucun** (`git tag` vide ; `refs/tags` vide) |
| Refs distantes | `refs/remotes/origin/main` **uniquement** |
| Branches locales avec upstream | `main` → `origin/main` **seulement** ; les 14 autres sans upstream |
| Branches présentes sur origin | `refs/heads/main` **seulement** (`ls-remote`) → **aucune branche locale n'a été poussée**, la branche de certification n'a jamais été publiée |
| Stash / notes | aucun (`git stash list` vide, `refs/notes` vide) |
| Sous-modules | aucun (`.gitmodules` absent, `git submodule status` vide) |
| Dépôt shallow | non (`git rev-parse --is-shallow-repository` = `false`) → historique complet, scan d'historique fiable |

## 8. Hygiène du contenu de HEAD

| Contrôle | Résultat |
|---|---|
| Fichiers suivis | 309 (`git ls-tree -r HEAD` = 309 entrées, 100 % mode `100644`, aucun bit exécutable) |
| Taille des blobs | 1 683 629 octets au total ; plus gros blob = `pnpm-lock.yaml` (139 451 octets) ; **aucun blob > 200 Ko** |
| Fins de ligne | `git ls-files --eol` : 306 fichiers `lf` (dont `text` forcé par `.gitattributes`), 3 binaires `-text` (docx) ; **aucun CRLF** |
| LFS | aucun objet LFS (`git lfs ls-files` vide) ; `.gitattributes` ne déclare pas de filtre LFS (docx marqués `binary`) |
| Secrets | seul fichier `.env` suivi = `.env.example` (placeholders) ; `.env` local ignoré et non suivi |
| Scan de secrets (version HEAD de `scripts/check-secrets.ps1`) | **PASS** — `SECRET_SCAN_PASS: aucun secret detecte.`, 309 fichiers scannés |
| Scan de secrets historique | **PASS** — `HISTORY_SCAN_REVS=39`, `SECRET_HISTORY_SCAN_PASS` (39 révisions) — voir réserve ci-dessous |
| Lint Git (`git diff --check main...HEAD`) | exit 2 : 1 avertissement « trailing whitespace » dans `docs/execution/V1_00_ACCEPTANCE_REPORT.md:54` (détail en rapport 2, P3) |

> **Réserve sur le scan historique** : le mode `-History` du script n'existe que dans la version du fichier présente dans le worktree pendant l'audit (modification non commitée d'un agent parallèle ; la version HEAD ne comporte que le scan de l'arbre de travail). Le résultat PASS porte donc sur les 39 révisions avec les motifs de la version de travail. La version HEAD du script a été exécutée séparément sur l'arbre : PASS (309 fichiers). À reconfirmer après stabilisation du worktree.

## 9. Anomalies et verdict

### 9.1 Anomalies (aucune bloquante pour un push)

| # | Anomalie | Gravité | Impact / traitement |
|---|---|---|---|
| A1 | 3 branches locales abandonnées non intégrées : `mission-01-doc-consolidation` (1 commit), `mission-02-ux0` (4 commits), `v1-01-d-gate-blocked` (1 commit) | P3 | Aucun impact sur la PR (non poussées). Leur contenu n'est pas dans HEAD ; le livrable d'acceptation a été réintroduit par `7fae726`. Conserver ou nettoyer relève du Lead (aucune action destructive effectuée). |
| A2 | Worktree non propre en fin d'audit (CI + `next-env.d.ts` + `check-secrets.ps1` modifiés et 3 scripts non suivis par des agents parallèles) | P2 (process) | Ces changements ne sont pas dans HEAD ; ils doivent être exclus du commit de certification ou revus séparément. Snapshot 2026-10-25T13:08Z. |
| A3 | README et statut documentaire rédigés avant merge (« prototype V0 non mergé dans main ») | P3 | Devenu partiellement inexact après fusion de la PR (voir rapport 2). |
| A4 | 1 ligne de whitespace résiduel (`git diff --check`) | P3 | Aucun blocage CI (le job lint ne contrôle pas le whitespace Git) ; correction facultative. |

### 9.2 Verdict

- **Historique publiable** : OUI.
- **Réécriture nécessaire** : NON (aucun merge/rebase, aucun commit orphelin, aucun message à corriger, aucune ref à recréer).
- **Fast-forward `main` → HEAD** : possible (main ancêtre, 0 commit en sens inverse).
- **Branche poussable** : OUI, sans upstream actuellement — le push initial devra créer l'upstream : `git push -u origin v1-01-g-architecture-certification` (**non exécuté**, hors périmètre de l'auditeur).
- **Blocage Git/PR** : **aucun**. Le push reste soumis à l'**ARRÊT OBLIGATOIRE** de l'équipe et au feu vert du Lead, puis à l'exécution de la CI distante (P1-06, NOT_RUN à ce jour).
