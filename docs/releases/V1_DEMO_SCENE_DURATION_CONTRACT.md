# V1-DEMO — Durées héritées, personnalisées et historiques

- Date : 2026-11-05 ; tranche 6E, ADR 0024.
- Exigences : PRD-03/06/08/13, CDC-F-020/030/040/042/061, CDC-N-001/003/004/005/007.

`PATCH /api/projects/:id/scenes/:sceneKey` exige session, CSRF et propriété. Corps strict : `durationSeconds` entier de 1 à 15, ou `useBriefDuration: true`, jamais les deux. La saisie numérique définit usesBriefDuration=false ; la reprise lit le défaut du brief courant et définit true. Une scène historique peut avoir null : sa durée reste conservée tant que l’utilisateur n’indique pas son intention. Le reset exige un brief existant.

Toutes les écritures prennent le verrou du projet et refusent son état producing avec 409. Une lecture ou écriture étrangère reste 404, y compris pour un super-admin. Le cas d’usage valide les bornes numériques aussi hors HTTP. Aucun snapshot de run ni version média ne change après lancement.

La génération crée les nouvelles scènes en mode brief. À la régénération, seules celles en mode true reçoivent le nouveau défaut ; les autres gardent leur durée et leur ID. Le plan avant confirmation prédit ce même résultat. Exemple : cinq scènes à 2 secondes, troisième personnalisée à 5, nouveau défaut à 3 → 17 secondes prévues et régénérées. Reprendre le défaut pour cette scène donne ensuite 15 secondes. Une ancienne scène à 7 secondes garde cette valeur, soit 19 secondes avec quatre scènes à 3.

Acceptation : preuve RED puis GREEN de ces calculs, stabilité des IDs et historique, reset explicite, validation stricte, RBAC/IDOR/CSRF, refus pendant production et snapshot intact, upgrade conservant les anciennes valeurs, E2E avec média dont la durée réelle correspond au plan et au storyboard. Rollback : conserver la colonne nullable et les données, suspendre les changements de durée et les nouveaux runs pendant retour au candidat précédent ; ne pas effacer les versions.
