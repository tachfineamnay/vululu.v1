# P11-B — Administration des agents, modèles et outils (rapport de lot)

- **Date** : 2026-11-21
- **Branche** : `campaign/vululu-completion` (base `6588e4a`, P11-A)
- **Commit** : `feat(p11b): complete agent and tool administration [BUILD_UNVERIFIED]`
- **Statut de preuve** : **BUILD_UNVERIFIED** — aucune suite, aucun typecheck/build/E2E (contrat §25).
- **ADR** : [ADR-0043](../adr/0043-administration-agents-outils-capacites.md)

## 1. Périmètre livré

1. **Agents et rôles** : la page Agents existante affiche chaque agent (nom, clé, rôle `director`/`specialist`/`validator`, exigences de capacité) — conservé et complété par les nouvelles sections.
2. **Configurations versionnées et version active** : versions immuables, checksum, version active explicitement identifiée (existant).
3. **Mises à jour et rollback** : création d'une nouvelle version (non active par défaut), promotion et rollback explicites, journalisés (existant).
4. **Fournisseurs et modèles** : liste des fournisseurs et modèles, activation, qualification, credentials chiffrés (existant).
5. **Disponibilité réelle** : nouvelle route `GET /api/admin/tools` + panneau « Disponibilité réelle des capacités » dans Fournisseurs. Valeurs `configured` (configuré, **non sondé**), `disabled`, `missing_credential`, `local`, calculées depuis les fonctions de configuration existantes (média, image, audio, Postiz, Vertex, Python). Aucun fournisseur désactivé ou MOCK n'est affiché disponible.
6. **Capacités Python dans le catalogue** : `image.analyze@1`, `image.segment@1`, `audio.analyze@1` apparaissent dans le même catalogue avec fournisseur `python-tools@1` et disponibilité liée à `PYTHON_TOOLS_URL`/`PYTHON_TOOLS_TOKEN` (aucun appel dynamique, pas de second registre).
7. **Activation/désactivation contrôlée** : par compte, via la politique d'exécution (nouvelle lecture `GET /api/admin/execution/accounts` et `/:account`, écriture via le `PUT` existant) : état, plafond, réservé/dépensé, outils autorisés (cochés parmi le catalogue fermé). Le broker applique toujours `tool_disabled`, le budget et l'approbation humaine.
8. **Permissions et restrictions** : le catalogue affiche action (READ/GENERATE/WRITE-PUBLISH), portée (project/assets/revision), approbation (automatique/humaine), plafond, caractère proposable par l'agent ou réservé à l'utilisateur.
9. **Qualification et versionnement préservés** : la qualification de modèle et l'activation restent les routes existantes ; la disponibilité affichée ne les remplace pas.
10. **UI reliée au serveur** : chaque section appelle une route réelle ; aucun contrôle factice, aucun jeton exposé.

## 2. Fichiers principaux

- API : `apps/api/src/routes/adminAgents.ts` (`GET /api/admin/tools`, disponibilité), `apps/api/src/routes/execution.ts` (`GET /api/admin/execution/accounts[/:account]`).
- Web : `apps/web/app/admin/agents/page.tsx` (catalogue + politique d'exécution), `apps/web/app/admin/fournisseurs/page.tsx` (disponibilité réelle), `apps/web/lib/admin.ts` (types + client).
- Docs : ADR-0043 + index, inventaire, carte des lots, ce rapport.

## 3. Vérifications (statuts honnêtes)

| Contrôle | Résultat | Détail |
|---|---|---|
| `git diff --check` | **OK (exit 0)** | Aucun espace fautif. |
| Parse syntaxique TypeScript (fichiers modifiés) | **OK (0 erreur)** | `transpileModule` — syntaxe seule, pas un typecheck. |
| `pnpm exec prisma validate` | **OK (exit 0)** | Aucune migration en P11-B (la migration P11-A reste la dernière). |
| `scripts/check-migrations.ps1` | **OK (exit 0)** | 39 migrations, contrôle structurel. |
| `scripts/check-secrets.ps1` | **ÉCHEC (exit 1), faux positif préexistant** | Placeholder `PYTHON_TOOLS_TOKEN=CHANGE_ME…` dans `services/python-tools/.env.example` (P06). |

## 4. NOT_RUN et limites

- **NOT_RUN** : Vitest, typecheck, lint, build, Playwright, appels fournisseur réels, exécution d'une opération par le worker.
- Limites : la disponibilité décrit la **configuration serveur**, pas une preuve d'appel (libellé explicite) ; l'administration ne crée ni agent ni outil (registre fermé) ; la politique par compte nécessite l'identifiant utilisateur ; les capacités Python dépendent du service interne ; les fournisseurs restent désactivés par défaut et les appels réels `NOT_VERIFIED`.

## 5. Rollback

`git revert <sha-p11b>` : aucune migration, aucun schéma modifié. Les deux routes de lecture et les panneaux disparaissent ; les politiques d'exécution existantes restent en base et continuent d'être appliquées par le broker.
