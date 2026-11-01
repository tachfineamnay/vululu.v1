'use client';

import { useEffect, useId, type ReactNode } from 'react';

/**
 * Dialogue de confirmation accessible : role dialog, aria-modal,
 * fermeture au clavier (Echap) et focus initial sur Annuler.
 */
export default function ConfirmDialog(input: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const { open, busy, onCancel } = input;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="admin-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId}>{input.title}</h2>
        <p id={descriptionId} className="admin-meta">
          {input.message}
        </p>
        {input.children}
        <div className="admin-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy} autoFocus>
            {input.cancelLabel ?? 'Annuler'}
          </button>
          <button
            type="button"
            className={'btn ' + (input.tone === 'primary' ? 'btn-primary' : 'btn-danger')}
            onClick={input.onConfirm}
            disabled={busy}
          >
            {busy ? 'Traitement...' : input.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
