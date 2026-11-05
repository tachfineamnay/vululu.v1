# ADR 0026 — Composition native et texte intégral

- Date : 2026-11-05 ; statut : accepté pour la tranche média 7A.
- Exigences : PRD-03/04/08/14, CDC-F-020/040/042/050, CDC-N-005/007/008.

Le renderer redimensionnait une composition 1080×1920 dans tous les ratios et coupait les textes après quatre lignes. Un fichier techniquement valide pouvait donc perdre une partie du brief. La composition se fait désormais directement aux dimensions du profil, avec des zones distinctes pour marque, titre, description et mention DÉMO MOCK. Le format paysage utilise deux colonnes. Aucun texte utilisateur n’est interprété comme balisage ou URL à charger.

Le moteur de texte natif de Sharp/Pango assure les retours à la ligne, y compris les mots longs. Le corps est composé entièrement, avec une taille réduite dans des bornes de lisibilité ; si tout le texte ne tient pas à la taille minimale, le rendu échoue explicitement avant écriture du fichier et création d’une nouvelle version média. Aucun raccourcissement ou résumé automatique. Les couleurs de marque sont conservées dans le décor, avec un fond sombre garantissant la lecture du texte clair.

Chaque résultat porte un audit de disposition : version de composition, empreintes des textes, tailles, limites des zones, statut complet et checksum du PNG. Cet audit est conservé dans le manifeste de SceneVersion et réutilisé avec sa version exacte lors d’une correction. La QA vérifie sa présence, les limites et le lien au checksum réel ; elle ne prétend pas réaliser une reconnaissance optique ni un contrôle éditorial humain.

La version de composition est figée dans snapshot.render et participe à l’empreinte des entrées communes. Un master ancien nécessite une production complète avant correction avec la nouvelle composition. Un run en file dont la version manque ou diffère est refusé explicitement par le nouveau worker, sans réécrire son snapshot ; son exécution historique reste liée à son ancienne image. Les anciennes versions restent lisibles. La bascule de release doit arrêter les nouveaux lancements et traiter les runs en cours avant changement d’image.

Cette tranche qualifie la composition et le texte pour les profils de dimensions ; elle ne rend pas disponibles les formats ni le mix audio encore bloqués. Les polices natives peuvent varier entre systèmes : les images et métriques de la release Linux restent à qualifier, sans promesse d’égalité binaire entre Windows et Linux.
