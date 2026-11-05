# Vululu — Design System Bleu

Version 1.0.0 · 2026-11-05 · Direction choisie : troisième piste, atelier bleu affiné.

**Vululu : votre activité a son studio.** Contextes de marque/projet, flows, créativité et résultats utilisables. Public : indépendants débutants et professionnels expérimentés.

## Lire avant de toucher au frontend

Respecter d'abord AGENTS.md à la racine et les contrats produit applicables. Puis :
1. [Index et lecture ciblée](docs/design-system/README.md).
2. [Direction artistique](docs/design-system/BRAND.md).
3. [Règles UX](docs/design-system/UX.md).
4. Lire uniquement le contrat du composant ou de l'écran concerné.

## Invariants de design

- Interface claire : fond #F4F5F1, surfaces #FFFFFF, texte #172536, action #2347BE.
- Jaune #F5D867 en repère ponctuel. Typographie DM Sans, fallback système lisible.
- La création occupe le centre. Un seul sélecteur de scènes, sous l'aperçu.
- Réglages contextuels ; libellés complets ; une action principale par tâche.
- Même produit pour novices et pros : guidage facultatif, réglages avancés à la demande.
- Navigation : Mes projets / Marques et références / Mes créations.
- Le flow est une vue avancée du même projet, jamais un second projet à recréer.
- Pas de dégradés violet-cyan, halos, glassmorphism, orbes, étoiles IA, cartes imbriquées décoratives.
- Aucun faux état enregistré, coût réel, génération, publication ou capacité disponible.
- Cette livraison guide l'implémentation ; elle n'active aucune fonction ni aucun thème.

Sources numériques : [tokens.json](docs/design-system/tokens.json).
Styles de référence : [tokens.css](docs/design-system/tokens.css), non importés par l'application.
Prompt à donner à l'IDE : [IDE_PROMPT.md](docs/design-system/IDE_PROMPT.md).
