# Vululu AI — Vision d'expérience : partenaire créatif, pas logiciel à piloter

**Décision produit du 20 novembre 2026 — cadrage conceptuel, non spécification d'implémentation.**

## 1. Promesse utilisateur

Vululu accompagne les entrepreneurs et indépendants dans leur communication. Le produit doit être **simple, efficace, rapide et créatif** : moins de décisions techniques, de meilleurs choix créatifs, un résultat réellement utilisable.

Un utilisateur sans compétence en design, montage, marketing ou IA doit pouvoir avancer naturellement, sans connaître les modèles, les outils, les paramètres ou l'architecture.

**Rôle central de l'IA : simplifier les écrans et le travail de l'utilisateur, pas ajouter des écrans.** Vululu se comporte comme un partenaire de création qui écoute, propose, prépare et aide à décider. Il ne remplace pas le jugement du client.

## 2. Séquence mentale d'une campagne

Le chemin conceptuel à respecter est :

1. **Intention : « Que veux-tu faire ? »** L'utilisateur exprime librement son objectif, en termes simples.
2. **Canal : « Où ? »** Instagram, TikTok, LinkedIn ou une autre destination réellement prise en charge.
3. **Format : « Sous quelle forme ? »** Par exemple Reel Instagram, vidéo TikTok, slides/carrousel TikTok ou image ; seules les capacités effectivement disponibles sont proposées.
4. **Brainstorming avec l'agent.** Vululu échange sur le message, le public et les angles possibles ; il ne transforme pas immédiatement une phrase en résultat figé.
5. **Références et assets.** L'utilisateur fournit ou sélectionne photos, logo, éléments de marque et références qu'il souhaite employer. Réutiliser les éléments déjà autorisés.
6. **Propositions créatives et directions artistiques.** L'agent élabore plusieurs idées/DA ancrées dans l'identité confirmée du client, explicables et faciles à comparer.
7. **Choix humain.** L'utilisateur accepte, rejette ou demande une variation ; ses choix orientent la suite, sans imposer une succession de réglages techniques.
8. **Production et édition adaptées au média.** Une fois une direction choisie, le schéma spécifique à l'image, à la vidéo ou à l'audio s'ouvre seulement lorsque nécessaire.
9. **Relecture et validation exacte.** Prévisualisation, correction, comparaison, approbation explicite ; la publication ou une dépense externe requiert toujours les autorisations applicables.

Ces étapes sont un **modèle de conversation et de décision**, pas neuf pages obligatoires : les étapes simples peuvent tenir sur un même écran. L'agent peut regrouper ou différer les questions si le contexte confirmé fournit déjà les réponses. Canal puis format précèdent le brainstorming approfondi.

## 3. Principe directeur : « brouillon permanent »

Tout travail créatif reste un **brouillon éditable** tant que son auteur n'a pas approuvé explicitement une version précise.

- Les idées, DA, scènes, visuels et variantes peuvent être refusés ou retravaillés sans perdre les propositions précédentes.
- Les états et versions demeurent compréhensibles ; revenir en arrière ne requiert pas de recommencer une campagne.
- Une validation porte sur un artefact/version exact ; une correction ultérieure engendre une nouvelle version.
- « Permanent » décrit la **liberté de modifier**, pas une sauvegarde infinie ou une conservation sans limite. La persistance, la rétention et la suppression suivent les règles du produit.
- Télécharger, exporter, payer ou publier ne doit jamais être présumé à partir d'une simple proposition.

Vululu n'est **pas un clone d'éditeur générique ni un générateur de visuels à bricoler** : la campagne et son objectif restent au premier plan. Les outils d'édition précis sont accessibles lorsque l'utilisateur en a besoin.

## 4. Interaction : guider sans enfermer

- Une question ou une décision principale à la fois lorsque c'est utile ; aucun questionnaire interminable.
- L'IA propose au lieu de demander à l'utilisateur de configurer dix paramètres.
- Des choix concrets et visuels remplacent autant que possible les termes techniques.
- Le contrôle humain reste réel : choisir, corriger, refuser, comparer, valider.
- Le mode expert ne disparaît pas : édition directe des images, scènes et vidéos, sans rupture entre les deux expériences.
- Ne jamais cacher les informations nécessaires au consentement : coût, portée de la modification, permissions et état de diffusion.
- Pas de fausse créativité : les directions artistiques doivent s'appuyer sur les références et l'identité effectivement fournies, pas inventer l'activité ou les offres.

## 5. Progression par média

**Première priorité de conception : l'image.** Préciser l'expérience de propositions, DA, choix, génération/composition et édition d'images avant de généraliser.

**Ensuite : la vidéo.** Un schéma de travail spécifique à la narration, aux scènes, à la timeline, aux mouvements, au rythme, aux reprises et aux corrections ciblées.

**Puis : voix off/audio.** Ajouter un parcours dédié pour TTS, voix, langue, lecture, synchronisation et mixage avec consentement et droits d'usage appropriés.

Ces priorités sont **de conception et d'affinage**, pas des déclarations que la production vidéo existante doit être supprimée ou que les fournisseurs TTS sont déjà choisis ou opérationnels. Les pipelines déjà implémentés restent conservés jusqu'à décision technique explicite.

## 6. Conséquences pour l'architecture et l'UI

- **Une campagne / un projet** constitue le fil conducteur : objectif, destination, format, brainstorming, assets, propositions, révisions et résultat.
- L'identité et les assets sont des données **confirmées et réutilisables**, pas une mémoire implicite non consentie.
- L'assistant rend le parcours plus court et contextualisé ; l'interface n'expose pas la complexité des workflows ou des modèles par défaut.
- Les propositions créatives sont des objets persistants et versionnables ; une direction refusée ne détruit pas le travail.
- Chaque média garde son propre moteur et ses contrôles d'édition quand cela est pertinent ; l'expérience utilisateur reste cohérente.
- Les capacités et coûts sont basés sur l'exécution réellement disponible. Aucun fournisseur MOCK n'est présenté comme actif.
- L'édition avancée complète la voie guidée, elle n'est ni obligatoire ni supprimée.
- Réutiliser CreativeSpec, CreativeAction, les versions, le Studio, le calendrier et les budgets existants avant d'inventer des structures supplémentaires.

## 7. Questions à garder ouvertes

- Comment présenter les propositions de DA sans surcharger l'écran ?
- Combien d'alternatives créatives afficher au départ, et comment les comparer ?
- À quel moment l'utilisateur souhaite-t-il intervenir dans les détails d'image, de vidéo ou de voix ?
- Quel schéma d'édition précis retenir pour l'image, puis pour la vidéo et le TTS ?
- Quels besoins remontent des essais avec des entrepreneurs non techniciens ?

Ne pas transformer ces questions ouvertes en spécifications ou choix définitifs sans validation.

## 8. Portée

Ce document fixe **l'esprit produit et les règles de conception**. Il ne demande pas de migration, de code, de nouveau fournisseur, d'appel API payant, de modification de tarification ni de déploiement. Les exigences de sécurité, d'approbation humaine, de versions immuables, de véracité des capacités et de coûts maîtrisés restent en vigueur.

**Phrase-guide :** *« Tu me dis ce que tu veux faire et où. Vululu brainstorme avec toi, propose des directions artistiques à partir de ton identité, prépare des brouillons, et tu choisis. L'IA simplifie tout le parcours. »*
