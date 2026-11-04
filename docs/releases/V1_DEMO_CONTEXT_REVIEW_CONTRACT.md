# V1-DEMO — Contexte relu et proposition simulée

- Date : 2026-11-04 ; complément du lot 5.
- Exigences : PRD-02, CDC-F-010/011/012, CDC-N-001/002/003/005.

GET /api/contexts/:id/review expose uniquement le contexte du propriétaire, la version courante et ses révisions immuables. POST /api/contexts/:id/analyze produit une proposition MOCK déterministe à partir des champs saisis, sans modifier le contexte. Les champs présents restent des informations déclarées ; les valeurs proposées pour les champs vides sont des hypothèses à relire. Toute URL est seulement une donnée saisie : websiteFetched=false, aucune requête réseau ni lecture de contenu distant. Aucun coût fournisseur.

PUT /api/contexts/:id/review exige content, expectedVersion et confirmed=true. Le cas d’usage revalide les champs ; une transaction verrouille le contexte, revalide le propriétaire et la version de départ, met à jour la fiche et ajoute sa révision. Un changement concurrent différent répond 409. Rejouer le même contenu n’ajoute pas de doublon. Les anciens snapshots de run et révisions ne sont jamais réécrits.

L’écran permet d’éditer manuellement la fiche, d’obtenir la proposition simulée, de relire les informations/hypothèses et de confirmer explicitement avant sauvegarde. Fermer/recharger la page abandonne une proposition non sauvegardée. L’historique montre versions et empreintes ; la bibliothèque d’actifs reste accessible. L’analyse distante et l’apprentissage des préférences ne sont pas implémentés.

Recette : isolation, CSRF, aucune mutation lors de l’analyse, URL privée conservée comme texte sans fetch, confirmation requise, révision append-only, replay, conflit concurrent, ancien run inchangé, formulaire et historique réels au navigateur. La simulation conserve le même port applicatif pour une qualification fournisseur future.
