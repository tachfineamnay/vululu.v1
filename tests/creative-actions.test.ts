import { expect, it } from 'vitest';
import { creativeAction, creativeApproval, creativeReview, creativeSpec } from '@vululu/contracts';
import { editScene, localTranslator, previewOf } from '../apps/api/src/application/creativeActions';
const image = {
    type: 'image',
    versionId: 'a',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    opacity: 1,
    gravity: 'centre',
    fit: 'cover'
  },
  cta = {
    type: 'text',
    role: 'cta',
    text: 'Avant',
    x: 0.1,
    y: 0.3,
    w: 0.8,
    h: 0.2,
    size: 20,
    color: '#ffffff',
    bold: true,
    opacity: 1
  };
const spec = creativeSpec.parse({
  schemaVersion: 1,
  brand: { accent: '#ffffff', background: '#000000' },
  width: 1080,
  height: 1920,
  safeArea: 0.05,
  delivery: { kind: 'short', platform: 'Instagram' },
  scenes: [1, 2].map((n) => ({ key: 'SCENE-00' + n, seconds: 1, layers: [image, cta] }))
});
const header = {
  schemaVersion: 1,
  target: { projectId: 'mine', sceneKey: 'SCENE-002' },
  expectedRevision: 2,
  estimatedCostCents: 0,
  authorization: 'project-owner:confirm'
};
const opts = { signal: new AbortController().signal, idempotencyKey: 'test', maxCostCents: 0 };
it('applies eight closed operations atomically; never rewrites the input or another scene', () => {
  const a = creativeAction.parse({
    ...header,
    changes: [
      { operation: 'cta', parameters: { text: 'Réserver' } },
      { operation: 'text', parameters: { layer: 1, text: 'Visiter' } },
      { operation: 'color', parameters: { background: '#aabbcc' } },
      { operation: 'crop', parameters: { layer: 0, gravity: 'east', fit: 'contain' } },
      { operation: 'replace', parameters: { layer: 0, versionId: 'b' } },
      { operation: 'duration', parameters: { seconds: 2.5 } },
      { operation: 'transition', parameters: { style: 'dip' } },
      { operation: 'move', parameters: { position: 1 } }
    ]
  });
  const next = editScene(spec, a);
  expect(next.scenes[1]).toEqual(spec.scenes[0]);
  expect(next.scenes[0]).toMatchObject({
    key: 'SCENE-002',
    background: '#aabbcc',
    seconds: 2.5,
    transition: 'dip',
    layers: [{ versionId: 'b', gravity: 'east', fit: 'contain' }, { text: 'Visiter' }]
  });
  expect(spec.scenes[1].layers[1]).toMatchObject({ text: 'Avant' });
});
it('fails closed on unknown controls, functions, HTML, paid estimates and invalid layer types', () => {
  const action = creativeAction.parse({
    ...header,
    changes: [{ operation: 'replace', parameters: { layer: 1, versionId: 'x' } }]
  });
  expect(() => previewOf(spec, action)).toThrow();
  expect(creativeAction.safeParse({ ...action, estimatedCostCents: 1 }).success).toBe(false);
  for (const bad of [
    { component: 'HTML', html: '<div/>' },
    { component: 'CreativeReview', onClick: 'execute' },
    { component: 'CreativeReview', data: { functionCall: 'x' } }
  ])
    expect(
      creativeApproval.safeParse({
        approved: true,
        action,
        digest: '0'.repeat(64),
        surface: {
          ...creativeReview,
          updateComponents: { surfaceId: 'creative-review', components: [{ id: 'root', ...bad }] }
        }
      }).success
    ).toBe(false);
});
it('understands explicit natural edits and rejects unknown clauses without a partial action', async () => {
  const translate = (prompt: string) =>
    localTranslator.generate({ prompt, keys: spec.scenes.map((x) => x.key), selected: 'SCENE-001' }, opts);
  expect(await translate('Change the CTA of scene two to "Visit" and its color to #aaccee')).toEqual({
    sceneKey: 'SCENE-002',
    changes: [
      { operation: 'cta', parameters: { text: 'Visit' } },
      { operation: 'color', parameters: { background: '#aaccee' } }
    ]
  });
  for (const bad of [
    'scene 0: duration 2',
    'scene 2: duration 2; publish it',
    'CTA "incomplete',
    'scene 2: color #abcdef;'
  ])
    await expect(translate(bad)).rejects.toThrow();
});
