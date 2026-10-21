# VULULU IA V2 — NOTE SPÉCIALE : propositions et idées utilisateur
**21 octobre 2026** · **Statut : réserve de vision — hors périmètre d'implémentation V1**

> **Décision explicite du porteur du projet : « laisse la mémoire pour la V2 ».** Les idées de mémoire ci-dessous sont préservées, **pas à coder maintenant**. Le seul « contexte » V1 est une fiche structurée confirmée par l'utilisateur, nécessaire pour produire.

## A. Memory Bank & mémoire sémantique hiérarchique — priorité conceptuelle V2
**Problème exprimé** : si un agent se souvient de tout ce qu'aime un utilisateur, il devient prisonnier de ses habitudes et fabrique toujours le même style. La mémoire doit être utile **sans enfermer la créativité**.

**Vision proposée par l'utilisateur** : une **grande mémoire sémantique** de la marque, des goûts et préférences, puis la capacité de créer **plusieurs contextes dérivés** : contexte d'un projet, contexte de style, contexte de campagne saisonnière (ex. hiver), contexte opérationnel précis. Un flux/une production choisit exactement le contexte utile ; plusieurs flux peuvent partager un contexte, un même client peut garder plusieurs univers créatifs en parallèle.

**Conception discutée** : une `Memory Bank` par contexte ou ensemble de contextes ; pas un agent mémoire omnipotent. Distinction entre mémoire de faits vérifiés sur la marque, mémoire de préférences choisies et mémoire créative expérimentale. Un futur agent/service de mémoire pourra proposer des rapprochements et suggestions ; **les apprentissages permanents ne sont promus qu'avec consentement explicite**. Les expériences éphémères ne réécrivent pas l'identité de marque. Chaque contexte a ID, parent éventuel, versions, propriété, droits, provenance ; l'héritage est **sélectif et configurable**.

**Trois modes approuvés pour V2** :
- **Fidèle à la marque** — sélection des faits, références, assets approuvés et styles habituels autorisés.
- **Exploration créative** — faits obligatoires conservés, préférences stylistiques assouplies, suggestions inattendues.
- **Rupture totale** — les éléments stylistiques passés n'orientent plus le rendu ; conservation des seules contraintes explicitement nécessaires (droits, vérité produit, sécurité, objectifs du brief).

**Points à explorer en V2, sans décision finale** : choix de pgvector/index hybride/graph de mémoire ; cycle consolidation/forgetting ; explicabilité « pourquoi ce souvenir a été utilisé ? » ; versionnement des souvenirs ; consentement et correction, suppression/portabilité ; isolation organisation/projet/personne ; pondération forte des instructions de création actuelles sur historique ; test de diversité créative et mesure d'anti-enfermement. Agent mémoire dédié **possible, mais non obligatoire** : préférer une `MemoryPolicy` explicite qui contrôle ingestion/recherche/promotion.

## B. Business model V2 — studio IA monétisable
L'utilisateur a évoqué les plateformes à crédits Artlist, Higgsfield, Luma et le principe de consommation d'IA. Les modèles économiques envisagés : **abonnement incluant des crédits de production**, packs supplémentaires, vente d'une production finalisée à l'unité, forfaits équipes/agences, paliers de qualité/temps ; afficher coûts estimés/consommés, marges et limites. **Ne pas assimiler automatiquement les crédits commerciaux aux « tokens » facturés réellement par les fournisseurs** : les coûts d'image/vidéo/TTS/rendu sont hétérogènes. Marges, tarifs, accords de revente, licence des outputs et prix restent **à étudier, aucun montant validé**.

**Préparation passive V1 :** compter coûts par run/agent/fournisseur/modèle, garder identifiants stables et journaux ; pas de paiement, wallet, tables d'abonnements ni contrôles d'entitlements commerciaux dans V1. Plus tard intégrer politique de quotas/crédits derrière une interface métier séparée.

## C. Everything LLM — écosystème élargi (V2)
Vision d'un environnement plus général « Everything LLM » interopérable avec d'autres agents, modèles, outils et usages, en extension au studio créatif. Ne pas ajouter en V1 une marketplace d'agents, chat universel, memory graph global ou protocole interagents complexe.

## D. Évolutivité préparée sans coder V2
**V1 prévoit** : `context_id` + révision, stable `project_id`/`scene_id`/`character_id`, `ArtifactVersion`, catalogue modèle/fournisseur versionné, trace coûts et capacités, Domain Core indépendant, API/MCP, workflow versionné. **V1 n'ajoute pas** : embeddings, Memory Agent, contexte hiérarchique sémantique, suggestions mémoire automatiques, base vectors par défaut, abonnements/crédits, marketplace, édition multi-organisation facturée.

## E. Questions de découverte V2 à garder ouvertes
S'assurer des droits d'exploitation commerciale des modèles ; tarification par outcome vs crédits ; comparaison de qualité et coûts ; rétention des créations ; permissions agence ; isolation clients ; benchmark contre services créatifs ; gouvernance anti-biais créatif ; règles de consentement mémorisation ; conditions de publication multi-canal.

## F. Pourquoi ce fichier séparé
Pour éviter que DeepSeek Harness et Codex confondent **vision future** et **backlog V1**, ce document est exclu des tickets P0/P1. Il sert de garde-fou stratégique et de contexte à une future phase de conception distincte. Toute fonctionnalité décrite ici nécessite **une nouvelle validation de périmètre**, pas une implémentation anticipée.
