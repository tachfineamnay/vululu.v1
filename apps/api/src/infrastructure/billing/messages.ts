export const billingMessage = (code: string) =>
  (
    ({
      billing_quota_exhausted:
        'Quota épuisé pour cette fonction. Consultez les unités réservées et disponibles dans Mon compte.',
      billing_plan_required: 'Aucun pass actif ne couvre cette fonction. Consultez Mon compte.',
      billing_suspended: 'Compte suspendu. La facturation et l’assistance restent accessibles.',
      billing_render_already_reserved:
        'Cette version a déjà été réservée ou rendue. Actualisez le Studio avant de réessayer.',
      stripe_test_unavailable: 'Le paiement Stripe de test n’est pas configuré. Aucun débit effectué ici.',
      checkout_not_confirmed: 'Stripe n’a pas confirmé l’ouverture du paiement. Réessayez la même demande.',
      checkout_needs_review:
        'Cette ouverture de paiement doit être vérifiée par l’assistance. Ne recommencez pas le paiement.',
      checkout_not_open: 'Cette session de paiement n’est plus ouverte. Actualisez le compte.',
      expiration_not_confirmed: 'Stripe n’a pas confirmé la fermeture. Actualisez avant de réessayer.',
      entitlement_inactive: 'Le pass n’est plus actif pour cette opération.',
      reauth_required: 'Le mot de passe actuel doit être confirmé.',
      ticket_changed: 'Le dossier a changé. Actualisez son historique.',
      provider_review_required: 'Les preuves Stripe sont insuffisantes. Le solde reste inchangé.',
    }) as Record<string, string>
  )[code] ?? code;
