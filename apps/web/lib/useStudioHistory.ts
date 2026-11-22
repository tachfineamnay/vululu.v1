'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CreativeSpec } from '@vululu/contracts';

const LIMIT = 60;

type Updater = (current: CreativeSpec) => CreativeSpec;

/**
 * Historique local de l'éditeur (annuler/rétablir) sur des specs immuables.
 * Il ne remplace jamais les révisions serveur : une sauvegarde crée une nouvelle révision.
 * Les gestes continus (déplacement, redimensionnement) utilisent begin/update/end afin
 * qu'un seul pas d'historique corresponde à un seul geste.
 */
export function useStudioHistory(initial: CreativeSpec | null) {
  const [spec, setSpec] = useState<CreativeSpec | null>(initial);
  const past = useRef<CreativeSpec[]>([]);
  const future = useRef<CreativeSpec[]>([]);
  const pending = useRef<CreativeSpec | null>(null);
  const [, bump] = useState(0);
  const notify = useCallback(() => bump((value) => value + 1), []);

  const reset = useCallback((next: CreativeSpec | null) => {
    past.current = [];
    future.current = [];
    pending.current = null;
    setSpec(next);
    notify();
  }, [notify]);

  /** Modification discrète (champ, bouton) : un pas d'historique immédiat. */
  const commit = useCallback((next: CreativeSpec | Updater) => {
    setSpec((current) => {
      if (!current) return current;
      const value = typeof next === 'function' ? (next as Updater)(current) : next;
      if (value === current) return current;
      past.current = [...past.current.slice(-LIMIT + 1), current];
      future.current = [];
      return value;
    });
    notify();
  }, [notify]);

  /** Début d'un geste continu : la version de départ sera le pas d'historique. */
  const begin = useCallback(() => {
    pending.current = spec;
  }, [spec]);

  /** Pendant un geste : mise à jour sans empiler d'historique. */
  const update = useCallback((next: CreativeSpec | Updater) => {
    setSpec((current) => {
      if (!current) return current;
      return typeof next === 'function' ? (next as Updater)(current) : next;
    });
  }, []);

  /** Fin d'un geste : un seul pas d'historique pour tout le geste. */
  const end = useCallback(() => {
    const before = pending.current;
    pending.current = null;
    setSpec((current) => {
      if (!before || !current || before === current) return current;
      past.current = [...past.current.slice(-LIMIT + 1), before];
      future.current = [];
      return current;
    });
    notify();
  }, [notify]);

  const undo = useCallback(() => {
    setSpec((current) => {
      const previous = past.current.pop();
      if (!previous || !current) return current;
      future.current = [current, ...future.current].slice(0, LIMIT);
      return previous;
    });
    notify();
  }, [notify]);

  const redo = useCallback(() => {
    setSpec((current) => {
      const next = future.current.shift();
      if (!next || !current) return current;
      past.current = [...past.current.slice(-LIMIT + 1), current];
      return next;
    });
    notify();
  }, [notify]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  return useMemo(() => ({ spec, reset, commit, update, begin, end, undo, redo, canUndo, canRedo }), [spec, reset, commit, update, begin, end, undo, redo, canUndo, canRedo]);
}
