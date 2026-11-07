'use client';
import { useEffect } from 'react';

/** Protège un brouillon local sans modifier la navigation lorsqu'il est enregistré. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    function navigate(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor || anchor.hasAttribute('download') || anchor.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('Vos modifications ne sont pas enregistrées. Quitter cette fiche ?')) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
}
