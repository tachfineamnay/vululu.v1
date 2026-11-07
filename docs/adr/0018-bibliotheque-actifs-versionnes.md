# ADR 0018 — Bibliothèque d’actifs versionnés

- Date : 2026-11-04
- Statut : accepté pour V1 DEMO ; qualification S3/Linux à prouver séparément.
- Exigences : PRD-02/15, CDC-F-010/012/013, CDC-N-001/003/006/009.

La bibliothèque conserve les binaires derrière ArtifactStoragePort et leurs métadonnées dans PostgreSQL. Une racine appartient à un utilisateur et à un contexte. Chaque import réserve une version staged, écrit et vérifie le binaire, puis finalise ready ou failed. Les versions et clés générées ne sont jamais écrasées. Une coupure peut laisser staged ; aucune récupération ne doit annoncer ce fichier prêt sans vérification.

Une sélection de projet référence une version exacte par actif du même propriétaire et contexte. L’intention organic/sponsored et les droits déclarés sont revalidés avant sélection et lancement. La modification est verrouillée contre le lancement d’un run. Les snapshots schemaVersion 1 reçoivent des champs optionnels additifs assets et project.usage ; les anciens snapshots restent lisibles et inchangés.

Le transport est un upload binaire borné avec métadonnées validées en header, sans bibliothèque multipart. Session et CSRF sont contrôlés avant lecture du corps. Deux imports simultanés maximum par processus bornent la mémoire ; cette limite complète le débit persistant. Aucun fetch de provenance. Les documents et polices sont téléchargés comme pièces jointes, sans interprétation. Le détail des formats et contrôles est dans le contrat V1_DEMO_ASSETS_CONTRACT.md.

Le compositing des actifs dans les formats de sortie sera qualifié avec le lot média. La présence d’une sélection ne constitue pas à elle seule une preuve de compositing.
