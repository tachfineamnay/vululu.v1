# V1 — MATRICE DES CAPACITES

- **Date** : 2026-10-25
- **Commit code G** : 0e79c08

## 1. Capacites presentes

| Capacite | Etat | Contrats / modules |
|---|---|---|
| Auth sessions serveur | PASS | Session, cookies, CSRF, RBAC |
| Invitations / activation | PASS | Invitation, routes auth |
| Contexts / briefs versionnes | PASS | ContextRevision, BriefRevision |
| Personnages / scenes | PASS | CharacterVersion, SceneVersion |
| Storyboard 5 scenes | PASS | StoryboardUseCases |
| Production 10/50 s | PASS local | Durable pipeline, media |
| Correction SCENE-003 | PASS | Production correction |
| QA | PASS | MediaRenderer, QA report |
| Approbation exacte | PASS | Approval, checksum, invalidation |
| Transfert Postiz | MOCK | PostizMockAdapter, aucun reseau |
| Routing provider | MOCK | ProviderCatalog, RoutingDecision |
| Fallback mock | PASS mock | RoutingUseCases, durable routing |
| Budget mock | PASS mock | Budget policy, CostEvent |
| Stockage local | PASS | LocalFilesystemArtifactStorage |
| Stockage S3-compatible | PASS local experimental | S3CompatibleArtifactStorage, rclone |
| Provenance / manifest | PASS | RunArtifact, ArtifactVersion.manifest |
| Ordonnancement durable | PASS local | Hatchet + outbox + worker |
| Reprise worker | PASS D/E | StepRun outputs, RunArtifact |
| Securite media / Range | PASS | ArtifactAccess, 416, owner |
| Rate limiting distribue | PASS local DB | RateLimitCounter |
| Observabilite | PASS local | traceId, logs JSON, ops |
| Reconciliation | PASS read-only | RuntimeReconciliationService |
| Lint strict / build | PASS | voir preuves |

## 2. Capacites mocks

- Provider IA : MockCapabilityProvider, DeterministicProviderAdapter. Aucun appel payant, aucun modele reel, aucun cout reel.
- Postiz : PostizMockAdapter, statut submitted -> acknowledged local, aucune publication.
- Budgets : politiques et CostEvent mock, pas de facturation ni mesure fournisseur reelle.
- S3 : serveur rclone local experimental, pas de certification de production.

## 3. Capacites futures et contrats necessaires

| Future | Contrat deja prevu | A implementer |
|---|---|---|
| Provider image reel | ProviderPort / CapabilityProviderPort | adaptateur, credentials, quota, usage |
| Provider video | MediaRendererPort / capability | adaptateur video, duree, resolution |
| TTS | MediaRendererPort ou port dedie | audio, voix, licences |
| Musique | port media dedie | licences, mixage |
| Compositing | MediaRendererPort | timeline, effets |
| MCP | contrats application + RBAC | serveur MCP, scopes |
| Postiz reel | PostizPort | OAuth, idempotency, webhooks |
| Site Astro | OpenAPI/contrats HTTP | projet Astro separe, SEO |

## 4. Propriete d extensibilite provider

L ajout d un provider compatible se fait par un adaptateur d infrastructure implementant un port existant, puis par injection dans le composition root :

- Domain Core inchange ;
- workflow media inchange ;
- contrats Application inchanges ;
- nouveau provider selectionne par le catalogue et le routing.

Limites : le resultat de CapabilityProviderPort est encore type MOCK (mock: true) dans le socle B ; un provider reel devra etendre ce contrat (usage, latence, cout, licence) avant facturation. Ce point est une dette P1, pas une reecriture du Domain.

## 5. Non-capacites explicites

- Pas d autonomie agentique complete.
- Pas de planification DAG generique.
- Pas de memoire V2, embeddings, credits, abonnements, marketplace.
- Pas de publication sociale reelle.
- Pas de deploiement public.
