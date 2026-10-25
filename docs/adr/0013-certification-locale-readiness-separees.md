# ADR-0013 — Certification architecturale locale et readiness de deploiement separees

- **Statut** : Acceptee sous condition
- **Date** : 2026-10-25
- **Sources** : ADR-0001 a ADR-0012, V1-01-G

## Contexte

La serie V1-01-A.1 a F a produit un socle local coherent mais non deploye. Une certification unique melangeant architecture et production serait dangereuse : un PASS local pourrait etre interprete comme une autorisation de deploiement alors que TLS, S3 de production, Hatchet engine, CI, supervision et restauration binaire ne sont pas valides.

## Decision

1. Produire deux verdicts separes : ARCHITECTURE_GO_CONDITIONNEL et DEPLOYMENT_NOT_READY.
2. Considerer le gate READY_FOR_PUSH_REVIEW comme une autorisation de revue humaine, pas de merge/deploiement.
3. Corriger les defauts structurants P0/P1 dans le perimetre autorise ; documenter les P1 restants.
4. Ne pas declarer une validation infrastructure non executee.
5. Ne pas pousser, merger ou deployer dans ce lot.
6. Conserver V0, main et toutes les branches historiques.

## Consequences

Positives : la fondation est revuable, les risques sont separes, la suite peut reprendre sans confusion entre code et infrastructure.

Negatives : le socle n est pas certifie production ; certaines validations restent des conditions ouvertes. Un futur lot infrastructure devra les fermer.

## Alternatives

- Un seul verdict GO : rejete car il masquerait les validations production manquantes.
- Attendre une infrastructure complete avant toute revue : rejete, la revue de code locale peut avancer.
- Declarer la CI locale equivalente a la CI GitHub : rejete.

## References

- docs/certification/V1_FINAL_CERTIFICATION.md
- docs/certification/V1_DEPLOYMENT_READINESS.md
- docs/certification/V1_TECHNICAL_DEBT_REGISTER.md
