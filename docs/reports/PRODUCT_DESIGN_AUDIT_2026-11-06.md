# Audit Product Design — 2026-11-06

**Verdict : deux usages réalisables après corrections ; fidélité du Studio non validée.** Audit de l’application locale réelle, avec données fictives dans la base isolée. État Git initial et modifications des tranches précédentes préservés. Aucune publication, dépendance ajoutée ou modification backend.

## Parcours vérifiés

| Étape | Usage / résultat observé | État |
|---|---|---|
| 1 | Débutant : compte neuf, accueil réellement vide, action Nouveau projet | PASS |
| 2 | Idée : champs requis, clavier, brouillon clairement local | PASS |
| 3 | Références : contexte minimal créé et retour à la même idée | PASS |
| 4 | Destination et récapitulatif : formats indisponibles nommés, aucune génération implicite | PASS |
| 5 | Brief : sauvegarde, reprise après retour arrière, révision exacte, livrables et plafond MOCK relus avant production locale | PASS après correction |
| 6 | Professionnel : reprise du projet existant directement au résultat ; lecture vidéo au clavier | PASS |
| 7 | Correction réelle de SCENE-001 : ancien master conservé, puis v2, approbation de v1 invalidée ; comparaison des deux masters | PASS après correction |
| 8 | Export de v1 depuis le navigateur : MP4 téléchargé, checksum identique à la version affichée ; transfert testé séparément en MOCK | PASS |

Captures acceptées de **cet audit seulement**, sous `.v1/audit-20261106/` : `01` accueil vide, `02` idée, `03` références vides, `04-destination-{largeur}`, `05` récapitulatif, `06` Studio avant, `07` reprise corrigée, `08` plan/plafond, `09` production en cours, `10` reprise pro, `11-comparaison-{largeur}` avant correction du message, `12` approbation obsolète/export, `13` comparaison corrigée, `14` reflow. Les captures de chargement/progression sont identifiées comme telles.

![Reprise du brief après retour arrière](../../.v1/audit-20261106/07-reprise-corrigee-390.png)

![Comparaison réelle après correction](../../.v1/audit-20261106/13-comparaison-corrigee-1440.png)

## Corrections importantes

| Problème constaté | Correction et preuve |
|---|---|
| **P1 — Saisie perdue sans avertissement après Retour puis Avant.** Audience redevenue vide pendant le test manuel. | Copie d’édition dans l’onglet, liée au compte/projet et à la version/checksum du brief. Révision différente : pas de reprise silencieuse, choix explicite de reprendre en brouillon. Brief, réglages, correction et message non envoyé préservés. Test de conflit serveur et de 503 ; aucune sauvegarde métier implicite. Captures `06`/`07`, E2E résilience. |
| **P1 — Produire / storyboard encore actifs pendant un run.** | Blocage selon l’état réel du projet/run, verrou des mutations simultanées. Relevé manuel pendant correction : deux commandes désactivées, master v1 et instruction conservés. Assertion E2E dédiée. |
| **P1 — Message “Approbation acceptée” de v1 encore visible sous v2 non approuvée.** Capture `11`. | Notification liée à la version et au master concernés ; disparition au changement de master. Statut courant “aucune” conservé, capture `13` et E2E. |
| **P2 — SCENE-003 inexistante et instruction préremplie avant toute scène.** | Sélection issue des données, instruction vide, cause d’indisponibilité et portée/coût de correction expliqués. Aucun contrôle de texte, visuel ou audio inventé. |
| **P2 — En-tête mobile masquant une grande partie de la page, marque coupée à 1024 px, IDs de 10 px.** | Thème bleu limité au shell Studio, en-tête non fixe, marque sans coupure et IDs de 14 px. Focus visible, aucun défilement horizontal de page aux largeurs testées. |
| **P2 — Assistance et réglages secondaires omniprésents, résultat éloigné à la reprise.** | Brief avant assistance facultative repliée ; style/direction avancés repliés, plafond toujours visible ; focus initial sur le résultat existant et lien direct. Un lien vide revenant au même projet remplacé par Compléter le brief. |
| **Risque de course pendant l’enregistrement** | Champs temporairement verrouillés pendant la requête ; une réponse ne peut pas effacer une nouvelle saisie faite pendant l’attente. Test avec sauvegarde retardée puis 503. Déconnexion sans confirmation serveur : erreur explicite. |

## Contrôles et preuves

