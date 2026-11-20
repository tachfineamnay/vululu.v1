# ADR-0036 — Exécution outillée agentique contrôlée

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Décideurs** : porteur produit + ingénierie Vululu (campagne P05)
- **Sources** : [Contrat de finition](../implementation/VULULU_FINISH_CONTRACT.md), ADR-0008 (registre agentique), ADR-0010 (outbox durable), ADR-0034 (assistant Vertex), mission P05 (couche d'exécution outillée).

## Contexte

Le produit doit laisser l'agent (Vertex) recommander des actions outillées sans jamais lui donner d'exécution arbitraire. L'infrastructure ToolBroker/ExecutionOperation/Hatchet existe déjà (proposition, approbation humaine, réservation de budget, claim unique, réconciliation, incidents). P05 doit l'étendre — et non le remplacer — pour : des propositions structurées issues de l'IA, des paramètres validés côté serveur, des outils exécutables avant toute révision créative (périmètre ressources), un comportement multi-étapes borné, des résultats structurés, et une API prête pour les outils Python de P06.

## Décision

1. **Le registre outillé reste fermé et versionné** : chaque outil porte `action`, `maxCents`, `scope` (`project` | `assets` | `revision`), `approval` (`auto` | `human`) et, s'il est proposable par l'agent, un **schéma Zod de paramètres**. Aucun outil ne reçoit de shell, de système de fichiers, de Python arbitraire, de HTTP libre ou de SQL.
2. **L'agent recommande, Vululu autorise** : le tour d'assistant `agent` produit `agentOutput` (réponse + ≤4 recommandations `{tool, params, reason}`). La conversion en `ExecutionOperation` est un appel utilisateur séparé qui revalide le schéma de l'outil, calcule le digest sur les paramètres canoniques et passe par le broker existant (PROPOSED → approbation humaine si `approval:human`, réservation, exécution).
3. **Périmètre sans révision créative** : les outils `scope:'assets'` exigent la décision de ressources confirmée (P02) et le propriétaire, mais aucune `CreativeRevision` ; `scope:'project'` exige seulement le projet. Les outils existants conservent `scope:'revision'` et leurs contrôles.
4. **Exécution bornée** : le worker Hatchet existant reste l'unique moteur ; aucun nouveau workflow engine. Les tours `agent` sont chaînés par `parentId` avec un plafond de 6 étapes consécutives (`agent_steps_exhausted`).
5. **Résultats structurés** : `ExecutionOperation.result` (JSONB, plafonné à 32 Kio) porte le résultat vérifié ; les échecs déterministes produisent un état `FAILED` à coût nul, distinct des issues incertaines `UNKNOWN`.
6. **P06** : les outils Python s'enregistrent dans le registre (schéma de paramètres) plus un cas de dispatch dans le moteur ; aucun changement de broker ni de worker requis.

## Conséquences

- **Positives** : séparation recommandation/autorisation explicite ; paramètres validés et digestés ; idempotence conservée ; aucun effet payant dupliqué ; statut réel exposé au projet ; surface d'exécution fermée.
- **Négatives / coûts** : deux nouveaux champs JSON sur `ExecutionOperation` ; la validation des paramètres des futurs outils incombe à leur enregistrement (revue humaine).
- **Sécurité** : aucune capacité réseau/OS n'est ajoutée ; les résultats ne contiennent que les données du propriétaire ; l'approbation humaine reste requise pour les outils générateurs/écrits.

## Alternatives envisagées

- **Exécution libre par l'agent (fonctions Python/SQL/shell)** : rejetée — incompatible avec l'isolation locataire et le principe « jamais d'exécution arbitraire ».
- **Nouveau moteur de workflow agentique** : rejetée — le broker + Hatchet existants couvrent claim unique, budget, réconciliation et reprise.
- **Paramètres non validés stockés tels quels** : rejetée — les paramètres doivent être bornés et digestés avant toute réservation.

## Références

- `apps/api/src/infrastructure/execution/` (registry, broker, runtime)
- `apps/api/src/worker/main.ts`, `apps/api/src/infrastructure/assistant/` (service, vertex, safety)
- ADR-0008, ADR-0010, ADR-0034, [mission P05](../implementation/VULULU_FINISH_CONTRACT.md)
