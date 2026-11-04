# V1-DEMO — Brief confirmé, profils et dépendances de production

- Date : 2026-11-04 ; tranche 6A du plan démo. Le lot 6 complet reste ouvert.
- Exigences : PRD-03/05/06/08/09/13, CDC-F-020/024/030/042/051/061, CDC-N-001/005/009.
- Décisions : ADR 0019 et 0020 ; contrat `docs/releases/V1_DEMO_BRIEF_PROFILE_CONTRACT.md`.

## Résultat

Le brief conserve un profil canonique versionné : réseau/format/ratio compatibles, durée par défaut, style, direction de simulation, plafond MOCK et structure audio. Les paramètres sont copiés dans chaque révision et participent au checksum. Les anciens briefs et leurs empreintes ne sont pas réécrits ; une histoire incomplète utilise le numéro courant pour la prochaine révision, sans fabriquer les révisions absentes.

Le lancement exige une confirmation humaine de version et checksum exacts. Le serveur vérifie propriété, CSRF et contenu courant. Une nouvelle révision invalide la confirmation et la liaison du storyboard. La génération du storyboard revalide ces préconditions sous verrou, conserve les Scene ID et applique la durée du brief. Le lancement refuse un ancien storyboard même après confirmation du nouveau brief.

Les exécuteurs local et durable lisent désormais les données figées du run : contexte, métadonnées des scènes, versions exactes et profil de rendu. Une édition ultérieure du contexte ne change pas le run en cours. Les nouveaux masters conservent la version du brief et une empreinte des entrées communes. Une correction exige une production complète si le contexte, les actifs, les personnages ou le brief ont changé globalement. Les anciens masters restent lisibles ; leur provenance absente ne permet pas une correction nouvelle.

Le rendu Video utilise les dimensions réelles du profil et les vérifie lors de la QA. Le style et la direction font varier une composition déterministe, sans interprétation IA. Les autres formats et les références audio sont refusés explicitement au lancement tant que leur rendu n’est pas qualifié. Le formulaire expose seulement les réglages vidéo qualifiés et indique la piste silencieuse.

## Preuves

| Vérification | Résultat |
|---|---|
| Domaine : profils, bornes, révisions et conservation des anciens checksums | 44 PASS lors du développement |
| API/transactions brief, concurrence et pipeline durable | 26 PASS avant ajout de la provenance globale |
| Protection contre une marque différente au moment d’une correction | RED observé : lancement accepté ; puis test PASS après garde transactionnelle |
| API brief et pipeline durable après provenance globale | 17 PASS |
| Upgrade 12/13/14/15 → 16 migrations | 4 PASS ; projets, runs, révisions et anciennes empreintes conservés, confirmation et liaison historiques laissées nulles |
| Médias réels 4:5 : PNG, MP4, QA attendue et mauvais ratio | 3 PASS |
| Régression complète initiale de cette tranche | 335 PASS, 2 FAIL, 2 SKIP, 39 fichiers, 427,36 s ; deux anciennes fixtures API omettaient la confirmation désormais obligatoire |
| Rejeu `pnpm exec vitest run tests/api.test.ts` avec confirmation explicite | 10 PASS, 139,52 s ; les 2 échecs précédents sont corrigés sans changement du garde serveur |
| Typecheck complet | PASS |
| Lint strict | PASS |
| Build API/Web, puis rebuild Web après correction mobile | PASS |
| E2E production final : `playwright test --config playwright.external.config.ts e2e/brief-profile.spec.ts e2e/v0.spec.ts` | 2 PASS, 1,2 min : profil 4:5, révisions/confirmation, storyboard périmé, vidéo réelle 1080×1350, mobile ; verticale vidéo/correction/approbation/transfert MOCK |
| Frontières / documents fondateurs / migrations | PASS ; 9 empreintes fondatrices intactes, 16 migrations |
| Scan de secrets final | PASS, 457 fichiers |

Les fixtures des autres tests de pipeline utilisent la confirmation réelle du store, avec le checksum canonique, puis déclarent explicitement la liaison des scènes construites pour ce brief. Aucun bypass n’a été ajouté au serveur. Le premier test de provenance a eu une erreur de résolution d’import avant le RED métier ; corrigé par un import local. Le premier test d’upgrade enrichi référençait un champ de fixture inexistant ; corrigé avant les quatre upgrades PASS.

La couverture finale est de 337 tests distincts PASS et 2 SKIP : régression initiale puis rejeu du seul fichier dont les préconditions de fixture ont changé. Il ne s’agit pas d’un second passage complet ; aucun autre comportement serveur n’a changé après cette régression.

Le premier E2E 4:5 a validé production, dimensions, révisions et QA, puis échoué au contrôle de largeur mobile. Diagnostic Chromium : noms de fichiers QA non sécables, débordement global à 475 px pour 390 px de fenêtre. Les lignes QA autorisent désormais le retour à la ligne ; l’historique conserve son défilement local. L’inspection a aussi relevé le sélecteur de scène limité à 2/5/10 secondes : il expose maintenant les 15 durées autorisées. Les images sont affichées sans recadrage implicite.

Mesure finale Chromium : fenêtre 390 px, document 390 px. Captures locales des contrôles et de la QA : `.v1/brief-profile-controls.png`, `.v1/brief-profile-qa-mobile.png` ; l’en-tête fixe a nécessité de centrer les éléments avant capture pour éviter qu’il les masque.

Les 2 SKIP concernent S3 : ils ne sont pas comptés comme succès. Les logs/captures et bases de recette sont locaux et fictifs. Aucun appel IA, coût fournisseur, push, publication ou déploiement externe effectué. Docker/Linux/Coolify : NOT_RUN pour cette tranche.

## Limites et suite

La structure audio enregistrable n’est pas encore un mix livré. Décision utilisateur : voix préenregistrées sous licence libre ; provenance, attribution, octets et QA restent au lot média. Les compositions des ratios autres que portrait conservent le contenu sans le couper, avec marges adaptées par Sharp ; une composition spécifique aux formats relève du lot média.

La conversation demeure une simulation simple, le storyboard utilise encore ses cinq modèles fixes, et l’estimation avant confirmation reste à livrer. Les configurations d’agents/politique fournisseur et la version du workflow ne sont pas encore toutes capturées au lancement. Ces points empêchent de fermer le lot 6 et la V1 complète. S3/Hatchet Linux, formats, compositing, audio, commentaires, MCP et exploitation restent suivis dans la traçabilité.

## Rollback

Les migrations 15 et 16 sont additives, sans suppression ni réécriture historique. Redéployer le code précédent en conservant les nouvelles colonnes et les données ; ne pas annuler les migrations par une destruction de colonnes. L’ancien code peut ignorer les paramètres et garde moins de contrôles : suspendre les nouveaux lancements pendant un rollback et privilégier la consultation des travaux existants. Revenir ensuite au candidat corrigé et rejouer login, lecture des anciens projets, confirmation et production sur une copie restaurée.
