'use client';
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import {
  type ActionPreview,
  type CreativeAction,
  type CreativeChange,
  type CreativeSpec
} from '@vululu/contracts';
import { postJson } from '../lib/api';
const Surface = lazy(() => import('./CreativeReviewSurface'));
export class SurfaceBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function CreativeActionPanel({
  project,
  version,
  scene,
  assets,
  run,
  applied
}: {
  project: string;
  version: number;
  scene: CreativeSpec['scenes'][number];
  assets: { id: string; name: string }[];
  run: (fn: () => Promise<void>) => Promise<void>;
  applied: (key: string) => Promise<void>;
}) {
  const base = `/api/projects/${project}/creative/actions`,
    target = { projectId: project, sceneKey: scene.key };
  const [prompt, ask] = useState(''),
    [preview, show] = useState<ActionPreview>(),
    [op, choose] = useState<CreativeChange['operation']>('cta'),
    [value, set] = useState(''),
    [layer, setLayer] = useState(0),
    [native, fallback] = useState(false);
  const [missing, clarify] = useState<string>(),
    [cta, setCta] = useState(''),
    [color, setColor] = useState('#225588');
  const form = () => {
    const parameters =
      op === 'cta'
        ? { text: value }
        : op === 'color'
          ? { background: value }
          : op === 'text'
            ? { layer, text: value }
            : op === 'replace'
              ? { layer, versionId: value }
              : op === 'crop'
                ? { layer, fit: 'cover', gravity: value }
                : op === 'duration'
                  ? { seconds: Number(value) }
                  : op === 'move'
                    ? { position: Number(value) }
                    : { style: value };
    return {
      schemaVersion: 1,
      target,
      expectedRevision: version,
      authorization: 'project-owner:confirm',
      estimatedCostCents: 0,
      changes: [{ operation: op, parameters }]
    } satisfies Omit<CreativeAction, 'changes'> & { changes: unknown[] };
  };
  const options: Record<typeof op, string> = {
    cta: 'Appel à l’action',
    color: 'Fond de scène',
    text: 'Texte',
    replace: 'Remplacer une image',
    crop: 'Recadrer une image',
    duration: 'Durée (secondes)',
    transition: 'Transition (vidéo courte)',
    move: 'Position dans le projet'
  };
  const choices =
    op === 'transition'
      ? ['cut', 'dip']
      : op === 'crop'
        ? ['centre', 'north', 'south', 'east', 'west']
        : null;
  const review = preview && (
    <div className="stack">
      <strong>
        {preview.action.target.sceneKey} · version {version} → {version + 1}
      </strong>
      <p>Coût externe : 0 centime. Aucun rendu ni transfert automatique.</p>
      <ul>
        {preview.action.changes.map((c, i) => (
          <li key={i}>
            {options[c.operation]} : {Object.values(c.parameters).join(' · ')}
          </li>
        ))}
      </ul>
      <details>
        <summary>Comparer avant / après (position finale : {preview.position})</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify({ avant: preview.before, après: preview.after }, null, 2)}
        </pre>
      </details>
      <button
        type="button"
        onClick={() =>
          void run(async () => {
            await postJson(base + '/apply', {
              action: preview.action,
              digest: preview.digest,
              surface: preview.surface,
              approved: true
            });
            show(undefined);
            await applied(preview.action.target.sceneKey);
          })
        }
      >
        Approuver cette modification
      </button>
      <button type="button" onClick={() => show(undefined)}>
        Abandonner
      </button>
    </div>
  );
  const controls = (
    <details>
      <summary>Choisir une action et ses paramètres</summary>
      <label>
        Action
        <select
          className="input"
          value={op}
          onChange={(e) => {
            const next = e.target.value as typeof op;
            choose(next);
            set(
              next === 'color'
                ? '#225588'
                : next === 'crop'
                  ? 'centre'
                  : next === 'transition'
                    ? 'cut'
                    : next === 'replace'
                      ? (assets[0]?.id ?? '')
                      : ''
            );
            setLayer(
              Math.max(
                0,
                scene.layers.findIndex((l) => l.type === (next === 'text' ? 'text' : 'image'))
              )
            );
            show(undefined);
          }}
        >
          {Object.entries(options).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {['replace', 'crop', 'text'].includes(op) && (
        <label>
          Calque
          <select
            value={layer}
            onChange={(e) => {
              setLayer(Number(e.target.value));
              show(undefined);
            }}
          >
            {scene.layers.map(
              (l, i) =>
                l.type === (op === 'text' ? 'text' : 'image') && (
                  <option key={i} value={i}>
                    {i + 1} · {l.type === 'text' ? l.role : 'image'}
                  </option>
                )
            )}
          </select>
        </label>
      )}
      <label>
        Valeur
        {op === 'replace' || choices ? (
          <select
            value={value}
            onChange={(e) => {
              set(e.target.value);
              show(undefined);
            }}
          >
            {(choices?.map((id) => ({ id, name: id })) ?? assets).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            value={value}
            type={op === 'color' ? 'color' : op === 'duration' || op === 'move' ? 'number' : 'text'}
            step={op === 'duration' ? 0.5 : 1}
            onChange={(e) => {
              set(e.target.value);
              show(undefined);
            }}
          />
        )}
      </label>
      <button
        type="button"
        disabled={!value}
        onClick={() => void run(async () => show(await postJson<ActionPreview>(base + '/preview', form())))}
      >
        Prévisualiser le choix
      </button>
    </details>
  );
  return (
    <section className="card stack">
      <h3>Actions ciblées · {scene.key}</h3>
      <label>
        Demande en langage naturel
        <input
          className="input"
          value={prompt}
          placeholder={'Scène 2 : CTA "Réserver" ; couleur #225588'}
          onChange={(e) => {
            ask(e.target.value);
            clarify(undefined);
            show(undefined);
          }}
        />
      </label>
      <button
        type="button"
        disabled={!prompt.trim()}
        onClick={() =>
          void run(async () => {
            const result = await postJson<ActionPreview | { needs: 'cta-and-color'; sceneKey: string }>(
              base + '/translate',
              { target, expectedRevision: version, prompt }
            );
            if ('needs' in result) {
              clarify(result.sceneKey);
              show(undefined);
            } else show(result);
          })
        }
      >
        Prévisualiser la demande
      </button>
      {missing && (
        <fieldset>
          <legend>Préciser les changements pour {missing}</legend>
          <label>
            Nouveau CTA
            <input value={cta} onChange={(e) => setCta(e.target.value)} />
          </label>
          <label>
            Nouvelle couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={!cta.trim()}
            onClick={() =>
              void run(async () => {
                show(
                  await postJson<ActionPreview>(base + '/preview', {
                    ...form(),
                    target: { ...target, sceneKey: missing },
                    changes: [
                      { operation: 'cta', parameters: { text: cta } },
                      { operation: 'color', parameters: { background: color } }
                    ]
                  })
                );
                clarify(undefined);
              })
            }
          >
            Comparer les modifications
          </button>
        </fieldset>
      )}
      {native ? (
        controls
      ) : (
        <SurfaceBoundary fallback={controls}>
          <Suspense fallback={controls}>
            <Surface>{controls}</Surface>
          </Suspense>
        </SurfaceBoundary>
      )}
      {preview && (
        <>
          <label>
            <input type="checkbox" checked={native} onChange={(e) => fallback(e.target.checked)} /> Utiliser
            les contrôles natifs
          </label>
          {native ? (
            review
          ) : (
            <SurfaceBoundary fallback={review}>
              <Suspense fallback={review}>
                <Surface surface={preview.surface}>{review}</Surface>
              </Suspense>
            </SurfaceBoundary>
          )}
        </>
      )}
    </section>
  );
}
