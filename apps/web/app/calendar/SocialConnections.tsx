'use client';
import { useRef, useState } from 'react';
import { api, postJson } from '../../lib/api';
import { formatPlatformSupportSummary } from '../../lib/publishingPresentation';

export const socialChannels = ['LinkedIn', 'Instagram', 'Facebook', 'TikTok', 'Google Business Profile'] as const;
const oauthOptions = [
  ['linkedin', 'LinkedIn'], ['linkedin-page', 'Page LinkedIn'], ['instagram-standalone', 'Instagram professionnel'],
  ['instagram', 'Instagram via Facebook'], ['facebook', 'Page Facebook'], ['tiktok', 'TikTok'], ['gmb', 'Google Business Profile']
];
const connectionErrors: Record<string, string> = {
  DISABLED: 'La publication directe Postiz est désactivée par défaut sur cet environnement.',
  direct_disabled: 'La publication directe Postiz est désactivée par défaut sur cet environnement.',
  TOKEN_EXPIRED: 'La clé API Postiz a été refusée ou a expiré. Vérifiez-la puis recommencez.',
  token_expired: 'La clé API Postiz a expiré. Saisissez une clé valide pour renouveler le compte.',
  PROVIDER_UNAVAILABLE: 'Postiz est temporairement indisponible. Réessayez plus tard.',
  postiz_unavailable: 'Postiz est temporairement indisponible. Réessayez plus tard.',
  CHANNEL_MISMATCH: 'Ce compte ne correspond pas au canal attendu dans votre espace Postiz.',
  INVALID_RECEIPT: 'Réponse Postiz inattendue. Aucun compte n’a été modifié.',
  connection_not_found: 'Ce compte de publication est introuvable.'
};
function connectionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Connexion indisponible.';
  return connectionErrors[error.message] ?? error.message;
}
type Channel = { id: string; platform: string; channel: string; displayName: string | null; expiresAt: string };
type Candidate = { id: string; name?: string; platform: string };
type ConnectionInfo = { enabled: boolean; connections: Channel[]; capabilities: Record<string, { scheduled: string[] }> };
const base = '/api/publishing/connections';
export function SocialConnections({ onChange }: { onChange: () => void }) {
  const [info, set] = useState<ConnectionInfo>(), [token, credential] = useState(''), [options, discover] = useState<Candidate[]>([]),
    [selected, select] = useState(''), [identifier, platform] = useState('linkedin'), [oauth, link] = useState(''),
    [busy, work] = useState(false), [error, fail] = useState('');
  const inFlight = useRef(false);
  async function load() { set(await api<ConnectionInfo>(base)); }
  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    work(true); fail('');
    try { await fn(); } catch (e) { fail(connectionErrorMessage(e)); }
    finally { inFlight.current = false; work(false); }
  }
  const hasExpired = Boolean(info?.connections.some((c) => Date.parse(c.expiresAt) <= Date.now()));
  return <details className="card stack" onToggle={(e) => {
    if (e.currentTarget.open) void run(load);
    else { credential(''); discover([]); select(''); link(''); fail(''); }
  }}>
    <summary>Comptes de publication</summary>
    {info?.enabled ? (
      <p>Associez les comptes de votre espace Postiz avec sa clé API. La clé n’est pas affichée après l’association.</p>
    ) : info ? (
      <p>La publication directe Postiz est désactivée par défaut sur cet environnement. Aucun envoi externe n’est effectué ; vous pouvez toujours télécharger le kit de publication manuelle.</p>
    ) : null}
    {hasExpired && (
      <p className="pub-warning" role="status">
        Une ou plusieurs clés de connexion ont expiré. Pour renouveler : saisissez votre clé API Postiz ci-dessous, chargez vos comptes, puis sélectionnez le compte à renouveler.
      </p>
    )}
    {error && <p className="pub-error" role="alert">{error}</p>}
    {info && <ul>{socialChannels.map((name) => {
      const rows = info.connections.filter((c) => c.platform === name);
      const hasValid = rows.some((c) => Date.parse(c.expiresAt) > Date.now());
      const hasExpiredForPlatform = rows.some((c) => Date.parse(c.expiresAt) <= Date.now());
      return <li key={name}><strong>{name}</strong> · {hasValid ? 'Connecté à Vululu' : hasExpiredForPlatform ? 'Connexion expirée' : 'Pas de connexion valide'} · {
        formatPlatformSupportSummary(info.enabled, info.capabilities[name]?.scheduled)
      }
        {rows.map((c) => {
          const expired = Date.parse(c.expiresAt) <= Date.now();
          return <div key={c.id}>{c.displayName || c.channel} · {expired ? 'clé expirée — à renouveler' : 'clé active'}{' '}
            <button type="button" disabled={busy} onClick={() => void run(async () => {
              if (!window.confirm('Dissocier ce compte de Vululu ? Les publications déjà programmées dans Postiz ne seront pas annulées.')) return;
              await api(`${base}/${c.id}`, { method: 'DELETE' }); await load(); onChange();
            })}>Dissocier de Vululu</button>
          </div>;
        })}
      </li>;
    })}</ul>}
    {info?.enabled && <>
      <label>Clé API Postiz <input type="password" autoComplete="off" maxLength={2048} value={token} onChange={(e) => {
        credential(e.target.value); discover([]); select(''); link('');
      }} /></label>
      <label>Nouveau canal <select value={identifier} onChange={(e) => { platform(e.target.value); link(''); }}>
        {oauthOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <button type="button" disabled={busy || token.length < 8} onClick={() => void run(async () => {
        link((await postJson<{ url: string }>(`${base}/authorize`, { token, identifier })).url);
      })}>Préparer l’autorisation du réseau</button>
      {oauth && <p><a href={oauth} target="_blank" rel="noopener noreferrer">Autoriser le compte dans un nouvel onglet</a>. Revenez puis chargez les comptes.</p>}
      <button type="button" disabled={busy || token.length < 8} onClick={() => void run(async () => {
        const result = await postJson<Candidate[]>(`${base}/discover`, { token });
        discover(result); select('');
        if (!result.length) fail('Aucun compte pris en charge dans cet espace Postiz.');
      })}>Charger mes comptes Postiz</button>
      {!!options.length && <>
        <label>Compte à associer ou renouveler <select value={selected} onChange={(e) => select(e.target.value)}>
          <option value="">Choisir</option>
          {options.map((c) => <option key={c.id} value={c.id}>{c.platform} · {c.name || c.id}</option>)}
        </select></label>
        <button type="button" disabled={busy || !selected} onClick={() => void run(async () => {
          await postJson(base, { token, channel: selected }); credential(''); discover([]); select(''); link('');
          await load(); onChange();
        })}>Associer ce compte</button>
      </>}
    </>}
  </details>;
}
