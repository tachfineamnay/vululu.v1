'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { previewSpecForScene } from './studioPreview';
import { apiResponse } from './api';
import {
  isAbortError,
  isRetryableBusyError,
  runWithBoundedBusyRetry,
  studioPreviewCoordinator
} from './studioConcurrency';

export type StudioPreviewState = {
  url: string | null;
  state: 'idle' | 'loading' | 'waiting' | 'ready' | 'invalid' | 'error';
  message: string;
  retryable?: boolean;
};

/**
 * Aperçu exact de la scène par le moteur serveur (le même compositor Sharp que le rendu final).
 * L'image précédente reste affichée pendant l'actualisation ; aucune composition approximative
 * n'est dessinée côté navigateur. En cas de 429 légitime (`creative_busy`), attend et réessaie
 * de façon strictement bornée avant de proposer une reprise manuelle.
 */
export function useStudioPreview(
  base: string,
  spec: CreativeSpec | null,
  scene: CreativeSpec['scenes'][number] | null,
  enabled = true
) {
  const [preview, setPreview] = useState<StudioPreviewState>({ url: null, state: 'idle', message: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const urlRef = useRef<string | null>(null);
  const mounted = useRef(true);

  const replaceUrl = useCallback((next: string | null) => {
    if (urlRef.current && urlRef.current !== next) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !spec || !scene) return;
    // L'audio (mixage et sous-titres) n'est pas consommé par l'image fixe : le retirer évite
    // un faux refus de contrat quand un repère dépasse la durée de la seule scène affichée.
    const single: CreativeSpec = previewSpecForScene(spec, scene);
    const parsed = creativeSpec.safeParse(single);
    if (!parsed.success) {
      setPreview((current) => ({
        url: current.url,
        state: 'invalid',
        message: parsed.error.issues.map((issue) => issue.message).join(' · '),
        retryable: false
      }));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPreview((current) => ({ url: current.url, state: 'loading', message: '', retryable: false }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await runWithBoundedBusyRetry(
            () =>
              studioPreviewCoordinator.schedule(
                () =>
                  apiResponse(base + '/preview', {
                    method: 'POST',
                    body: JSON.stringify(parsed.data),
                    signal: controller.signal
                  }),
                controller.signal
              ),
            {
              signal: controller.signal,
              onWaiting: (info) => {
                if (cancelled || !mounted.current) return;
                setPreview((current) => ({
                  url: current.url,
                  state: 'waiting',
                  message: info.message,
                  retryable: true
                }));
              }
            }
          );
          const blob = await response.blob();
          if (cancelled || !mounted.current) return;
          const url = URL.createObjectURL(blob);
          replaceUrl(url);
          setPreview({ url, state: 'ready', message: '', retryable: false });
        } catch (error) {
          if (cancelled || controller.signal.aborted || isAbortError(error)) return;
          const busyRetryable = isRetryableBusyError(error);
          setPreview((current) => ({
            url: current.url,
            state: 'error',
            message: busyRetryable
              ? 'Serveur de rendu occupé après plusieurs tentatives. Vous pouvez réessayer.'
              : error instanceof Error
                ? error.message
                : 'Aperçu indisponible.',
            retryable: true
          }));
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, spec, scene, enabled, refreshToken, replaceUrl]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  return { preview, refresh };
}
