# Intégration dans Vululu

## État inspecté

Base : codex/v1-demo-coolify, commit 391e11f6e0e9fb610200e34ba97e1c2aaaa6b152.
Frontend : apps/web, Next.js 16.4.2, React 19, TypeScript, CSS existant ; aucune dépendance Tailwind ou shadcn dans apps/web/package.json.
Le fichier apps/web/app/globals.css porte encore couleurs sombres, violet/cyan, gradients et halos.
Les composants Studio/admin et leurs contrats existent. Les adapter, ne pas reconstruire toute la stack.

## Correspondances

| Zone existante | Usage pour la migration |
|---|---|
| apps/web/components/StudioNav.tsx | Navigation globale |
| apps/web/components/ProjectStudio.tsx | Atelier projet et scènes |
| apps/web/components/admin/Fields.tsx | Champs existants à rendre cohérents et accessibles |
| apps/web/components/admin/ConfirmDialog.tsx | Confirmer les actions sensibles |
| apps/web/components/admin/StatusBadge.tsx | États métier |
| apps/web/app/globals.css | Style partagé à découper/préciser progressivement |
| apps/web/app/layout.tsx | Langue, polices, bannière démo à conserver |
| apps/web/lib/studio.ts | Disponibilité réelle des capacités |

Les chemins sont un inventaire de départ ; relire les fichiers sur le checkout effectif avant modification.

## Ordre recommandé

1. Inventorier la route ciblée, ses données, ses handlers, ses états et ses tests ; capturer l'avant.
2. Raccorder les tokens sous un scope explicite, par exemple data-vululu-theme=blue sur le shell ciblé. Ne pas injecter un reset global dans l'admin ou le login par accident.
3. Corriger d'abord boutons/champs/focus et contraste de cette route.
4. Migrer navigation, projet, aperçu, unique bandeau de scènes et inspecteur.
5. Migrer les autres routes une par une ; vérifier le mode démo et les écrans admin sensibles.
6. Retirer les règles anciennes seulement quand leur usage est nul et la régression vérifiée.
7. Enregistrer les preuves avant/après et les limitations ; déploiement traité séparément.

## Styles fournis

tokens.css est une source de référence non importée.
Son sélecteur data-vululu-theme=blue limite la portée ; ajouter cet attribut volontairement au moment du raccordement.
Il fournit tokens, focus, boutons et champs de référence, pas une librairie UI complète.
Ne pas plaquer simultanément classes legacy contradictoires et classes nouvelles sans vérifier la cascade.
Rester en CSS et React existants ; aucune dépendance nouvelle nécessaire pour suivre la DA.
Polices : ajouter seulement après choix d'une source locale/licence et contrôle du build ; le fallback doit rester propre.

## Capacités présentes et cible de conception

| Sujet | Consigne |
|---|---|
| Versions/scènes/QA | Préserver les vraies entités et leurs IDs |
| Enregistré | Confirmer via le vrai mécanisme de persistance, pas setTimeout |
| Trois scènes de la maquette | Fixture visuelle ; nombre et durée viennent des données |
| Audio et styles de texte | Vérifier disponibilité avant contrôles actifs |
| Flow éditable | Cible ; pas de faux canvas connecté |
| Déclinaisons | Pas de génération multi-format fictive |
| Export | Utiliser la route autorisée existante |
| IA et coûts | Distinguer mock/démo et données réelles |
| Postiz | Transfert exact après approbation ; ne pas annoncer une publication |
| Billing et mémoire | Hors lot design, aucune implémentation anticipée |

## Vérifier localement

Respecter les commandes et prérequis du dépôt :
- node docs/design-system/scripts/check.mjs
- pnpm typecheck
- pnpm lint (LINT_STRICT=1 selon le shell)
- pnpm build
- tests ciblés de la route, puis scénario E2E approprié
- pwsh -File scripts/check-secrets.ps1
- pwsh -File scripts/verify-foundation-docs.ps1
- git diff --check

Ni GitHub Actions ni GitLab ne sont nécessaires pour préparer les preuves locales.
Les commandes ne sont pas déclarées exécutées par leur présence ici.
Le rollback d'une tranche visuelle restaure son commit ; aucune suppression de données ni migration nécessaire à la charte.
