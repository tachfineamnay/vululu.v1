'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { apiResponse } from './api';

export type StudioPreviewState = {
  url: string | null;
  state: 'idle' | 'loading' | 'ready' | 'invalid' | 'error';
  message: string;
};

/**
 * Aperçu exact de la scène par le moteur serveur (le même compositor Sharp que le rendu final).
 * L'image précédente reste affichée pendant l'actualisation ; aucune composition approximative
 * n'est dessinée côté navigateur.
 */
export function useStudioPreview(base: string, spec: CreativeSpec | null, scene: CreativeSpec['scenes'][number] | null, enabled = true) {
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
    const single: CreativeSpec = { ...spec, scenes: [scene] };
    const parsed = creativeSpec.safeParse(single);
    if (!parsed.success) {
      setPreview((current) => ({
        url: current.url,
        state: 'invalid',
        message: parsed.error.issues.map((issue) => issue.message).join(' · ')
      }));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setPreview((current) => ({ url: current.url, state: 'loading', message: '' }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await apiResponse(base + '/preview', {
            method: 'POST',
            body: JSON.stringify(parsed.data),
            signal: controller.signal
          });
          const blob = await response.blob();
          if (cancelled || !mounted.current) return;
          const url = URL.createObjectURL(blob);
          replaceUrl(url);
          setPreview({ url, state: 'ready', message: '' });
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          setPreview((current) => ({
            url: current.url,
            state: 'error',
            message: error instanceof Error ? error.message : 'Aperçu indisponible.'
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
