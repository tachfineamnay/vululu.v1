'use client';

import { useEffect, useState } from 'react';
import { api, postJson } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type Operation = {
  id: string; tool: string; state: string; costState: string; maxCents: number; reportedCents: number | null;
  result: unknown; createdAt: string; agentTurnId: string | null; step: number | null; digest: string; approvedBy: string | null;
};
const pending = new Set(['QUEUED', 'CLAIMED', 'POLLING']);
const stateLabels: Record<string, [string, string]> = {
  PROPOSED: ['À autoriser', 'To authorize'], QUEUED: ['En file', 'Queued'], CLAIMED: ['En cours', 'Running'],
  POLLING: ['En cours', 'Running'], SUCCEEDED: ['Réussi', 'Succeeded'], FAILED: ['Échec', 'Failed'],
  CANCELLED: ['Annulé', 'Cancelled'], UNKNOWN: ['Issue incertaine', 'Uncertain outcome'], RESOLVED: ['Résolu', 'Resolved']
};
const toolLabels: Record<string, [string, string]> = {
  'project.summary@1': ['Résumé du projet', 'Project summary'],
  'assets.list@1': ['Liste des ressources', 'Asset list'],
  'assets.inspect@1': ['Inspection de ressource', 'Asset inspection'],
  'creative.direction@1': ['Directions artistiques', 'Art directions'],
  'assistant.draft@1': ['Brouillon assistant', 'Assistant draft'],
  'marketing.plan@1': ['Plan marketing', 'Marketing plan'],
  'media.image@1': ['Génération image', 'Image generation'],
  'media.video@1': ['Génération vidéo', 'Video generation'],
  'postiz.schedule@1': ['Programmation Postiz', 'Postiz scheduling'],
  'postiz.cancel@1': ['Annulation Postiz', 'Postiz cancellation'],
  'studio.inspect@1': ['Lecture de composition', 'Composition read'],
  'studio.render@1': ['Rendu de composition', 'Composition render'],
  'image.analyze@1': ['Analyse d’image (Python)', 'Image analysis (Python)'],
  'image.segment@1': ['Détourage d’image (Python)', 'Image cutout (Python)']
};

/** Statut réel des opérations outillées du projet : recommandations agent, autorisation, exécution, résultat. */
export default function ProjectExecutionStatus({ projectId }: { projectId: string }) {
  const { t, locale } = useWorkspace();
  const [items, setItems] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const base = '/api/projects/' + encodeURIComponent(projectId) + '/execution';

  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await api<{ items: Operation[] }>(base);
        if (!alive) return;
        setFailed(false); setItems(data.items);
        if (data.items.some((item) => pending.has(item.state) || item.state === 'PROPOSED')) timer = setTimeout(load, 4000);
      } catch { if (alive) setFailed(true); }
    }
    setLoading(true); void load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; clearTimeout(timer); };
  }, [base, reload]);

  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError('');
    try { await fn(); setReload((value) => value + 1); } catch (e) { setError(e instanceof Error ? e.message : t('Action impossible.', 'Action failed.')); }
    finally { setBusy(''); }
  }

  return <section className="card stack execution-status" data-vululu-theme="blue" data-testid="execution-status" aria-labelledby="execution-status-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Exécution outillée', 'Tool execution')}</p>
        <h2 id="execution-status-heading">{t('Opérations du projet', 'Project operations')}</h2>
      </div>
      <button type="button" className="btn btn-secondary btn-small" disabled={!!busy} onClick={() => setReload((value) => value + 1)}>{t('Actualiser', 'Refresh')}</button>
    </div>
    <p className="muted">{t('Ce que l’agent recommande reste distinct de ce que Vululu autorise : chaque outil est validé, borné par un budget et tracé. Aucun code arbitraire, shell, fichier ni SQL n’est exécuté.', 'What the agent recommends stays separate from what Vululu authorizes: every tool is validated, budget-bound and traced. No arbitrary code, shell, file or SQL execution.')}</p>
    {error ? <div className="error" role="alert"><p>{error}</p></div> : null}
    {loading ? <p role="status">{t('Chargement des opérations…', 'Loading operations…')}</p> : failed ? <div className="stack" role="alert"><p className="error">{t('Opérations indisponibles.', 'Operations unavailable.')}</p><button type="button" className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('Réessayer', 'Retry')}</button></div> : !items.length ? <p className="hint" data-testid="execution-empty">{t('Aucune opération outillée pour ce projet.', 'No tool operation for this project yet.')}</p> : <ul className="execution-list">
      {items.map((item) => <li key={item.id} className="execution-row" data-testid={'execution-' + item.id}>
        <div className="execution-row-head">
          <strong>{t(toolLabels[item.tool]?.[0] ?? item.tool, toolLabels[item.tool]?.[1] ?? item.tool)}</strong>
          <span className={'pill execution-state state-' + item.state.toLowerCase()}>{t(stateLabels[item.state]?.[0] ?? item.state, stateLabels[item.state]?.[1] ?? item.state)}</span>
        </div>
        <p className="hint">{t('Coût : ', 'Cost: ')}{item.reportedCents ?? '—'} / {item.maxCents} ¢ · {new Date(item.createdAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')}{item.step !== null ? t(' · recommandation agent n°', ' · agent recommendation #') + (item.step + 1) : ''}</p>
        {item.state === 'PROPOSED' ? <div className="actions">
          <button type="button" className="btn btn-primary btn-small" disabled={!!busy} onClick={() => void act(item.id, () => postJson('/api/execution/' + encodeURIComponent(item.id) + '/approve', { digest: item.digest }).then(() => undefined))}>{t('Autoriser cette opération', 'Authorize this operation')}</button>
          <button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => void act(item.id, () => postJson('/api/execution/' + encodeURIComponent(item.id) + '/cancel', {}).then(() => undefined))}>{t('Annuler', 'Cancel')}</button>
        </div> : ['PROPOSED', 'QUEUED'].includes(item.state) ? <div className="actions"><button type="button" className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => void act(item.id, () => postJson('/api/execution/' + encodeURIComponent(item.id) + '/cancel', {}).then(() => undefined))}>{t('Annuler', 'Cancel')}</button></div> : null}
        {item.result ? <details><summary>{t('Résultat structuré', 'Structured result')}</summary><pre className="execution-result">{JSON.stringify(item.result, null, 2).slice(0, 4000)}</pre></details> : null}
      </li>)}
    </ul>}
  </section>;
}
