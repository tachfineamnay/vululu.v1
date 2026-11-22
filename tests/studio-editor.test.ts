import { describe, expect, it } from 'vitest';
import { creativeLayer, creativeSpec, subtitleCue, type CreativeSpec } from '@vululu/contracts';
import { createTextLayer, moveLayerOrder, withSafeArea, type TextRole } from '../apps/web/lib/studioGeometry';
import {
  describeAudioTrim,
  maxTrackStart,
  sceneTotalSeconds,
  trimAudioToDuration,
  withSceneDuration,
  withoutScene
} from '../apps/web/lib/studioAudio';
import { appendCue, setCueTime } from '../apps/web/lib/studioSubtitles';
import { previewSpecForScene } from '../apps/web/lib/studioPreview';
import { applyChannelPreset, CHANNEL_PRESETS, compatiblePresets } from '../apps/web/lib/studioChannels';

const text = (value: string, y: number) => ({
  type: 'text' as const,
  role: 'headline' as const,
  text: value,
  x: 0.05,
  y,
  w: 0.9,
  h: 0.15,
  size: 48,
  bold: true,
  color: '#ffffff',
  opacity: 1
});

function videoSpec(overrides: Partial<CreativeSpec> = {}): CreativeSpec {
  return creativeSpec.parse({
    schemaVersion: 1,
    delivery: { kind: 'short', platform: 'TikTok' },
    width: 1080,
    height: 1920,
    brand: { background: '#101010', accent: '#ffffff' },
    safeArea: 0.05,
    scenes: [
      { key: 'SCENE-001', seconds: 3, layers: [text('Scène une', 0.4)] },
      { key: 'SCENE-002', seconds: 3, layers: [text('Scène deux', 0.4)] }
    ],
    ...overrides
  });
}

describe('aperçu de scène (studioPreview)', () => {
  it('reste valide quand un sous-titre dépasse la durée de la scène affichée', () => {
    const spec = videoSpec({
      audio: {
        tracks: [],
        subtitles: { enabled: true, language: 'fr-FR', cues: [{ start: 4, end: 5.5, text: 'Bonjour' }] }
      }
    });
    // La spec réduite à la scène 1 avec l'audio était refusée par le serveur.
    expect(creativeSpec.safeParse({ ...spec, scenes: [spec.scenes[0]] }).success).toBe(false);
    const preview = previewSpecForScene(spec, spec.scenes[0]);
    expect(creativeSpec.safeParse(preview)).toMatchObject({ success: true });
    expect(preview.scenes).toHaveLength(1);
    expect(preview.audio).toBeUndefined();
    expect(preview.delivery).toEqual(spec.delivery);
    expect(preview.width).toBe(spec.width);
  });

  it('conserve une composition valide sans audio', () => {
    const spec = videoSpec();
    const preview = previewSpecForScene(spec, spec.scenes[1]);
    expect(creativeSpec.parse(preview).scenes[0].key).toBe('SCENE-002');
  });
});

describe('bornes audio (studioAudio)', () => {
  it('calcule la dernière position de piste admissible', () => {
    expect(maxTrackStart(10)).toBe(9.5);
    expect(maxTrackStart(0.4)).toBe(0);
    expect(maxTrackStart(400)).toBe(179.5);
    expect(sceneTotalSeconds(videoSpec())).toBe(6);
  });

  it('ramène les pistes et retire les sous-titres hors durée, sans casser le contrat', () => {
    // Fixture volontairement hors bornes : construite sans parse, comme une ancienne révision.
    const spec: CreativeSpec = {
      ...videoSpec(),
      audio: {
        tracks: [
          { id: '11111111-1111-4111-8111-111111111111', kind: 'music', versionId: 'v1', start: 40, gain: 0.5, fadeIn: 0, fadeOut: 0 },
          { id: '22222222-2222-4222-8222-222222222222', kind: 'voiceover', versionId: 'v2', start: 1, gain: 0.9, fadeIn: 0, fadeOut: 0 }
        ],
        subtitles: {
          enabled: true,
          language: 'fr-FR',
          cues: [
            { start: 0, end: 2, text: 'Premier' },
            { start: 4, end: 5.5, text: 'Tardif' },
            { start: 5.6, end: 7, text: 'Hors durée' }
          ]
        }
      }
    } as CreativeSpec;
    expect(creativeSpec.safeParse(spec).success).toBe(false);
    const trim = trimAudioToDuration(spec, 4);
    expect(trim.movedTracks).toBe(1);
    expect(trim.removedCues).toBe(2);
    expect(trim.spec.audio?.tracks.map((track) => track.start)).toEqual([3.5, 1]);
    expect(trim.spec.audio?.subtitles?.cues.map((cue) => [cue.start, cue.end])).toEqual([[0, 2]]);
    const parsed = creativeSpec.safeParse(trim.spec);
    expect(parsed.success).toBe(true);
    expect(describeAudioTrim(trim)).toContain('2 sous-titre(s) retiré(s)');
  });

  it('ne crée aucun pas d’historique quand la durée ne change rien', () => {
    const spec = videoSpec();
    const trim = trimAudioToDuration(spec, 6);
    expect(trim.spec).toBe(spec);
    expect(trim.movedTracks + trim.removedCues).toBe(0);
    expect(describeAudioTrim(trim)).toBe('');
  });
});

