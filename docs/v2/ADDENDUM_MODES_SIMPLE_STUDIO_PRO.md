# Addendum V2 — Modes Simple et Studio Pro

- **Version** : 1.0
- **Date** : 2026-10-21
- **Statut** : PROPOSED, hors périmètre V1
- **Mission** : Mission 01 — consolidation des fondations
- **Portée** : extension V2, sans modification de la note V2 existante
- **Note** : ce document ne modifie pas [NOTE_SPECIALE_PROPOSITIONS_V2.md](NOTE_SPECIALE_PROPOSITIONS_V2.md)

## 1. Objet

Formaliser deux modes V2 absents de la note publiée :

- **Simple** : conversation guidée, studio léger, aucune timeline.
- **Studio Pro** : timeline vidéo, pistes audio, paramètres créatifs précis, assistance Vululu avancée.

Ce document est une réserve de vision. Aucun code V2 n'est produit en V1.

## 2. Mode Simple

Le mode Simple est l'évolution naturelle de l'expérience V1 :

- interlocuteur unique Vululu ;
- contexte déclaratif réutilisable ;
- cinq intentions ;
- cartes et contrôles contextuels ;
- aperçu et correction ciblée ;
- validation humaine ;
- transfert Postiz ;
- aucun jargon technique.

Différence V2 : le mode Simple pourra s'appuyer sur la mémoire sémantique et des préférences, mais uniquement après validation de périmètre et consentement explicite.

## 3. Mode Studio Pro

Le mode Studio Pro est une interface avancée pour utilisateurs experts ou équipes créatives :

- timeline vidéo multi-scènes ;
- pistes audio séparées voix, musique, effets ;
- paramètres créatifs précis : durée, rythme, cadrage, transitions, grain, étalonnage, niveau de mix ;
- édition fine des sous-titres et des scènes ;
- comparaison de versions et branches créatives ;
- assistance Vululu contextuelle, sans masquer la complexité ;
- contrôle humain, snapshots et rollback.

Studio Pro n'est pas une obligation V1. Il ne doit pas contaminer l'expérience simple ni imposer une timeline aux utilisateurs novices.

## 4. Pause du player et pause de génération

La distinction est essentielle et s'applique dès la V1 :

- **Pause du player** : suspend la lecture d'un aperçu local. Elle n'arrête jamais une génération distante ni un coût en cours.
- **Pause d'une génération** : suspend réellement un job distant. Elle n'est affichée que si le moteur d'orchestration expose cette capacité et si la reprise est garantie.
- **Annulation** : arrête la génération, avec confirmation, conservation des étapes valides et explication du coût déjà engagé.
- **Arrêt sans pause** : si la pause n'est pas supportée, l'interface propose « Arrêter » puis « Relancer depuis la dernière étape valide ». Elle ne simule jamais une suspension.

Aucun bouton ne doit laisser croire qu'un clic arrête un coût fournisseur si ce n'est pas vrai.

## 5. Paramètres créatifs V2

Le mode Studio Pro pourra exposer :

- structure narrative et storyboard avancé ;
- durée par scène, transitions, rythme ;
- direction artistique, palette, lumière, cadrage ;
- voix, musique, effets, ducking, loudness cible ;
- sous-titres, typographie, position ;
- versions comparables et branches ;
- coûts estimés par scène et par provider.

Chaque paramètre devra être relié à une capability réelle. Aucun paramètre ne sera affiché s'il n'est pas applicable au provider ou au format.

## 6. Implications de données, sans schéma V1

À prévoir comme points d'extension, sans les implémenter :

- SceneVersion et CharacterVersion compatibles avec des paramètres créatifs supplémentaires ;
- ArtifactVersion et provenance pour les rendus Studio Pro ;
- timeline comme agrégat V2, sans casser les scènes V1 ;
- pistes audio comme entités V2, sans modifier le mix V1 ;
- snapshots de paramètres et de configuration ;
- coûts par scène et par étape.

Aucune table, aucun port, aucune dépendance V2 n'est créé en V1.

## 7. Gouvernance V2

- Toute fonctionnalité V2 exige une nouvelle validation de périmètre.
- Elle doit être documentée par un ADR V2.
- Elle ne doit pas casser les données V1.
- Elle ne doit pas être activée par défaut.
- Le mode Simple reste le mode par défaut ; Studio Pro est opt-in.

## 8. Questions ouvertes

- Faut-il un seul projet avec deux vues, ou deux modes séparés ?
- La timeline V2 est-elle une vue d'édition ou un modèle de données distinct ?
- Les pistes audio V2 sont-elles des artefacts ou des sous-objets de scène ?
- Comment préserver la compatibilité des masters V1 ?
- Quel niveau de contrôle exposer sans rendre l'interface experte ?
- Comment mesurer l'anti-enfermement créatif et la diversité des propositions ?

## 9. Statut

**PROPOSED / HORS V1**. Aucune implémentation, aucun schéma, aucun code. La note V2 existante reste la référence de vision ; ce document l'étend sans la réécrire.

## 10. Références

- [Note V2](NOTE_SPECIALE_PROPOSITIONS_V2.md)
- [Garde-fou V2](README.md)
- [Addendum UX-0](../backlog/UX0_ADDENDUM.md)
- [Rapport Mission 01](../foundations/01_CORPUS_AUDIT.md)
