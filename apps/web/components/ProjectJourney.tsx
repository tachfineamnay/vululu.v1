'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, type ProjectBundle, type ProductionPlanView } from '../lib/api';
import { executionStatus, productionStepLabel, projectJourney } from '../lib/projectJourney';

type Props = { bundle: ProjectBundle; plan: ProductionPlanView | null; planError: string; briefDirty: boolean; refreshing: boolean; refresh: () => void };

export default function ProjectJourney({ bundle, plan, planError, briefDirty, refreshing, refresh }: Props) {
  const journey = projectJourney(bundle);
  const run = bundle.jobRun;
  const [evidence, setEvidence] = useState<{ projectId: string; jobRunId: string; stepOutputs: Record<string, unknown> } | null>(null);
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const currentEvidence = evidence?.jobRunId === run?.id ? evidence : null;
  async function loadEvidence() {
    if (!run) return;
    setEvidenceBusy(true); setEvidenceError('');
    try {
      const result = await api<NonNullable<typeof evidence>>('/api/projects/' + encodeURIComponent(bundle.project.id) + '/runs/' + encodeURIComponent(run.id) + '/evidence');
      if (result.projectId !== bundle.project.id || result.jobRunId !== run.id) throw new Error('Les preuves reçues ne correspondent pas à ce projet et à ce run.');
      setEvidence(result);
    } catch (err) { setEvidenceError(err instanceof Error ? err.message : 'Preuves indisponibles.'); }
    finally { setEvidenceBusy(false); }
  }
  function focusSection(id: string) {
    const target = document.getElementById(id);
    let parent = target?.parentElement;
    while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    target?.focus();
  }
  return <section className="card project-journey stack" data-vululu-theme="blue" aria-labelledby="journey-heading" data-testid="project-journey">
    <div className="section-head"><div><p className="eyebrow">Votre parcours de création</p><h2 id="journey-heading">Du brief au résultat</h2></div><a href="#flow-details" className="text-link" onClick={(event) => { event.preventDefault(); const panel = document.getElementById('flow-details'); if (panel instanceof HTMLDetailsElement) { panel.open = true; panel.querySelector('summary')?.focus(); } }}>Consulter le flow</a></div>
    <p>Projet : <strong>{bundle.project.title}</strong> · Contexte : {bundle.context.name}. Ce parcours et le flow lisent le même projet ; consulter une étape ne lance aucune action.</p>
    {briefDirty ? <p className="context-completeness" role="status">Votre brief comporte des modifications non enregistrées. Le parcours et le plan ci-dessous décrivent les données enregistrées sur le serveur.</p> : null}
    <nav aria-label="Étapes du projet"><ol className="journey-stages">{journey.stages.map((stage, index) => <li key={stage.key} aria-current={journey.current === stage.key ? 'step' : undefined}>
      <span className="eyebrow">Étape {index + 1}</span><h3>{stage.title}</h3><p className="journey-state" data-testid={'journey-state-' + stage.key}>{stage.state}</p>
      <details><summary>Entrée et résultat disponibles</summary><dl className="journey-data"><dt>Entrée / condition</dt><dd>{stage.input}</dd><dt>Résultat</dt><dd>{stage.output}</dd></dl></details>
      {stage.target ? <a className="text-link" href={'#' + stage.target} onClick={() => focusSection(stage.target!)}>{stage.action}</a> : <p className="hint">Accessible dès qu’un master est disponible.</p>}
    </li>)}</ol></nav>
    <details id="flow-details" className="journey-flow" data-testid="flow-details"><summary>Flow avancé · plan et dernière exécution</summary>
      <div className="stack">
        <p>Consultation uniquement. L’édition, le déplacement et la duplication des étapes ne sont pas raccordés. Aucune nouvelle méthode n’est enregistrée dans le navigateur.</p>
        <section className="stack" aria-labelledby="flow-plan-heading"><h3 id="flow-plan-heading">Plan prévisionnel de production</h3>
          {!bundle.brief ? <p>Indisponible : enregistrez le brief pour obtenir le plan serveur.</p> : <>
            <button className="btn btn-secondary" type="button" disabled={refreshing} onClick={refresh}>{refreshing ? 'Actualisation…' : 'Actualiser le plan'}</button>
            {planError ? <p className="error" role="alert">Plan indisponible : {planError} Les données du projet et le dernier run restent consultables.</p> : null}
            {planError && plan ? <p>Dernier plan reçu, dont l’actualisation n’est pas confirmée. Réessayez avant tout lancement.</p> : null}
            {plan ? <><p>Brief v{plan.briefVersion} · {plan.executionMode} · {plan.sceneCount} scènes · {plan.durationSeconds} s · {plan.ratio}. {plan.ready ? 'Plan admissible, lancement non effectué par cette consultation.' : 'Lancement indisponible : consultez les motifs ci-dessous.'}</p>
              <p>Estimation {plan.pricing.estimatedCents} centimes MOCK · maximum du scénario {plan.pricing.maxPossibleCents} · plafond {plan.pricing.ceilingCents} centimes MOCK. Aucun coût fournisseur réel.</p>
              <p className="hint">Ce plan est recalculé à partir du brief enregistré et de la configuration actuelle. Ce n’est pas le snapshot du dernier run ; ses dépendances ne sont pas attribuées rétroactivement à celui-ci.</p>
              <ol className="flow-step-list">{plan.steps.map((step) => <li key={step.key}><details><summary>{productionStepLabel(step.key)}</summary><dl className="journey-data"><dt>Identifiant</dt><dd><code>{step.key}</code></dd><dt>Capacité déclarée par le plan</dt><dd><code>{step.capability}</code></dd><dt>Dépendances</dt><dd>{step.dependsOn.length ? step.dependsOn.map(productionStepLabel).join(', ') : 'Aucune : début du plan'}</dd><dt>Entrée / sortie détaillées</dt><dd>Non exposées par cette API. Les objets du projet sont consultables dans le parcours ; aucun payload d’exécution n’est reconstitué.</dd><dt>État</dt><dd>Prévision uniquement ; voir le journal séparé pour l’exécution.</dd></dl></details></li>)}</ol>
              {plan.issues.length ? <ul role="alert">{plan.issues.map((issue) => <li key={issue.code}>{issue.message} <code>({issue.code})</code></li>)}</ul> : null}
              <details><summary>Empreinte du plan</summary><code>{plan.checksum}</code></details>
            </> : !planError ? <p role="status">Chargement du plan…</p> : null}
          </>}
        </section>
        <section className="stack" aria-labelledby="job-heading"><h3 id="job-heading">Dernière exécution enregistrée</h3>
          <div data-testid="job-steps">{run ? <><p>État serveur : {executionStatus(run.status)} · moteur {run.orchestrator ?? 'non exposé'}.</p><ol className="flow-step-list">{run.steps.map((step) => <li key={step.name}><details><summary>{productionStepLabel(step.name)} — {executionStatus(step.status)}</summary><dl className="journey-data"><dt>Tentatives enregistrées</dt><dd>{step.attempts}</dd><dt>Début</dt><dd>{step.startedAt ?? 'Non renseigné'}</dd><dt>Fin</dt><dd>{step.finishedAt ?? 'Non renseignée'}</dd><dt>Entrées, sorties et dépendances du run</dt><dd>Non exposées dans ce journal. Le plan prévisionnel ne remplace pas le snapshot d’exécution.</dd></dl>{step.error ? <p className="error" role="alert">{step.error}</p> : null}</details></li>)}</ol>{!run.steps.length ? <p>Aucune étape enregistrée dans ce run.</p> : null}<details><summary>Identifiants de suivi</summary><dl className="journey-data"><dt>Run</dt><dd>{run.id}</dd><dt>Trace</dt><dd>{run.traceId ?? 'Non exposée'}</dd><dt>Workflow</dt><dd>{run.workflowRunId ?? 'Non exposé'}</dd></dl></details></> : <p>Aucune exécution enregistrée. Les étapes prévisionnelles ne sont pas marquées comme exécutées.</p>}</div>
          <p className="hint">Le bundle expose le dernier run seulement, qui peut être une correction. En mode local, la clôture peut marquer plusieurs étapes ensemble : ce journal ne fournit pas une mesure fine par étape. Pause, annulation et reprise d’une étape ne sont pas raccordées ici.</p>
        </section>
        {run ? <section className="stack" aria-labelledby="run-outputs-heading"><h3 id="run-outputs-heading">Sorties enregistrées du run</h3><p>La route de preuves existante permet de consulter les sorties persistées, lorsqu’elles existent. Les entrées détaillées ne sont pas exposées.</p><button type="button" className="btn btn-secondary" disabled={evidenceBusy} onClick={() => void loadEvidence()}>{evidenceBusy ? 'Chargement…' : 'Charger les sorties du run'}</button>{evidenceError ? <p className="error" role="alert">{evidenceError}</p> : null}{currentEvidence ? <div data-testid="run-outputs">{Object.entries(currentEvidence.stepOutputs).map(([key, output]) => <details key={key}><summary>{productionStepLabel(key)} · sortie persistée</summary>{output === null ? <p>Aucune sortie persistée pour cette étape.</p> : <pre>{JSON.stringify(output, null, 2)}</pre>}</details>)}{!Object.keys(currentEvidence.stepOutputs).length ? <p>Aucune sortie enregistrée.</p> : null}</div> : null}</section> : null}
        <section className="stack" aria-labelledby="journey-reuse-heading"><h3 id="journey-reuse-heading">Réutiliser ce qui est disponible</h3><p>Vous pouvez réutiliser le contexte dans un nouveau projet et consulter ses ressources. Le brief, les scènes et les versions ne sont pas copiés automatiquement.</p><div className="actions"><Link className="text-link" href={'/projects/new?context=' + encodeURIComponent(bundle.context.id)}>Nouveau projet avec ce contexte</Link><Link className="text-link" href={'/assets?context=' + encodeURIComponent(bundle.context.id) + '&project=' + encodeURIComponent(bundle.project.id)}>Consulter les ressources du projet</Link></div><p className="hint">Enregistrer un modèle de flow, cloner le projet ou réutiliser un sous-parcours exige des contrats serveur absents de ce parcours.</p></section>
      </div>
    </details>
  </section>;
}
