'use client';
import { useEffect, useState } from 'react';
import { MediaGenerationPanel } from './MediaGenerationPanel';
import {RevisionCompare} from "./RevisionCompare";
import { CreativeActionPanel } from './CreativeActionPanel';
import { FormatGuide, type Destination } from './FormatGuide';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import { readableInk, creativeSpec, type CreativeSpec, type CreativeLayer } from '@vululu/contracts';
import { api, apiResponse, postJson, type ProjectBundle } from '../lib/api';

type Rev = { version: number; approvedAt: string | null };
type Revision = Rev & {
  spec: CreativeSpec;
  manifest: { approvalSha256?: string; master: { sha256: string } } | null;
};
type Source = { metadata?: { width?: number; height?: number }; id: string; name: string; kind: string };
const copy = (text: string, role: 'headline' | 'body' | 'cta'): CreativeLayer => ({
  type: 'text',
  role,
  text,
  x: 0.08,
  y: role === 'cta' ? 0.82 : 0.59,
  w: 0.84,
  h: role === 'cta' ? 0.12 : 0.2,
  size: role === 'cta' ? 32 : 52,
  bold: true,
  color: '#ffffff',
  opacity: 1
});
const image = (a: Source): CreativeLayer => ({
  type: 'image',
  versionId: a.id,
  x: a.kind === 'logo' ? 0.72 : 0,
  y: a.kind === 'logo' ? 0.04 : 0,
  w: a.kind === 'logo' ? 0.24 : 1,
  h: a.kind === 'logo' ? 0.16 : 0.55,
  fit: a.kind === 'logo' ? 'contain' : 'cover',
  gravity: 'centre',
  opacity: 1
});
function NumberField({
  label,
  value,
  change,
  step = 1
}: {
  label: string;
  value: number;
  change: (n: number) => void;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        className="input"
        type="number"
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
}
export function CreativeEditor({ bundle,serverHead }: { bundle: ProjectBundle;serverHead?:number }) {
  const base = '/api/projects/' + encodeURIComponent(bundle.project.id) + '/creative';
  const [spec, set] = useState<CreativeSpec | null>(null),
    [versions, history] = useState<Rev[]>([]),
    [view, show] = useState<Revision | null>(null),
    [expected, setExpected] = useState(0);
  const [assets, allMedia] = useState<Source[]>([]),
    [items, destinations] = useState<Destination[]>([]);
  const [sources, library] = useState<Source[]>([]),
    [index, focus] = useState(0),
    [busy, work] = useState(false),
    [error, fail] = useState(''),
    [dirty, mark] = useState(false);
  const [preview, setPreview] = useState<{ url: string; spec: CreativeSpec; index: number } | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview]
  );
  useUnsavedChanges(dirty);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    work(true);
    fail('');
    try {
      await fn();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Action impossible.');
    } finally {
      work(false);
    }
  }
  function display(r: Revision) {
    show(r);
    set(r.spec);
    focus(0);
    mark(false);
  }
  async function load() {
    const [revs, assets, selected, linked] = await Promise.all([
      api<Rev[]>(base),
      api<{ items: { kind: string; versions: { id: string; name: string; mimeType: string }[] }[] }>(
        '/api/contexts/' + bundle.context.id + '/assets'
      ),
      api<{ versionIds: string[] }>(`/api/projects/${bundle.project.id}/assets`),
      api<Destination[]>(base + '/destinations')
    ]);
    const all = assets.items.flatMap((a) =>
      a.versions.filter((v) => v.mimeType.startsWith('image/')).map((v) => ({ ...v, kind: a.kind }))
    );
    destinations(linked);
    allMedia(assets.items.flatMap((a) => a.versions.map((v) => ({ ...v, kind: a.kind }))));
    library(all);
    history(revs);
    setExpected(revs[0]?.version ?? 0);
    if (revs.length) {
      display(await api<Revision>(base + '/' + revs[0].version));
      return;
    }
    const chosen = all.filter((a) => selected.versionIds.includes(a.id)),
      photos = chosen.filter((a) => a.kind !== 'logo'),
      logos = chosen.filter((a) => a.kind === 'logo');
    const seeds = bundle.scenes.length
      ? bundle.scenes
      : [{ sceneKey: 'SCENE-001', title: bundle.project.title, durationSeconds: 2 }];
    const ratio = bundle.brief?.settings?.ratio ?? '9:16';
    const width = ratio === '16:9' ? 1920 : 1080,
      height = ratio === '9:16' ? 1920 : ratio === '4:5' ? 1350 : 1080;
    set({
      schemaVersion: 1,
      width,
      height,
      safeArea: 0.05,
      brand: { background: bundle.context.colorPrimary, accent: bundle.context.colorSecondary },
      scenes: seeds.map((s, i) => ({
        key: s.sceneKey,
        seconds: s.durationSeconds,
        layers: [
          ...(photos.length ? [image(photos[i % photos.length])] : []),
          ...logos.slice(0, 1).map(image),
          ...('description' in s && typeof s.description === 'string' && s.description.trim()
            ? [
                { ...copy(s.title, 'headline'), y: 0.57, h: 0.1 },
                { ...copy(s.description, 'body'), y: 0.69, h: 0.11, size: 28, bold: false }
              ]
            : [copy(s.title, 'headline')]),
          copy(bundle.brief?.cta || 'Nous contacter', 'cta')
        ]
      }))
    });
    mark(true);
  }
  const change = (s: CreativeSpec) => {
    set(s);
    mark(true);
  };
  const scene = spec?.scenes[index];
  function layers(ls: CreativeLayer[]) {
    if (spec && scene)
      change({ ...spec, scenes: spec.scenes.map((s, i) => (i === index ? { ...s, layers: ls } : s)) });
  }
  function update(i: number, patch: Partial<CreativeLayer>) {
    if (scene) layers(scene.layers.map((l, j) => (j === i ? ({ ...l, ...patch } as CreativeLayer) : l)));
  }
  const [timeline, travel] = useState<{ head: number; past: number[]; future: number[] }>({
    head: 0,
    past: [],
    future: []
  });
  const past = timeline.head === expected ? timeline.past : versions.slice(1).map((v) => v.version);
  const future = timeline.head === expected ? timeline.future : [];
  async function step(back: boolean) {
    const v = (back ? past : future)[0];
    if (!v) return;
    const r = await postJson<Revision>(`${base}/${v}/restore`, { expectedVersion: expected });
    await sync(r);
    travel({
      head: r.version,
      past: back ? past.slice(1) : [expected, ...past],
      future: back ? [expected, ...future] : future.slice(1)
    });
  }
  async function sync(r: Revision) {
    travel({ head: r.version, past: expected ? [expected, ...past] : [], future: [] });
    display(r);
    setExpected(r.version);
    history(await api<Rev[]>(base));
  }
  return (
    <details
      className="card stack"
      onToggle={(e) => {
        if (e.currentTarget.open && !spec && !busy) void action(load);
      }}
    >
      <summary id="composition-heading">Composition et versions</summary>
      {spec&&serverHead!==undefined&&serverHead>expected&&<p role="status">La version v{serverHead} est disponible. Votre saisie reste intacte ; rechargez pour travailler sur la dernière version.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="stack">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (!dirty || confirm('Abandonner les modifications locales ?')) void action(load);
          }}
        >
          Recharger la dernière version
        </button>
        {spec && (
          <FormatGuide
            bundle={bundle}
            assets={assets}
            items={items}
            apply={(fn) =>
              void action(async () => {
                const next = fn();
                change(next);
                focus(0);
              })
            }
          />
        )}
        {bundle.project.campaignId && (
          <a href={`/api/campaigns/${bundle.project.campaignId}/creative-package`} download>
            Télécharger le lot de campagne
          </a>
        )}
        {spec && scene && (
          <>
            {!dirty && view?.version === expected && (
              <>
                <MediaGenerationPanel
                  key={`media:${expected}:${scene.key}`}
                  project={bundle.project.id}
                  revision={expected}
                  sceneKey={scene.key}
                  images={sources}
                  short={spec.delivery?.kind === 'short' && scene.seconds <= 5}
                  run={action}
                  reload={async () => {
                    await load();
                    focus(index);
                  }}
                />
                <CreativeActionPanel
                  key={`${expected}:${scene.key}`}
                  scene={scene}
                  project={bundle.project.id}
                  assets={sources}
                  version={expected}
                  run={action}
                  applied={async (key) => {
                    const r = await api<Revision>(base + '/' + (expected + 1));
                    await sync(r);
                    focus(r.spec.scenes.findIndex((s) => s.key === key));
                  }}
                />
                <div>
                  <button type="button" disabled={!past.length} onClick={() => void action(() => step(true))}>
                    Annuler la révision
                  </button>
                  <button
                    type="button"
                    disabled={!future.length}
                    onClick={() => void action(() => step(false))}
                  >
                    Rétablir la révision
                  </button>
                </div>
              </>
            )}
            {dirty && <p>Enregistrez la composition pour activer les actions ciblées.</p>}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                void action(async () => {
                  const response = await apiResponse(base + '/preview', {
                    method: 'POST',
                    body: JSON.stringify({ ...spec, scenes: [scene] })
                  });
                  setPreview({ url: URL.createObjectURL(await response.blob()), spec, index });
                })
              }
            >
              Prévisualiser la scène
            </button>
            {preview?.spec === spec && preview.index === index && (
              <img
                src={preview.url}
                alt={'Aperçu du rendu de ' + scene.key}
                style={{ maxWidth: '100%', maxHeight: 440, objectFit: 'contain' }}
              />
            )}
            <div className="two-col">
              <label>
                Format
                <select
                  className="input"
                  disabled={!!spec.delivery}
                  value={spec.width + '/' + spec.height}
                  onChange={(e) => {
                    const [width, height] = e.target.value.split('/').map(Number);
                    change({ ...spec, width, height });
                  }}
                >
                  {['1080/1920', '1080/1350', '1080/1080', '1920/1080', spec.width + '/' + spec.height]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                </select>
              </label>
              <NumberField
                label="Marge sûre (0–0,2)"
                value={spec.safeArea}
                step={0.01}
                change={(safeArea) => change({ ...spec, safeArea })}
              />
            </div>
            {(['background', 'accent'] as const).map((k) => (
              <label key={k}>
                {k === 'accent' ? 'Couleur secondaire' : 'Fond'}
                <input
                  type="color"
                  value={spec.brand[k]}
                  onChange={(e) => {
                    const color = e.target.value;
                    change({
                      ...spec,
                      brand: { ...spec.brand, [k]: color },
                      scenes: spec.scenes.map((s) => ({
                        ...s,
                        layers: s.layers.map((l) =>
                          l.type === 'text' && l.plate === spec.brand[k]
                            ? { ...l, plate: color, color: readableInk(color) }
                            : l
                        )
                      }))
                    });
                  }}
                />
              </label>
            ))}
            <nav className="composition-rail" aria-label="Scènes de la composition">{spec.scenes.map((s,i)=><button key={s.key} type="button" aria-pressed={i===index} onClick={()=>focus(i)}>{i+1} · {s.seconds} s</button>)}</nav>
            <label>
              Timeline
              <select className="input" value={index} onChange={(e) => focus(+e.target.value)}>
                {spec.scenes.map((s, i) => (
                  <option key={s.key} value={i}>
                    {i + 1} · {s.key} · {s.seconds} s
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button
                type="button"
                disabled={!index}
                onClick={() => {
                  const ss = [...spec.scenes];
                  [ss[index - 1], ss[index]] = [ss[index], ss[index - 1]];
                  change({ ...spec, scenes: ss });
                  focus(index - 1);
                }}
              >
                Avancer la scène
              </button>{' '}
              <button
                type="button"
                disabled={!!spec.delivery && !['carousel', 'short'].includes(spec.delivery.kind)}
                onClick={() => {
                  const n = Math.max(...spec.scenes.map((s) => Number(s.key.slice(6)))) + 1;
                  change({
                    ...spec,
                    scenes: [...spec.scenes, { ...scene, key: 'SCENE-' + String(n).padStart(3, '0') }]
                  });
                  focus(spec.scenes.length);
                }}
              >
                Dupliquer la scène
              </button>{' '}
              <button
                type="button"
                disabled={spec.scenes.length < 2}
                onClick={() => {
                  change({ ...spec, scenes: spec.scenes.filter((_, i) => i !== index) });
                  focus(0);
                }}
              >
                Retirer la scène
              </button>
            </div>
            <NumberField
              label="Durée (secondes)"
              value={scene.seconds}
              step={0.5}
              change={(seconds) =>
                change({ ...spec, scenes: spec.scenes.map((s, i) => (i === index ? { ...s, seconds } : s)) })
              }
            />
            {scene.clip && (
              <NumberField
                label="Début du clip (secondes)"
                value={scene.clip.start}
                step={0.5}
                change={(start) =>
                  change({
                    ...spec,
                    scenes: spec.scenes.map((s, i) =>
                      i === index && s.clip ? { ...s, clip: { ...s.clip, start } } : s
                    )
                  })
                }
              />
            )}
            {spec.delivery?.audio && (
              <NumberField
                label="Volume de la piste (0–1)"
                step={0.05}
                value={spec.delivery.audio.gain}
                change={(gain) =>
                  change({
                    ...spec,
                    delivery: { ...spec.delivery!, audio: { ...spec.delivery!.audio!, gain } }
                  })
                }
              />
            )}
            {scene.layers.some((l) => {
              if (l.type !== 'image') return false;
              const m = sources.find((a) => a.id === l.versionId)?.metadata;
              return (
                m?.width &&
                m?.height &&
                Math.max((l.w * spec.width) / m.width, (l.h * spec.height) / m.height) > 2
              );
            }) && (
              <p role="status">
                Image agrandie de plus de 2× : vérifiez sa netteté dans l’aperçu ou choisissez une source plus
                grande.
              </p>
            )}
            {scene.layers.map((l, i) => (
              <details key={scene.key + ':' + i}>
                <summary>
                  Calque {i + 1} ·{' '}
                  {l.type === 'text' ? l.role : sources.find((s) => s.id === l.versionId)?.name || 'Image'}
                </summary>
                <div className="stack">
                  {l.type === 'text' ? (
                    <>
                      <label>
                        Texte
                        <textarea
                          className="input"
                          value={l.text}
                          onChange={(e) => update(i, { text: e.target.value })}
                        />
                      </label>
                      <label>
                        Police
                        <select
                          value={l.family ?? 'sans'}
                          onChange={(e) => update(i, { family: e.target.value as typeof l.family })}
                        >
                          <option value="sans">Sans sérif</option>
                          <option value="serif">Sérif</option>
                          <option value="monospace">Chasse fixe</option>
                        </select>
                      </label>
                      <NumberField
                        label="Corps"
                        value={l.size}
                        change={(size) =>
                          update(i, { size, minSize: l.minSize ? Math.min(size, l.minSize) : undefined })
                        }
                      />
                      <label>
                        Couleur
                        <input
                          type="color"
                          value={l.color}
                          onChange={(e) => update(i, { color: e.target.value })}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={l.bold}
                          onChange={(e) => update(i, { bold: e.target.checked })}
                        />{' '}
                        Gras
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Cadrage
                        <select
                          value={l.fit}
                          onChange={(e) => update(i, { fit: e.target.value as typeof l.fit })}
                        >
                          <option value="cover">Remplir</option>
                          <option value="contain">Contenir</option>
                        </select>
                      </label>
                      <label>
                        Ancrage
                        <select
                          value={l.gravity}
                          onChange={(e) => update(i, { gravity: e.target.value as typeof l.gravity })}
                        >
                          {['centre', 'north', 'south', 'east', 'west'].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <div className="two-col">
                    {(['x', 'y', 'w', 'h', 'opacity'] as const).map((k, j) => (
                      <NumberField
                        key={k}
                        label={['X', 'Y', 'Largeur', 'Hauteur', 'Opacité'][j] + ' (0–1)'}
                        value={l[k]}
                        step={0.01}
                        change={(v) => update(i, { [k]: v })}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!i}
                    onClick={() => {
                      const ls = [...scene.layers];
                      [ls[i], ls[i - 1]] = [ls[i - 1], ls[i]];
                      layers(ls);
                    }}
                  >
                    Reculer le calque
                  </button>
                  <button
                    type="button"
                    disabled={scene.layers.length < 2}
                    onClick={() => layers(scene.layers.filter((_, j) => i !== j))}
                  >
                    Retirer le calque
                  </button>
                </div>
              </details>
            ))}
            <label>
              Ajouter une image de marque
              <select
                value=""
                onChange={(e) => {
                  const a = sources.find((s) => s.id === e.target.value);
                  if (a) layers([...scene.layers, image(a)]);
                }}
              >
                <option value="">Choisir une ressource</option>
                {sources.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => layers([...scene.layers, copy('Votre texte', 'body')])}>
              Ajouter du texte
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty}
              onClick={() =>
                void action(async () => {
                  const valid = creativeSpec.safeParse(spec);
                  if (!valid.success) throw new Error(valid.error.issues.map((v) => v.message).join(' · '));
                  await sync(await postJson<Revision>(base, { expectedVersion: expected, spec: valid.data }));
                })
              }
            >
              Enregistrer une nouvelle révision
            </button>
            {!!versions.length && (
              <label>
                Historique
                <select
                  value={view?.version ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!dirty || confirm('Abandonner les modifications locales ?'))
                      void action(async () => display(await api<Revision>(base + '/' + v)));
                  }}
                >
                  {versions.map((r) => (
                    <option key={r.version} value={r.version}>
                      v{r.version}
                      {r.approvedAt ? ' · approuvée' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {view && !dirty && (
              <>
                <h3 id="creative-deliver" tabIndex={-1}>Livraison · composition v{view.version}</h3>
                <RevisionCompare key={view.version} version={view.version} spec={view.spec} versions={versions} base={base}/>
                {view.version !== expected && (
                  <button
                    type="button"
                    onClick={() =>
                      void action(async () =>
                        sync(
                          await postJson<Revision>(`${base}/${view.version}/restore`, {
                            expectedVersion: expected
                          })
                        )
                      )
                    }
                  >
                    Restaurer comme nouvelle révision
                  </button>
                )}
                {view.manifest ? (
                  <>
                    {view.spec.delivery && view.spec.delivery.kind !== 'short' ? (
                      <img
                        alt="Export rendu"
                        style={{ maxWidth: '100%', maxHeight: 440 }}
                        src={`${base}/${view.version}/scenes/${scene.key}`}
                      />
                    ) : (
                      <video
                        controls
                        preload="metadata"
                        style={{ maxWidth: '100%', maxHeight: 440 }}
                        src={`${base}/${view.version}/master`}
                      />
                    )}
                    <a
                      href={`${base}/${view.version}/master?export=1`}
                      download={`v${view.version}.${view.spec.delivery && view.spec.delivery.kind !== 'short' ? 'png' : 'mp4'}`}
                    >
                      Exporter le master v{view.version}
                    </a>
                    <a href={`${base}/${view.version}/scenes/${scene.key}`} download={`${scene.key}.png`}>
                      Exporter la scène {index + 1}
                    </a>
                    <button
                      type="button"
                      disabled={!!view.approvedAt}
                      onClick={() =>
                        void action(async () => {
                          display(
                            await postJson<Revision>(`${base}/${view.version}/approve`, {
                              checksum: view.manifest!.approvalSha256 ?? view.manifest!.master.sha256
                            })
                          );
                          history(await api<Rev[]>(base));
                        })
                      }
                    >
                      {view.approvedAt ? 'Version approuvée' : 'Approuver cette version'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void action(async () => {
                        await postJson(`${base}/${view.version}/render`, {});
                        display(await api<Revision>(base + '/' + view.version));
                      })
                    }
                  >
                    Rendre le master v{view.version}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </fieldset>
      {busy && <p role="status">Traitement en cours…</p>}
    </details>
  );
}
