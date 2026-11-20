export const billingMessage = (code: string) =>
  (
    ({
      billing_quota_exhausted:
        'Quota épuisé pour cette fonction. Consultez les unités réservées et disponibles dans Mon compte.',
      billing_plan_required: 'Aucun pass actif ne couvre cette fonction. Consultez Mon compte.',
      billing_suspended: 'Compte suspendu. La facturation et l’assistance restent accessibles.',
      billing_render_already_reserved:
        'Cette version a déjà été réservée ou rendue. Actualisez le Studio avant de réessayer.',
      stripe_unavailable: 'Le paiement Stripe n’est pas configuré pour ce mode. Aucun débit effectué ici.',
      stripe_checkout_unavailable: 'Les nouveaux paiements sont indisponibles. Vos achats existants restent consultables.',
      stripe_account_mismatch: 'Le compte Stripe n’a pas pu être vérifié. Aucun paiement ouvert.',
      commercial_not_enabled: 'Les achats ne sont pas activés pour ce catalogue.',
      billing_mode_mismatch: 'Cette commande ne correspond pas au mode de facturation actif.',
      activation_confirmation_required: 'Confirmation du mode et référence d’accord requises.',
      invalid_stripe_webhook: 'Signature, mode ou date de l’événement Stripe invalide.',
      payment_receipt_unavailable: 'Le reçu de paiement Stripe n’est pas disponible. Consultez l’assistance si nécessaire.',
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
