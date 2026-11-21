# ADR-0050 — Autorité serveur sur les propositions d'outils de l'agent

- **Statut** : Acceptée
- **Date** : 2026-11-21
- **Décideurs** : porteur produit + ingénierie Vululu (mission P12-06)
- **Sources** : ADR-0008 (registre de capacités), ADR-0036 (exécution outillée agentique), ADR-0046, `docs/delivery/P12-06_AGENT_TOOL_EXECUTION.md`.

## Contexte

L'agent peut recommander des outils, mais seuls le serveur et l'humain autorisent l'exécution. L'audit de la
chaîne (recommandation → validation de schéma → proposition persistée → autorisation → réservation → claim →
règlement) a montré trois brèches :

1. La route `POST /api/projects/:projectId/execution/agent` validait seulement la présence d'un schéma de
   paramètres : un outil marqué `agentProposable: false` (édition d'image, transcription, TTS) aurait donc pu
   être proposé depuis un tour d'agent ancien ou forgé, alors que le registre le réserve à l'utilisateur.
2. Le broker `proposeTx` faisait confiance à son appelant : les paramètres n'étaient ni revalidés ni liés à la
   sélection de ressources confirmée. Une proposition pouvait être créée avec une ressource non confirmée
   (exécution vouée à l'échec après autorisation humaine).
3. Les recommandations du modèle étaient filtrées par nom d'outil seulement : des paramètres non conformes
   étaient persistés puis présentés à l'utilisateur.

## Décision

1. **Politique pure unique** (`application/agentProposalPolicy.ts`) : outil inconnu → `403 tool_unknown` ;
   sans schéma de paramètres ou `agentProposable: false` → `403 tool_not_proposable` ; portée `revision` →
   `409 agent_scope_unsupported` (l'agent ne connaît aucune révision autorisée). Ordre déterministe, testable
   sans base.
2. **Trois points d'application** : le registre expose `isAgentProposable`/`toolPolicy`, la route agent refuse
   avant de parser, le broker `proposeTx` refuse aussi (défense en profondeur, tout appelant confondu).
3. **Paramètres revalidés côté serveur** : au broker, les paramètres d'une proposition (agent ou non) sont
   validés par le schéma Zod de l'outil, et **la valeur validée** est celle hachée puis exécutée — aucune
   divergence entre le digest autorisé et les paramètres exécutés.
4. **Ressource confirmée obligatoire** : pour une portée `assets`, `versionId` doit appartenir à la sélection
   confirmée (`ProjectAssetSelection`) → `422 asset_not_confirmed` sinon.
5. **Filtrage au stockage** : une recommandation du modèle n'est persistée que si l'outil est dans le catalogue
   agent et que ses paramètres passent le schéma ; sinon repli déterministe, jamais une recommandation invalide.
6. **UI honnête** : une estimation n'est plus affichée comme un débit (`ESTIMATED`/« estimation, non facturée »),
   un échec n'affiche plus de « résultat structuré », une issue incertaine indique que rien n'est un succès.

## Conséquences

- **Positives** : l'agent ne peut plus proposer un outil réservé ni des paramètres invalides ; une autorisation
  humaine porte sur des paramètres revalidés et sur une ressource confirmée ; l'interface ne suggère plus un
  succès ou un débit inexistants.
- **Négatives / coûts** : une recommandation dont les paramètres sont invalides disparaît silencieusement du
  tour (repli déterministe) au lieu d'être signalée comme invalide ; un aller-retour SQL supplémentaire par
  proposition (comptage de sélection).
- **Sécurité** : registre toujours fermé et versionné ; aucun outil défini par l'utilisateur, aucun HTTP,
  Python, shell ou SQL arbitraire ; l'agent ne contourne ni budget, ni approbation, ni propriété.

## Alternatives envisagées

- **Valider seulement dans la route** : rejeté — le broker resterait contournable par un futur appelant.
- **Faire confiance aux paramètres déjà parsés par la route** : rejeté — un digest doit couvrir la valeur
  réellement exécutée.
- **Autoriser les outils `agentProposable: false` avec approbation** : rejeté — le registre déclare ces actions
  réservées à l'utilisateur ; l'agent ne doit pas les déclencher, même avec accord.
- **Signaler les recommandations invalides dans l'UI** : rejeté pour ce lot (bruit), documenté comme limite.

## Références

- ADR-0008, ADR-0036, ADR-0046
- [Preuves P12-06](../delivery/P12-06_AGENT_TOOL_EXECUTION.md)
