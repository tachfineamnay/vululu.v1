# V1-01-F — RATE LIMITS, BUDGETS ET CONCURRENCE

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Rate limiting persistant

RateLimitCounter :

- key primaire
- count
- windowStart
- expiresAt
- updatedAt

Increment atomique PostgreSQL, reset de fenetre, index expiration. Plusieurs instances API partagent le meme backend PostgreSQL.

## 2. Politiques

| Operation | Limite | Fenetre | Mode panne |
|---|---|---|---|
| login | 100 | 60 s | fail-closed |
| activation | 50 | 300 s | fail-closed |
| storyboard | 20 | 60 s | fail-open |
| production start/correction | 10 | 60 s | fail-open |
| approve/transfer | 20 | 60 s | fail-open |
| routing preview/execute | 60 | 60 s | fail-open |

Variables RATE_LIMIT_LOGIN, RATE_LIMIT_ACTIVATION, RATE_LIMIT_STORYBOARD, RATE_LIMIT_PRODUCTION_START, RATE_LIMIT_APPROVE, RATE_LIMIT_ROUTING. RATE_LIMIT_ENABLED=0 desactive explicitement en developpement. RATE_LIMIT_FAIL_MODE configure le defaut.

## 3. Dimensions

- identite utilisateur pour les routes authentifiees ;
- IP pour login/activation, avec TRUST_PROXY configure ;
- operation/capability ;
- projet pour produce/correct/approve.

La concurrence metier reste garantie par l index unique d un JobRun actif par projet (D/E) ; ce n est pas un rate limit.

## 4. Budgets et couts

- Routing B porte les budgets mock.
- Le refus budget intervient avant effet media.
- CostEvent.idempotencyKey evite le double comptage.
- Les couts restent mock ; aucune facturation client, Stripe, credit ou abonnement.
- La garantie budget est une garantie de decision applicative, pas une mesure de consommation fournisseur reelle.

## 5. Preuves

- Test F rate limiter : deux appels autorises, troisieme refuse, retryAfter > 0, une seule ligne DB.
- Test D fallback et refus budget deja PASS.
- Test E production/couts idempotents deja PASS.
- La route login applique le preHandler rate limit avec cle IP+email.

## 6. Limites

- Un rate limit distribue n a pas ete teste sous charge multi-instance.
- Une panne du backend limite les logins (fail-closed) ; c est un choix de securite, a documenter en operations.
- Les budgets ne peuvent pas etre plus precis qu un provider mock sans mesure d usage reelle.
