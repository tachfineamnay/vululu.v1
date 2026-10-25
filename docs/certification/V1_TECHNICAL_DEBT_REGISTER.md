# V1 — REGISTRE DE DETTE TECHNIQUE

- **Date** : 2026-10-25
- **Commit code G** : 0e79c08

## 1. P0 — bloquants

Aucun P0 ouvert apres correction.

Defauts P0/P1 detectes pendant G et corriges :

| ID | Defaut | Correction |
|---|---|---|
| G-FIX-01 | Approval outbox pouvait cibler le dernier JobRun du projet au lieu du run d origine | utilisation de row.jobRunId quand present |
| G-FIX-02 | Finalisation pouvait marquer une version ready sans ArtifactObject mis a jour | updateMany count=1, rollback sinon |
| G-FIX-03 | Acces media ignorait storageProvider et ne pouvait pas relire un backend historique | registre local/S3 + erreur provider indisponible |
| G-FIX-04 | Range legacy invalide retombait en 200 complet ; erreur storage mappee 416 | parser byteRange unique, 416 correct, erreurs storage propagees |
| G-FIX-05 | Ops health crashait si PostgreSQL indisponible | snapshot degrade sans requetes secondaires |
| G-FIX-06 | Reconciliation apply pouvait reclaim des dispatch actifs avec seuil 0 | seuil staleSeconds applique |
| G-FIX-07 | CI lint/test gates obsoletes | lint strict + docs + tests v1 complets |
| G-FIX-08 | DurableRoutingService dependait du mock concret | injection CapabilityProviderPort optionnelle |
| G-FIX-09 | Version master invalide produisait 500 | validation 400 |
| G-FIX-10 | Evidence run inconnu projet pouvait produire 500 | 404 explicite |

## 2. P1 — structurants

| ID | Dette | Impact | Cause | Traitement / condition |
|---|---|---|---|---|
| P1-01 | Dispatch Hatchet au moins une fois | doublon de workflow possible apres crash entre submit et update outbox | pas d idempotency key SDK | test de panne controlee ; idempotence metier DB ; G-ops |
| P1-02 | Provider IA mock uniquement | pas de cout reel, usage, licence reelle | perimetre B mock | contrat provider reel + quotas avant production |
| P1-03 | Worker non supervise automatiquement | indisponibilite detectee mais non redemarree | pas de service manager | systemd/K8s en deploiement |
| P1-04 | Redemarrage moteur Hatchet non certifie | reprise en vol inconnue | environnement local | test infrastructure G/ops |
| P1-05 | S3 de production non certifie | TLS/IAM/SSE/policies non valides | pas d objet store prod | validation infra avant deploy |
| P1-06 | CI GitHub non executee | gate distant inconnu | aucun push autorise | etape humaine push/CI |
| P1-07 | Restauration binaire S3 non testee | restauration metadonnees seule prouvee | pas de copie binaire prod | test restore artefacts |
| P1-08 | Rate limits multi-instances non charges | comportement sous concurrence inconnu | environnement local | test de charge |
| P1-09 | Budgets et couts mock | garanties limitees a la decision applicative | pas de mesure fournisseur | provider usage reel |
| P1-10 | Dispatch/outbox terminal failed sans auto-relance | run peut attendre une intervention | securite anti-double production | procedure ops explicite |
| P1-11 | Provider CapabilityResult type mock true | extension provider reel necessite evolution du contrat B | perimetre initial mock | ADR contrat provider reel |
| P1-12 | Binaires historiques non migres massivement | double backend possible | migration progressive | plan par lots verifie |

## 3. P2 — non bloquants

- Pas de MFA.
- Pas de dashboard Grafana/OpenTelemetry exporte.
- Purge des RateLimitCounter seulement via reconciliation apply/admin.
- Nettoyage des WorkerHeartbeat anciens non automatise.
- Nettoyage des ArtifactObject staged/orphelins non execute (inventaire read-only).
- Pas de site Astro, MCP, Postiz reel, TTS, musique, compositing.
- Pas de test de charge, pas de Docker/Linux runtime.
- Logs de test volumineux.
- Documentation de deploiement a maintenir.

## 4. Regle

Aucune dette P0 ne doit rester ouverte avant une revue de push. Les P1 doivent rester visibles dans la decision de deploiement ; ils ne bloquent pas une revue de code locale.
