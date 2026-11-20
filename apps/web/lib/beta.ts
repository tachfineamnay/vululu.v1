'use client';

import { useEffect, useState } from 'react';

/**
 * BETA01 — état public du mode, lu depuis le serveur.
 *
 * Le serveur reste seul juge : ce hook ne sert qu'à afficher le bon message.
 * Il ne débloque rien et n'est jamais utilisé pour décider d'une autorisation.
 */
export type BetaStatus = {
  beta: boolean;
  mode: 'beta' | 'commercial';
  paymentsFrozen: boolean;
  checkout: 'unavailable' | 'gated';
};

export function useBetaStatus(): BetaStatus | null {
  const [status, setStatus] = useState<BetaStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/beta/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: BetaStatus | null) => {
        if (alive && value && typeof value.beta === 'boolean') setStatus(value);
      })
      .catch(() => {
        /* État indisponible : aucun message de vente n'est affiché pour autant. */
      });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/** Message bêta bilingue réutilisé par les écrans publics et le compte. */
export function betaCopy(t: (fr: string, en: string) => string) {
  return {
    badge: t('Bêta gratuite', 'Free beta'),
    access: t('Accès bêta gratuit', 'Free beta access'),
    noPayment: t(
      'Aucun paiement et aucune carte bancaire ne sont demandés pendant la bêta.',
      'No payment and no credit card are required during the beta.',
    ),
    frozen: t(
      'Les achats sont fermés pendant la bêta. Votre historique reste consultable.',
      'Purchases are closed during the beta. Your history stays available.',
    ),
    feedback: t('Signaler un bug ou une suggestion', 'Report a bug or share feedback'),
  };
}
