'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { creativeSpec, isVideoOutput, type CreativeSpec } from '@vululu/contracts';
import { apiResponse } from './api';

export type StudioVideoPreviewState = {
  url: string | null;
  state: 'idle' | 'loading' | 'ready' | 'invalid' | 'error';
  message: string;
};

/**
 * Aperçu vidéo produit par le serveur (même compositeur FFmpeg que le master), borné à 20 s :
 * il ne crée aucune révision, aucun stockage et n'est jamais le rendu final.
 * Activé uniquement pour une sortie vidéo ; l'aperçu précédent reste affiché pendant
 * l'actualisation et l'URL objet est révoquée à chaque remplacement ou démontage.
 */
export function useStudioVideoPreview(base: string, spec: CreativeSpec | null, enabled = true) {
  const [preview, setPreview] = useState<StudioVideoPreviewState>({ url: null, state: 'idle', message: '' });
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
    if (!enabled || !spec || !isVideoOutput(spec.delivery?.kind)) return;
    const parsed = creativeSpec.safeParse(spec);
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
          const response = await apiResponse(base + '/preview/video', {
            method: 'POST',
            body: JSON.stringify(parsed.data),
            signal: controller.signal
          });
          const blob = await response.blob();
          if (cancelled || !mounted.current) return;
          const url = URL.createObjectURL(blob);
          replaceUrl(url);
          // Faits transmis par le serveur uniquement (en-têtes de l'aperçu borné).
          const bounded = response.headers.get('X-Preview-Bounded') === '1';
          const rawSeconds = Number(response.headers.get('X-Preview-Seconds'));
          const facts = [
            Number.isFinite(rawSeconds) && rawSeconds > 0
              ? (Math.round(rawSeconds * 10) / 10).toFixed(1).replace('.', ',') + ' s rendues'
              : '',
            bounded ? 'aperçu borné à 20 s maximum : la suite n’est produite que par le rendu final' : ''
          ]
            .filter(Boolean)
            .join(' · ');
          setPreview({ url, state: 'ready', message: facts });
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          setPreview((current) => ({
            url: current.url,
            state: 'error',
            message: error instanceof Error ? error.message : 'Aperçu vidéo indisponible.'
          }));
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [base, spec, enabled, refreshToken, replaceUrl]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);
  return { preview, refresh };
}
