'use client';
import { useState } from 'react';
import {
  composeGuide,
  formatLabels,
  productionCapability,
  outputKind,
  platformSchema,
  type CreativeSpec,
  type OutputKind,
  type Platform
} from '@vululu/contracts';
import type { ProjectBundle } from '../lib/api';
export type Destination = {
  id: string;
  version: number;
  title: string;
  offer: { name: string };
  variants: { platform: Platform; caption: string; cta: string }[];
};
export type MediaChoice = { id: string; name: string; kind: string };
export function FormatGuide({
  bundle,
  assets,
  items,
  apply
}: {
  bundle: ProjectBundle;
  assets: MediaChoice[];
  items: Destination[];
  apply: (f: () => CreativeSpec) => void;
}) {
  const [concept,selectConcept]=useState<'editorial'|'immersive'>('editorial');
  const [kind, format] = useState<OutputKind>(productionCapability(bundle.project.format)?.studio ?? 'square'),
    [platform, channel] = useState<Platform>(platformSchema.parse(bundle.project.platform)),
    [dest, link] = useState(''),
    [photos, pick] = useState<string[]>([]),
    [logo, mark] = useState(''),
    [clip, movie] = useState(''),
    [audio, sound] = useState(''),
    [dip, fade] = useState(false);
  const item = items.find((v) => v.id === dest),
    variant = item?.variants.find((v) => v.platform === platform);
  const select = (label: string, type: string, value: string, set: (s: string) => void) => (
    <label>
      {label}
      <select className="input" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Aucun</option>
        {assets
          .filter((a) => a.kind === type)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <details className="card stack">
      <summary>Préparer une déclinaison</summary>
      <fieldset><legend>Concept visuel</legend><label><input type="radio" checked={concept==='editorial'} onChange={()=>selectConcept('editorial')}/> Éditorial · texte et image en zones distinctes</label><label><input type="radio" checked={concept==='immersive'} onChange={()=>selectConcept('immersive')}/> Immersif · photo plein cadre, texte sur cartouches</label></fieldset>
      <label>
        Contenu du calendrier
        <select
          className="input"
          value={dest}
          onChange={(e) => {
            link(e.target.value);
            const i = items.find((v) => v.id === e.target.value);
            if (i) channel(i.variants[0].platform);
          }}
        >
          <option value="">Projet sans contenu lié</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      </label>
      <div className="two-col">
        <label>
          Plateforme
          <select className="input" value={platform} onChange={(e) => channel(e.target.value as Platform)}>
            {(item ? item.variants.map((v) => v.platform) : platformSchema.options).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Format
          <select className="input" value={kind} onChange={(e) => format(e.target.value as OutputKind)}>
            {outputKind.options.map((k) => (
              <option key={k} value={k}>
                {formatLabels[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Photos dans l’ordre de sélection</legend>
        {assets
          .filter((a) => a.kind === 'image')
          .map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={photos.includes(a.id)}
                onChange={(e) => pick(e.target.checked ? [...photos, a.id] : photos.filter((p) => p !== a.id))}
              />
              {a.name}
            </label>
          ))}
      </fieldset>
      {select('Logo', 'logo', logo, mark)}
      {kind === 'short' && (
        <>
          {select('Clip d’ouverture', 'video', clip, movie)}
          {select('Piste audio autorisée', 'audio', audio, sound)}
          <label>
            <input type="checkbox" checked={dip} onChange={(e) => fade(e.target.checked)} />
            Fondu bref entre les scènes
          </label>
        </>
      )}
      <button
        className="btn"
        type="button"
        onClick={() =>
          apply(() =>
            composeGuide({
              concept,
              delivery: {
                kind,
                platform,
                calendar: item ? { itemId: item.id, version: item.version } : undefined,
                ...(kind === 'short'
                  ? {
                      transition: dip ? 'dip' : 'cut',
                      audio: audio ? { versionId: audio, gain: 0.8 } : undefined
                    }
                  : {})
              },
              brand: { background: bundle.context.colorPrimary, accent: bundle.context.colorSecondary },
              name: bundle.context.name,
              title: item?.title ?? bundle.project.title,
              offer: item?.offer.name ?? bundle.context.description,
              cta: variant?.cta || bundle.brief?.cta || 'Nous contacter',
              photos,
              logo,
              clip,
              sceneDurationSeconds: bundle.brief?.settings?.defaultSceneDurationSeconds ?? bundle.project.sceneDurationSeconds
            })
          )
        }
      >
        Composer dans l’éditeur
      </button>
    </details>
  );
}
