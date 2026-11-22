# ADR-0043 — Administration des agents, outils et capacités

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P11-B)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0036 (exécution outillée), ADR-0037 (boîte à outils Python), ADR-0038 (Gemini Image), ADR-0041 (audio), mission P11-B.

## Contexte

L'administration exposait les agents (rôles, configurations versionnées, promotion/rollback), les fournisseurs et modèles (activation, qualification, credentials) et les invitations. Elle ne montrait pas : le catalogue réel des outils exécutables avec leurs permissions, la disponibilité effective des capacités (au-delà de « fournisseur actif en base »), ni la politique d'exécution d'un compte. Les capacités Python (P05/P06, audio en P09B) existaient dans le registre serveur mais n'étaient pas visibles côté administration.

La mission P11-B exige un affichage et un contrôle réels, sans créer un second registre, sans autoriser des définitions arbitraires, sans exposer de jeton, sans présenter un fournisseur MOCK ou non configuré comme disponible, et en préservant ToolBroker, Hatchet et l'autorisation existante.

## Décision

1. **Un seul registre** : l'administration lit le registre fermé `tools` (identités versionnées, schémas de paramètres) via une route super-admin en lecture seule `GET /api/admin/tools`. Aucun second registre, aucune définition d'outil créée ou modifiée depuis le navigateur ; les paramètres d'agent restent validés par les schémas du registre.
2. **Disponibilité dérivée de la configuration, jamais sondée** : `availability` est calculée par les fonctions existantes (drapeaux et credentials média, édition d'image, audio, publication Postiz, assistant Vertex, configuration Python interne). Les valeurs sont `configured` (configuré, non sondé), `disabled`, `missing_credential` ou `local` (déterministe). Aucun appel payant, aucun jeton renvoyé ; un fournisseur désactivé n'est jamais présenté disponible.
3. **Capacités Python dans le catalogue existant** : `image.analyze@1`, `image.segment@1`, `audio.analyze@1` figurent comme les autres outils, avec fournisseur `python-tools@1` et disponibilité liée à la configuration du service interne. Aucun appel dynamique au catalogue Python.
4. **Activation/qualification inchangées** : les routes existantes (activation fournisseur/modèle, qualification, credentials) restent l'unique moyen de modifier l'état ; la disponibilité affichée ne remplace ni la qualification ni l'activation.
5. **Politique d'exécution par compte en lecture + écriture existante** : `GET /api/admin/execution/accounts` et `/:account` exposent plafond, réservé, dépensé, état et outils autorisés ; l'écriture reste le `PUT` existant, contraint au registre fermé. Le broker applique toujours `tool_disabled`, le budget, l'approbation humaine et l'isolation.
6. **Interface reliée au serveur** : page Agents (catalogue outils/permissions, politique d'exécution avec sélection d'outils), page Fournisseurs (disponibilité réelle par fournisseur). Chaque contrôle appelle une route réelle ; aucun contrôle factice.

## Conséquences

- **Positives** : visibilité complète et honnête des capacités, du catalogue et des restrictions ; activation d'outil par compte contrôlée et auditée ; aucune duplication du registre ; ToolBroker/Hatchet conservés ; aucun secret exposé.
- **Négatives / coûts** : la disponibilité décrit une configuration, pas une preuve d'appel (libellé explicite) ; l'administration ne crée pas d'agent ni d'outil (registre fermé) ; la politique par compte exige de connaître l'identifiant utilisateur ; les capacités Python restent dépendantes du service interne.
- **Sécurité** : routes super-admin uniquement ; aucune valeur secrète ; écriture bornée aux identités du registre ; le broker reste l'autorité finale.

## Alternatives envisagées

- **Découvrir dynamiquement le catalogue Python** : rejeté, second registre de fait et dépendance réseau.
- **Sonder chaque fournisseur** : rejeté, coût et appels réels non autorisés.
- **Créer des outils depuis l'admin** : rejeté, rupture du registre fermé et de l'autorisation.
- **Afficher les credentials** : refusé par principe (aucun secret dans l'interface).

## Références

- `apps/api/src/infrastructure/execution/{registry,broker}.ts`, `apps/api/src/routes/{adminAgents,execution}.ts`
- `apps/api/src/infrastructure/{mediaGeneration,imageEditing,audio,python,publishing}/*`
- `apps/web/app/admin/agents/page.tsx`, `apps/web/app/admin/fournisseurs/page.tsx`, `apps/web/lib/admin.ts`
