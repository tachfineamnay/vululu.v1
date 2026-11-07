# MVP 01 — Stabilisation du rendu

- Date : 2026-11-05 ; ADR 0026, contrat `V1_DEMO_LAYOUT_CONTRACT.md`.
- Exigences : PRD-03/04/08/14, CDC-F-020/040/042/050, CDC-N-005/007/008.

Le texte entier est composé dans les dimensions du profil. Le paysage utilise deux colonnes. Un dépassement à la taille minimale échoue avant écriture du PNG. L’audit lie zones, tailles, empreintes et checksum ; il est conservé dans SceneVersion.manifest et repris pour les scènes inchangées lors d’une correction. La version de composition est figée au lancement et invalide la réutilisation d’une ancienne composition.

| Preuve | Résultat |
|---|---|
| Tests natifs avant correction | 7 FAIL : fin du texte ignorée, audit absent, débordement non refusé |
| Contrôle de snapshot avant raccordement | 1 FAIL / 12 PASS : version de composition absente |
| Tests natifs composition/profils | 10 PASS, 15,95 s |
| Typage complet après raccordement | PASS |
| Premier contrôle pipelines | Assertions : 30 PASS / 2 S3 SKIP ; **commande FAIL**, timeout RPC interne Vitest `onTaskUpdate` ; aucun succès de lot revendiqué |
| Rejeu seul, sans compilation parallèle | **30 PASS / 2 S3 SKIP**, 4 fichiers, 67,75 s, sortie 0 |
| Recette navigateur sur build de production | **1 PASS**, 47,8 s : verticale vidéo, correction ciblée, QA, approbation exacte et transfert MOCK |
| Contrôles dépôt | Lint strict, secrets, frontières et documents fondateurs PASS |

Le rendu paysage 1920×1080 a été inspecté sur une palette très claire : colonnes distinctes, texte lisible et aucune bordure de redimensionnement portrait. Les métriques et images restent à qualifier sur Linux ; le fichier local n’est pas une preuve de déploiement. Un premier script d’édition Python n’a pas tourné (interpréteur non configuré) ; l’édition a été faite avec les outils locaux disponibles.

Rollback : conserver versions, manifests et snapshots ; revenir à l’image précédente après arrêt des lancements. Les runs sans version de composition compatible doivent être traités avec leur ancienne image ou échouer explicitement avant nouveau lancement ; aucun historique n’est réécrit.