- **Responsive PASS** : 1440, 1024, 768 et 390 px, destination et résultat ; mesures `scrollWidth = clientWidth`, captures et `reflow.json`. Reflow complémentaire 720 × 512 : PASS, sans l’assimiler au zoom.
- **Clavier PASS ciblé** : validation native/focus, navigation d’étapes, disclosures, reprise, correction, comparaison, export ; lecture vidéo par Espace (`paused=false`, média 1080 × 1920, durée réelle ~9,97 s). Pas de test lecteur d’écran.
- **Contrastes PASS sur l’échantillon rendu** : aides 5,90:1, texte/action 7,73:1, titre 14,16:1, marque 15,51:1 ; focus bleu visible. `contrastes-dom.json` et contrôle final des IDs à 14 px. Ce relevé ne certifie pas tous les médias ou états de l’application.
- **Erreurs/chargements PASS** : sauvegarde retardée, 503 sur sauvegarde/correction/approbation/plan/téléchargement/actualisation dans les scénarios concernés, résultat et saisies conservés, reprise explicite. État de chargement initial retardé contrôlé. Erreurs injectées signalées dans les tests ; rendu et fichiers locaux réels, coûts/Postiz **MOCK**.
- **Export natif PASS** : téléchargement depuis le navigateur, checksum de v1 vérifié (`export-checksum.log`). La recette vérifie aussi l’isolation du bundle, des binaires et des preuves entre comptes distincts (401/404).
- **Tests de cet audit** : 8 tests unitaires ciblés PASS (`unit-final.log`) ; 5 scénarios E2E distincts PASS (`e2e-final.log`, 8,6 min), puis rejeu des deux scénarios touchés par les corrections suivantes : 2 PASS (`corrections-e2e-final.log`, 3,4 min). Dernier rejeu avec sauvegarde retardée et champs verrouillés : 1 PASS (`sauvegarde-e2e-final.log`, 32,1 s). Les rejeux ne sont pas comptés comme de nouveaux scénarios.

## Limites et suite

- **Comparaison exacte à la maquette au même viewport : NOT_RUN.** PNG absent du dépôt ; son lien privé a été ouvert pendant cet audit et n’a pas livré l’image (connexion/chargement impossible), preuve `reference-acces-bloque.png`. Le SVG documentaire n’est pas utilisé comme substitut au PNG.
- **Composition cible du Studio : reste à réaliser.** Le thème et les interactions sont corrigés, mais le montage conserve sa liste de scènes avant le résultat ; l’aperçu central avec bandeau unique dessous et inspecteur droit n’est pas revendiqué conforme à `SCREENS.md`. La recomposition complète constitue la prochaine tranche, à vérifier avec la référence accessible.
- **Zoom navigateur natif 200 % : NOT_RUN.** Raccourcis essayés sans effet mesurable (largeur et DPR inchangés). Reflow à 720 px contrôlé séparément. NVDA/VoiceOver, conformité WCAG globale, tests utilisateurs externes et recette globale de release : NOT_RUN.
- Copie locale limitée à l’onglet et au stockage disponible, pas de synchronisation multi-appareil. Les messages le précisent. Aucun endpoint de brouillon serveur ou d’édition de flow ajouté.
- Préflight de contexte sauvegardé Product Design : NOT_RUN, Python non configuré ; audit fondé sur les documents du dépôt et les captures courantes.

Pas de déploiement, commit ou push. Rollback : retirer sélectivement les ajouts de cet audit (copie locale/guards, disclosures, styles Studio et tests associés), en conservant les tranches et modifications utilisateur précédentes. Aucune migration ni suppression de données.

### Relevé local final

| Commande / contrôle local | Résultat |
|---|---|
| `pnpm typecheck` | PASS, monorepo ; `typecheck-final.log` |
| `$env:LINT_STRICT='1'; pnpm lint` puis ESLint ciblé après la dernière correction | PASS ; `lint-final.log`, `lint-target-final.log` |
| `pnpm build` | PASS, API + Next.js ; `build-final.log` |
| `node docs/design-system/scripts/check.mjs` | PASS ; `kit-final.log` |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | PASS, 560 fichiers ; `secrets-final.log` |
| `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | PASS, 9 empreintes ; `foundation-final.log` |
| `git diff --check` et revue ciblée | PASS ; fichiers générés Next retirés du diff |

Journaux sous `.v1/audit-20261106/`. Contrôles exécutés localement, sans GitHub Actions ni GitLab. Aucune erreur console dans le dernier relevé manuel. Les limites NOT_RUN ci-dessus restent ouvertes malgré ces résultats.