describe('sous-titres (studioSubtitles)', () => {
  const cue = { start: 1, end: 2, text: 'Déjà là' };

  it('déplace la fin quand le début la dépasse, et inversement', () => {
    const later = setCueTime(cue, 'start', 3.5, 6);
    expect(later.start).toBe(3.5);
    expect(later.end).toBeGreaterThan(later.start + 0.2);
    expect(subtitleCue.safeParse(later).success).toBe(true);

    const earlier = setCueTime(cue, 'end', 0.8, 6);
    expect(earlier.end).toBe(0.8);
    expect(earlier.start).toBeLessThan(earlier.end - 0.2);
    expect(subtitleCue.safeParse(earlier).success).toBe(true);
  });

  it('respecte la durée totale de la vidéo', () => {
    const truncated = setCueTime({ start: 2, end: 5, text: 'Coupe' }, 'end', 99, 3);
    expect(truncated.end).toBeLessThanOrEqual(3);
    expect(subtitleCue.safeParse(truncated).success).toBe(true);
  });

  it('ajoute un repère non vide et sans chevauchement', () => {
    const cues = [
      { start: 0, end: 1, text: 'Un' },
      { start: 1.5, end: 2.5, text: 'Deux' }
    ];
    const next = appendCue(cues, 6);
    expect(next).not.toBeNull();
    const added = next![next!.length - 1];
    expect(added.text.trim().length).toBeGreaterThan(0);
    expect(subtitleCue.safeParse(added).success).toBe(true);
    for (const existing of cues) {
      expect(added.start >= existing.end || added.end <= existing.start).toBe(true);
    }
  });

  it('refuse un nouveau repère quand la durée est saturée', () => {
    expect(appendCue([{ start: 0, end: 0.5, text: 'Plein' }], 0.5)).toBeNull();
  });
});

