# V1-DEMO — Conversation guidée et storyboard

- Date : 2026-11-05 ; tranche 6D, ADR 0023.
- Exigences : PRD-03/06/08/09, CDC-F-024/030/040/042/044, CDC-N-001/003/005.

La conversation répond avec des scénarios synchrones MOCK. Commandes : `/aide`, `/brief`, quatre lignes `Objectif:`, `Audience:`, `Ton:`, `CTA:`, ou `SCENE-003: instruction`. Un message de confirmation renvoie vers le formulaire de relecture. Les lignes répétées ou non reconnues demandent une clarification. Un mot de commande dans la valeur d’un champ reste une donnée.

`POST /api/projects/:id/messages` exige session, CSRF et propriété du projet. Le corps contient uniquement content, de 1 à 2000 caractères après contrôle de contenu non vide. Le cas d’usage applique aussi cette borne pour ses autres transports. Une paire user/assistant est persistée atomiquement. Le champ Message.proposal est facultatif et les messages historiques restent inchangés. La lecture trie par date puis ID pour stabiliser les égalités d’horodatage.

Une proposition de brief porte schemaVersion=1, mode=MOCK, kind=brief, baseBriefVersion/baseBriefChecksum, fields (objective/audience/tone/cta), sources et hypotheses. Les sources distinguent saisie du message, brief, contexte, objectif du projet et exemple. Les exemples sont affichés comme valeurs à valider ; aucune page distante n’est consultée, même si un champ contient une URL. Les propositions ne modifient pas le brief ni son état de confirmation.

Le bouton de reprise copie les valeurs dans le formulaire. Si un brouillon est déjà modifié, il complète les champs vides et reprend seulement les valeurs explicitement déclarées dans le message ; les autres saisies sont conservées. La sauvegarde, la confirmation exacte avec plafond, puis la production restent des actions distinctes. Une proposition basée sur une ancienne version ou une source de contexte modifiée reste visible mais n’est plus applicable.

Une proposition de correction porte kind=correction, le Scene ID, sa version/checksum, le master version/checksum relu, la version de brief et l’instruction de 3 à 500 caractères. Elle exige un aperçu existant et préremplit le formulaire sans créer de job. Une nouvelle version de scène, master ou brief invalide la reprise de l’ancienne proposition. Le cas d’usage de production revalide ensuite les invariants au lancement.

Le storyboard déterministe utilise les champs du brief confirmé et un petit jeu de formulations génériques pour le ton. Il reprend l’objectif et le CTA, sans inventer de preuve commerciale. Les scènes et le personnage gardent leurs IDs lors d’une régénération. Les nouveaux projets suivent le comptage du profil ; les formats non qualifiés restent bloqués au rendu. La distinction entre durée héritée du brief et durée explicitement personnalisée reste un point à compléter pour les changements de durée après création des scènes.

Recette : propositions persistantes, champs déclarés/exemples, URL sans accès réseau, clarification, absence de confirmation automatique, IDOR/CSRF et rejet de payload client, copie sans perte du brouillon, références obsolètes, stabilité des IDs, correction et fichiers réels, upgrade des messages historiques et affichage mobile. Aucun compte externe, fournisseur IA ni apprentissage de préférences.
