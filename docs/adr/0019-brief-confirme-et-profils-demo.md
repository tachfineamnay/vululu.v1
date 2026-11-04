# ADR 0019 — Brief confirmé et profils de production démo

- Date : 2026-11-04
- Statut : accepté pour la mise en œuvre du lot 6 ; qualification des sorties au lot 7.
- Exigences : PRD-03/05/06/07/13, CDC-F-020/021/022/023/024/030/031/033/061.

Le brief conserve une configuration de production structurée et versionnée avec son contenu. BriefRevision reçoit une copie immuable de ces paramètres ; aucune ancienne révision ni empreinte n’est recalculée. Les anciens briefs sans paramètres restent identifiables comme legacy et doivent être relus avant un nouveau lancement.

Les profils réseau/format sont des profils internes de la démo, versionnés et explicitement distincts d’une certification des règles actuelles des plateformes. Les paramètres couvrent ratio, durée par défaut des scènes, direction/style, références audio exactes et réglages de mix, plafond de coût MOCK. Les droits des fichiers et l’intention organique/sponsorisée du projet sont revérifiés. Une référence audio n’est pas une synthèse de texte libre.

La confirmation porte sur la version et le checksum exacts du brief. Sauvegarder une nouvelle révision invalide cette confirmation ; un run nouveau sans confirmation correspondante est refusé côté serveur. Les runs déjà lancés continuent avec leurs snapshots figés, sans demander une nouvelle confirmation au redémarrage. Les clients internes doivent effectuer la confirmation explicite ; elle n’est pas déduite d’un simple enregistrement de brouillon.

Le snapshot de lancement conserve les paramètres, le profil, la version du workflow et les configurations d’agents applicables. Modifier une configuration après la mise en file ne doit pas la substituer dans un run existant. Les simulations, estimations et coûts restent marqués MOCK ; aucun SDK IA ni coût fournisseur réel n’est introduit.

Les interfaces n’annoncent une sortie disponible qu’après la preuve média correspondante. Les paramètres enregistrés et le storyboard peuvent être testés avant cette qualification ; cela ne certifie pas un rendu audio, un nouveau format ou une connexion fournisseur réelle.