describe('calques (studioGeometry)', () => {
  it('crée un calque texte valide dans la zone sûre pour chaque rôle', () => {
    const roles: TextRole[] = ['headline', 'body', 'cta'];
    for (const role of roles) {
      const layer = createTextLayer(role, 0.05);
      expect(creativeLayer.safeParse(layer).success).toBe(true);
      expect(layer.type).toBe('text');
      if (layer.type !== 'text') throw new Error('type inattendu');
      expect(layer.x).toBeGreaterThanOrEqual(0.05);
      expect(layer.y).toBeGreaterThanOrEqual(0.05);
      expect(layer.x + layer.w).toBeLessThanOrEqual(0.950001);
      expect(layer.y + layer.h).toBeLessThanOrEqual(0.950001);
      expect(layer.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('ajoute un texte à une composition existante sans la rendre invalide', () => {
    const spec = videoSpec();
    const layers = [...spec.scenes[0].layers, createTextLayer('body', spec.safeArea)];
    const next = { ...spec, scenes: [{ ...spec.scenes[0], layers }, spec.scenes[1]] };
    expect(creativeSpec.safeParse(next).success).toBe(true);
  });

  it('monte et descend un calque en suivant l’ordre de peinture du serveur', () => {
    const layers = [
      { ...text('bas', 0.1) },
      { ...text('milieu', 0.3) },
      { ...text('haut', 0.5) }
    ];
    const raised = moveLayerOrder(layers, 0, 1);
    expect(raised.index).toBe(1);
    expect(raised.layers.map((layer) => (layer.type === 'text' ? layer.text : ''))).toEqual([
      'milieu',
      'bas',
      'haut'
    ]);
    const lowered = moveLayerOrder(layers, 2, -1);
    expect(lowered.index).toBe(1);
    expect(lowered.layers[1]).toEqual(layers[2]);
    // Bornes : aucun changement, même référence (pas d'historique inutile).
    expect(moveLayerOrder(layers, 0, -1).layers).toBe(layers);
    expect(moveLayerOrder(layers, 2, 1).layers).toBe(layers);
  });
});

describe('marge sûre et durées de scène', () => {
  const audioSpec = (): CreativeSpec => ({
    ...videoSpec(),
    audio: {
      tracks: [
        { id: '33333333-3333-4333-8333-333333333333', kind: 'music', versionId: 'v1', start: 5, gain: 0.4, fadeIn: 0, fadeOut: 0 }
      ],
      subtitles: {
        enabled: true,
        language: 'fr-FR',
        cues: [
          { start: 0.5, end: 2.5, text: 'Début' },
          { start: 5, end: 5.8, text: 'Fin' }
        ]
      }
    }
  } as CreativeSpec);

  it('ramène les calques texte dans la nouvelle marge sûre', () => {
    const spec = videoSpec();
    const wide = withSafeArea(spec, 0.2);
    expect(wide.safeArea).toBe(0.2);
    for (const scene of wide.scenes) {
      for (const layer of scene.layers) {
        if (layer.type !== 'text') continue;
        expect(layer.x).toBeGreaterThanOrEqual(0.2);
        expect(layer.y).toBeGreaterThanOrEqual(0.2);
        expect(layer.x + layer.w).toBeLessThanOrEqual(0.8 + 1e-9);
        expect(layer.y + layer.h).toBeLessThanOrEqual(0.8 + 1e-9);
      }
    }
    expect(creativeSpec.safeParse(wide).success).toBe(true);
    expect(withSafeArea(spec, 0.5).safeArea).toBe(0.2); // borne contractuelle
  });

  it('raccourcit une scène en gardant la composition valide', () => {
    const trim = withSceneDuration(audioSpec(), 0, 1);
    expect(sceneTotalSeconds(trim.spec)).toBe(4);
    expect(creativeSpec.safeParse(trim.spec).success).toBe(true);
    expect(trim.spec.audio?.tracks[0].start).toBeLessThan(4);
    expect(trim.spec.audio?.subtitles?.cues.every((cue) => cue.end <= 4)).toBe(true);
  });

  it('retire une scène en gardant la composition valide', () => {
    const trim = withoutScene(audioSpec(), 1);
    expect(trim.spec.scenes.map((scene) => scene.key)).toEqual(['SCENE-001']);
    expect(creativeSpec.safeParse(trim.spec).success).toBe(true);
    const total = sceneTotalSeconds(trim.spec);
    for (const track of trim.spec.audio?.tracks ?? []) expect(track.start).toBeLessThan(total);
    for (const cue of trim.spec.audio?.subtitles?.cues ?? []) expect(cue.end).toBeLessThanOrEqual(total);
  });
});

describe('repères de canal (studioChannels)', () => {
  it('retire les pistes et sous-titres quand la cible est une image', () => {
    const spec: CreativeSpec = {
      ...videoSpec(),
      audio: {
        tracks: [{ id: '44444444-4444-4444-8444-444444444444', kind: 'music', versionId: 'v1', start: 0, gain: 0.5, fadeIn: 0, fadeOut: 0 }],
        subtitles: { enabled: true, language: 'fr-FR', cues: [{ start: 0, end: 2, text: 'Bonjour' }] }
      }
    } as CreativeSpec;
    expect(creativeSpec.safeParse(spec).success).toBe(true);
    const preset = CHANNEL_PRESETS.find((item) => item.id === 'ig-square')!;
    const applied = applyChannelPreset(spec, preset);
    expect(applied.spec.audio).toBeUndefined();
    expect(applied.spec.scenes).toHaveLength(1);
    expect(applied.spec.width).toBe(1080);
    expect(applied.spec.height).toBe(1080);
    const parsed = creativeSpec.safeParse(applied.spec);
    expect(parsed.success).toBe(true);
    expect(applied.note).toContain('sous-titres');
  });

  it('conserve audio et scènes en passant d’une vidéo verticale à une vidéo paysage', () => {
    const spec = videoSpec({
      audio: { tracks: [], subtitles: { enabled: false, language: 'fr-FR', cues: [] } }
    });
    const preset = CHANNEL_PRESETS.find((item) => item.id === 'li-landscape')!;
    const applied = applyChannelPreset(spec, preset);
    expect(applied.spec.scenes).toHaveLength(2);
    expect(applied.spec.audio).toBeDefined();
    expect(applied.spec.width).toBe(1920);
    expect(creativeSpec.safeParse(applied.spec).success).toBe(true);
  });

  it('ne propose que des repères compatibles avec le nombre de scènes', () => {
    expect(compatiblePresets(1).some((preset) => preset.kind === 'carousel')).toBe(false);
    expect(compatiblePresets(3).every((preset) => preset.kind === 'carousel' || preset.kind === 'short' || preset.kind === 'landscape')).toBe(true);
  });
});
