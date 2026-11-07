'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../lib/admin';

export type AdminResource<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
};

/**
 * Chargement d une ressource admin avec etats loading/error et relance.
 * La cle permet de recharger quand les filtres ou la page changent.
 */
export function useAdminResource<T>(loader: () => Promise<T>, key: string): AdminResource<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: true,
    error: ''
  });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ data: previous.data, loading: true, error: '' }));
    loaderRef.current().then(
      (data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: '' });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({ data: previous.data, loading: false, error: errorMessage(error) }));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
