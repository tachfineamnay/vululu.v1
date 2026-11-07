# ADR 0024 — Origine explicite des durées de scène

- Date : 2026-11-05 ; statut : accepté pour la tranche 6E.
- Exigences : PRD-03/06/08/13, CDC-F-020/030/040/042/061, CDC-N-001/003/004/005/007.

La régénération préservait toutes les durées existantes comme si elles étaient personnalisées. Le plan prévoyait pourtant le nouveau défaut du brief. Une modification de 2 à 3 secondes pouvait ainsi annoncer 15 secondes et produire 10 secondes. La durée numérique seule ne permet pas de déduire l’intention d’une ancienne personnalisation.

Scene.usesBriefDuration est nullable : true suit le défaut du brief lors de la régénération, false indique une durée explicitement saisie, null conserve une origine historique inconnue. La migration additive laisse les anciennes durées inchangées et leur origine à null. Les nouvelles scènes du storyboard sont créées avec true. Une saisie numérique passe à false, même si elle égale le défaut. Une action explicite permet de reprendre le défaut actuel avec true.

Le plan calcule les durées attendues selon ces mêmes règles ; il conserve les durées personnalisées et historiques. Le retour au défaut lit le brief courant sous verrou du projet. Les écritures de durée partagent le verrou utilisé par la production et le storyboard, vérifient la propriété et refusent un projet en production. Un run déjà lancé conserve son snapshot ; les versions et fichiers historiques ne sont pas réécrits.

L’API accepte exactement l’un des corps `{ durationSeconds: 1..15 }` ou `{ useBriefDuration: true }`. L’interface affiche l’origine et propose la reprise explicite. Aucun nouveau fournisseur ni changement de périmètre V1.
