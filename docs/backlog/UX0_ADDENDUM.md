# Addendum roadmap — UX-0

- **Version** : 1.0
- **Date** : 2026-10-21
- **Statut** : addendum PROPOSED, à valider
- **Mission** : Mission 01 — consolidation des fondations
- **Portée** : insertion de UX-0 dans la roadmap opérationnelle, sans modifier le backlog verbatim

## 1. Objet

Ce document insère le lot **UX-0** dans la feuille de route de Vululu AI. Il ne remplace pas [ROADMAP_V1.md](ROADMAP_V1.md) et ne modifie pas le backlog importé [11_BACKLOG.md](../11_BACKLOG.md). Il ajoute un lot obligatoire et un gate avant tout développement frontend.

## 2. Pourquoi UX-0

Vululu AI doit réunir la simplicité d'une conversation avec une IA et la puissance visuelle d'un studio créatif, sans exposer la complexité technique. L'utilisateur parle à **Vululu**, jamais à un agent, un modèle ou un fournisseur.

UX-0 définit :

- l'interlocutrice unique et sa voix ;
- cinq intentions : conseiller, brainstormer, préparer le brief, créer, corriger ;
- la divulgation progressive des outils ;
- les parcours, états et erreurs ;
- les contrôles simples V1 ;
- les critères de validation novice, mobile et accessibilité.

## 3. UX-0 n'est pas P0-0 technique

| Élément | UX-0 | P0-0 technique |
|---|---|---|
| Nature | Produit, parcours, UI, microcopie | Stack, contrats, infra, POC |
| Code | Aucun | Aucun code métier ; POC Hatchet isolé en M07 |
| Gate | Choix visuel humain avant frontend | Hatchet PASS avant GO technique |
| Parallélisme | Oui, après M01 | Oui, après M01 |
| Blocage | Frontend métier | GO P0-A |

Les deux travaux peuvent avancer en parallèle. Aucun frontend métier n'est codé avant validation UX et choix visuel.

## 4. Livrables UX-0

### M02 — Spécifications UX

- docs/ux/UX0_PRODUCT_PRINCIPLES.md
- docs/ux/UX0_USER_JOURNEYS.md
- docs/ux/UX0_INFORMATION_ARCHITECTURE.md
- docs/ux/UX0_STATES_AND_ERRORS.md
- docs/ux/UX0_WIREFLOWS_TEXT.md
- docs/ux/UX0_ACCEPTANCE_CRITERIA.md

Un brouillon existe sur la branche mission-02-ux0. Il doit être aligné avant validation, notamment sur le choix projet/campagne, Facebook/X extensible, le statut « Réflexion », le libellé « Remis à Postiz » et la distinction entre pause du player et pause de génération.

### M03 — Direction visuelle

- docs/ux/UX0_VISUAL_DIRECTIONS.md
- docs/ux/UX0_SELECTION_CRITERIA.md
- vues locales dans _inbox/ux0-design/, ignorées, jamais poussées.

Trois directions distinctes, mêmes vues, contenus fictifs, aucune image tierce sans droits. Aucun design token avant le choix humain.

## 5. Séquence

    M01 fondations -> M02 UX-0 -> M03 directions -> choix humain -> frontend
    M01 fondations -> M04 stack -> M05 contrats -> M07 Hatchet -> M10 gate

Le frontend métier reste bloqué tant que :

- M02 n'est pas validé ;
- M03 n'a pas produit un choix humain ;
- M10 n'a pas donné son GO.

## 6. Critères d'acceptation UX-0

- Un novice comprend le prochain geste sans connaître LLM, capability ou worker.
- Un seul interlocuteur visible dans le parcours créatif.
- Cinq intentions disponibles sans cinq applications.
- Aucun jargon technique côté invité.
- Pause du player et pause de génération distinctes.
- Aucune timeline avancée, aucun multipiste V1.
- Aucune mémoire sémantique V1.
- Parcours mobile et desktop, accessibilité clavier, contrastes, sous-titres.
- Validation humaine avant transfert.
- Statuts honnêtes : préparation, réflexion, génération, aperçu, correction, validation, remis à Postiz, erreur récupérable.

## 7. Frontières V1/V2

V1 : conversation, studio léger, aperçus, correction ciblée, validation, transfert Postiz, contrôles simples.

V2 : modes Simple et Studio Pro, timeline vidéo, pistes audio, paramètres créatifs précis, assistance Vululu avancée, mémoire. Aucun code V2 en V1.

## 8. Statut et prochaine action

UX-0 est **PROPOSED**. La validation des six documents, des trois directions et du choix visuel relève du porteur du projet. Aucun frontend n'est créé dans M01.

## 9. Références

- [Roadmap opérationnelle](ROADMAP_V1.md)
- [Backlog verbatim](../11_BACKLOG.md)
- [Addendum V2](../v2/ADDENDUM_MODES_SIMPLE_STUDIO_PRO.md)
- [Rapport Mission 01](../foundations/01_CORPUS_AUDIT.md)
