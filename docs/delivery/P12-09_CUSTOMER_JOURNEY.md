# P12-09 — Parcours client de bout en bout

**Lot :** P12-09 · **Branche :** `campaign/vululu-completion` · **Base :** `8581203`.
**Date :** 2026-11-21. **Statut :** un blocage de parcours corrigé et vérifié (sonde exécutée, 8 cas),
spécifications Playwright ajoutées. **Parcours navigateur complet NOT_RUN** : PostgreSQL absent, Playwright
non exécutable dans cette session (§5). Aucun fournisseur payant, aucune publication.

---

## 1. Parcours exigé et état réel des étapes

Inscription/connexion → identité de marque → objectif → canal → format → ressources → confirmation explicite
→ brainstorming → directions artistiques → choix humain → Studio éditable → revue → approbation → export ou
publication programmée → résultats.

Traçage par lecture du code et des routes existantes :

| Étape | Écran / route | État serveur persisté | Constat |
|---|---|---|---|
| Inscription / connexion | `/register`, `/login` | `User`, session cookie | OK |
| Identité de marque | `/contexts/new` | `BrandContext` | OK |
| Objectif / canal / format | `/projects/new` | `Project` | OK, reprise de brouillon locale (`restoreProjectDraft`) |
| Ressources | `/assets?context=&project=` | `ProjectAssetSelection` | OK |
| Confirmation explicite | `ProjectAssetsStep` | `assetsConfirmationDigest` | OK, verrou serveur (brainstorming bloqué sans `assetsConfirmedAt`) |
| Brainstorming | `BrainstormPanel` | `AssistantTurn` | OK |
| Directions | `ArtDirections` | `CreativeRevision` (label/origin) | OK |
| Choix humain | `POST …/creative/directions/select` (P12-05) | `Project.selectedCreativeVersion` | OK |
| Studio éditable | `CreativeEditor` | `CreativeRevision` + pointeur | OK (suit le pointeur depuis P12-05) |
| Revue / approbation | `CreationDelivery` | `manifest` (checksum) + `approvedAt` | OK, approbation liée à la version exacte |
| Export / publication | `/creations?project=`, Postiz MOCK | `Artifact`, transfert idempotent | OK, export manuel conservé |
| Résultats | `/results` | mesures simulées, étiquetées MOCK | OK, aucune métrique inventée |

## 2. Blocage confirmé et corrigé

### 2.1 Carte de parcours : étapes mortes et statuts figés

`CampaignJourney` affichait les 12 étapes comme du **texte non cliquable**, et n'évaluait que
objectif/canal/format/ressources/directions : les étapes « choix humain » → « résultats » restaient
« à venir » même après un choix, un rendu ou une approbation. Le pied de carte promettait des étapes
« activées progressivement », sans navigation réelle — une impasse pour un nouvel utilisateur.

**Correction (minimale, sans refonte) :**

1. `campaignJourneyStates` accepte désormais les faits **persistés** : `selectionVersion`, `rendered`,
   `approved`, `delivered`, `results`. Une étape n'est « terminée » que si le fait serveur existe ;
   sinon elle reste « à venir » (aucun statut inventé).
2. `CampaignJourney` rend chaque étape comme un lien réel (`hrefs`) vers la section ou la route
   correspondante (`#brainstorm-heading`, `#art-directions-heading`, `#composition-heading`,
   `#preview-heading`, `/results?project=…`), avec `data-step` pour les tests et le focus clavier natif
   des liens. Sans cible, l'étape reste un texte d'état.
3. `ProjectStudio` alimente la carte avec les faits déjà chargés (`chosenDirection`, `bundle.master`,
   `revisions[0].approvedAt`, statut `transferred`), sans nouvel appel réseau.
4. Le texte de pied décrit la reprise réelle après rafraîchissement/reconnexion au lieu d'une promesse.

### 2.2 Portes d'assets et d'approbation

Les deux portes restent **côté serveur** : brainstorming refusé sans confirmation de ressources
(`brainstorm-locked` n'est que le reflet d'un refus serveur), approbation refusée si le checksum du
manifest ne correspond pas à la version demandée (`409 creative_unrendered`, P12-00/P12-05). Aucun
contournement par API directe n'a été ouvert.

## 3. Preuves exécutées

| Commande | Exit | Résultat | Statut |
|---|---|---|---|
| Sonde compilée `projectPresentation.ts` + Node (machine à états du parcours) | 0 | `JOURNEY_STATES_PROBE_PASS cases=8` | PASS |
| `tsc --noEmit -p apps/web/tsconfig.json` | 0 | 0 erreur | PASS |
| `tsc --noEmit -p apps/api/tsconfig.json` | 0 | 0 erreur | PASS |
| `tsc --noEmit e2e/p12-09-customer-journey.spec.ts` (types Playwright, strict) | 0 | 0 erreur | PASS |
| `eslint apps/web/components/CampaignJourney.tsx apps/web/components/ProjectStudio.tsx apps/web/lib/projectPresentation.ts` | 0 | 0 erreur | PASS |

La sonde vérifie les 8 transitions : ressources non confirmées (rien après), directions générées (choix
courant), direction choisie (création courante), master rendu (revue courante), approuvé (livraison
courante), livré (résultats courants **mais jamais terminés**), résultats réels (terminés), 12 étapes stables.

## 4. Tests ajoutés

`e2e/p12-09-customer-journey.spec.ts` : connexion, création d'identité + projet par API réelle, ouverture du
projet, présence des 12 étapes, états `assets = current` / `brainstorm = upcoming` sans confirmation,
navigation clavier vers `#brainstorm-heading`, puis `selectedVersion = null` avant **et après**
rafraîchissement (continuité de l'état serveur).

## 5. NOT_RUN et limites

| Élément | Cause vérifiée | Statut |
|---|---|---|
| Parcours navigateur complet (inscription → téléchargement du livrable) | PostgreSQL `127.0.0.1:55432` absent (aucun binaire `pg_ctl` sur la machine, `scripts/arena/pg16-local.sh` non exécutable sans installation) | NOT_RUN |
| `playwright test e2e/p12-09-customer-journey.spec.ts` | `esbuild`/`spawn EPERM` dans cette session ; aucun serveur API/Web local | NOT_RUN |
| Captures d'écran 390/768/1024/1440 px | navigateur indisponible | NOT_RUN |
| Vérification des libellés FR/EN à l'écran | navigateur indisponible (textes ajoutés avec les deux variantes dans le code) | NOT_RUN |
| Approbation d'un rendu réel + téléchargement du livrable | base + worker + FFmpeg orchestrés par l'API requis | NOT_RUN |

**Limites assumées :** la carte de parcours ne remplace pas les outils existants ; les étapes « revue »,
« approbation » et « livraison » partagent l'ancre `#preview-heading` (une seule zone les matérialise) ;
`results` n'est jamais marqué terminé sans mesure réelle (`results: false` aujourd'hui côté projet).

## 6. Rollback

`git revert <sha>` : retour à `8581203`. Aucune migration, aucune donnée modifiée ; seules la carte de
parcours, son alimentation et une spécification Playwright changent.
