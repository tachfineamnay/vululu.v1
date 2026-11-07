# ADR 0025 — Invocations MOCK bornées et validées

- Date : 2026-11-05 ; statut : accepté pour la tranche 6F.
- Exigences : PRD-07/11/13/14, CDC-F-031/032/033/043/050/061, CDC-N-002/004/005/007.
- Complète ADR 0021 sans réécriture des snapshots historiques.

Une réponse de port typée TypeScript ne constitue pas une validation d’exécution. Le routeur acceptait une identité de modèle différente ou un résultat non MOCK ; une promesse sans réponse pouvait bloquer l’étape. Les routeurs applicatif et durable partagent désormais une tentative bornée et validée dans l’Application Layer.

Le délai par défaut de 5000 ms est capturé au lancement. Les politiques historiques contenant déjà executionPolicy mais sans ce champ utilisent ce même défaut de compatibilité ; aucune empreinte enregistrée n’est réécrite. Les scénarios de panne existants et les listes de modèles simulant timeout/résultat invalide sont figés dans le snapshot, sans lecture d’environnement par le worker. Ces scénarios restent sans réseau.

Le port reçoit un AbortSignal. À expiration, la réponse est abandonnée et l’adaptateur MOCK annule son attente. Le routeur tente au plus un fallback admissible selon droits et budget figés. Sans fallback, il conserve le code d’échec initial. Une réponse tardive ou invalide ne valide aucune étape et ne crée aucun coût de succès. Le workflow durable continue à utiliser le tarif du catalogue MOCK figé et son checkpoint idempotent.

Le résultat doit porter mock=true, les identités sélectionnées, un coût entier sûr non négatif, une latence finie non négative et un objet output JSON de 65536 octets au maximum, sans valeur perdue par sérialisation. Les messages d’erreur du fournisseur ne sont pas propagés : les codes et messages applicatifs sont fixes. La cause primaire est conservée comme code dans la politique de fallback.

Cette borne limite l’attente et le résultat métier ; elle ne peut pas tuer une implémentation de port qui ignore l’annulation. Les seuls adaptateurs utilisés ici sont MOCK et sans effet distant. Aucun fournisseur réel, facturation réelle ou mécanisme de compensation distante n’est qualifié par cette décision.
