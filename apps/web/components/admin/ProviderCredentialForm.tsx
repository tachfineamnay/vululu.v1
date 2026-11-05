'use client';

import { useId, useState, type FormEvent } from 'react';
import { adminApi, errorMessage, type AdminProvider } from '../../lib/admin';

export default function ProviderCredentialForm({ provider, onChanged }: { provider: AdminProvider; onChanged: () => void }) {
  const id = useId(); const [value, setValue] = useState(''); const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<'replace' | 'remove' | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const status = provider.credentials;
  async function mutate(remove = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (remove) await adminApi.removeProviderCredentials(provider.key);
      else await adminApi.saveProviderCredentials(provider.key, value);
      setValue(''); setConfirmation(null); setNotice(remove ? 'Clé supprimée.' : 'Clé enregistrée, connexion non testée.'); onChanged();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (status?.configured) setConfirmation('replace'); else void mutate();
  }
  return <form className="admin-form admin-credential-form" aria-label={'Clé API de ' + provider.name} data-testid={'provider-credentials-' + provider.key} onSubmit={submit}>
    <h3>{provider.name}</h3>
    <p className="admin-muted" data-testid="credential-status">{status?.configured ? 'Clé enregistrée. Connexion non testée.' : 'Aucune clé enregistrée.'}</p>
    {!status?.writable ? <p className="admin-banner">Le chiffrement doit être activé sur le serveur pour enregistrer une clé.</p> : null}
    <label className="label" htmlFor={id}>Clé API
      <input id={id} className="input" type="password" autoComplete="off" spellCheck={false} maxLength={4096} value={value} onChange={(event) => { setValue(event.target.value); setConfirmation(null); }} required disabled={busy || !status?.writable} aria-describedby={id + '-help'} />
    </label>
    <p id={id + '-help'} className="hint">La clé reste masquée et n’est jamais restituée par l’application.</p>
    {error ? <p className="admin-banner admin-banner--danger" role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {confirmation ? <div className="stack" role="group" aria-label="Confirmation de modification">
      <p>{confirmation === 'remove' ? 'Supprimer la clé enregistrée pour ce fournisseur ?' : 'Remplacer la clé enregistrée par votre nouvelle saisie ?'}</p>
      <div className="admin-actions"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void mutate(confirmation === 'remove')}>{busy ? 'En cours…' : confirmation === 'remove' ? 'Confirmer la suppression' : 'Confirmer le remplacement'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button></div>
    </div> : <div className="admin-actions">
      <button type="submit" className="btn btn-primary" disabled={busy || !status?.writable || !value.trim()}>{busy ? 'Enregistrement…' : status?.configured ? 'Remplacer la clé' : 'Enregistrer la clé'}</button>
      {status?.configured ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmation('remove')}>Supprimer la clé</button> : null}
    </div>}
  </form>;
}
