import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { StudioCanvas } from '../apps/web/components/StudioCanvas';

function spec(): CreativeSpec {
  const layer = (value: string, y: number) => ({
    type: 'text' as const,
    role: 'headline' as const,
    text: value,
    x: 0.05,
    y,
    w: 0.9,
    h: 0.15,
    size: 40,
    bold: true,
    color: '#ffffff',
    opacity: 1
  });
  return creativeSpec.parse({
    schemaVersion: 1,
    delivery: { kind: 'square', platform: 'Instagram' },
    width: 1080,
    height: 1080,
    brand: { background: '#101010', accent: '#ffffff' },
    safeArea: 0.05,
    scenes: [
      {
        key: 'SCENE-001',
        seconds: 1,
        layers: [layer('Fond', 0.1), layer('Milieu', 0.4), layer('Dessus', 0.7)]
      }
    ]
  });
}

describe('canvas du Studio — ordre de peinture', () => {
  it('rend les boîtes de calque dans l’ordre du tableau (dernier = au-dessus)', () => {
    const html = renderToStaticMarkup(
      <StudioCanvas
        spec={spec()}
        sceneIndex={0}
        selected={[]}
        sources={[]}
        channel={undefined}
        preview={{ url: null, state: 'idle', message: '' }}
        busy={false}
        onSelect={() => undefined}
        onGestureStart={() => undefined}
        onGestureEnd={() => undefined}
        onChange={() => undefined}
        onRefreshPreview={() => undefined}
      />
    );
    const first = html.indexOf('Calque 1 ·');
    const second = html.indexOf('Calque 2 ·');
    const third = html.indexOf('Calque 3 ·');
    expect(first).toBeGreaterThan(-1);
    // Le DOM doit suivre l'ordre du tableau : un ordre inverse ferait sélectionner le calque
    // masqué au lieu du calque visible (le serveur peint le dernier indice au-dessus).
    expect(first).toBeLessThan(second);
    expect(second).toBeLessThan(third);
  });

  it('décrit le canvas et son état d’aperçu pour les lecteurs d’écran', () => {
    const html = renderToStaticMarkup(
      <StudioCanvas
        spec={spec()}
        sceneIndex={0}
        selected={[2]}
        sources={[]}
        channel={undefined}
        preview={{ url: null, state: 'error', message: 'Rendu indisponible.' }}
        busy={false}
        onSelect={() => undefined}
        onGestureStart={() => undefined}
        onGestureEnd={() => undefined}
        onChange={() => undefined}
        onRefreshPreview={() => undefined}
      />
    );
    expect(html).toContain('aria-label="Canvas de composition · SCENE-001"');
    expect(html).toContain('Aperçu indisponible : Rendu indisponible.');
    expect(html).toContain('Réessayer');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('studio-resize-handles');
  });
});
