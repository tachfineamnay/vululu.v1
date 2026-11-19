'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { z } from 'zod';
import { A2uiSurface, type ReactCatalogComponent, createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog, MessageProcessor } from '@a2ui/web_core/v0_9';
import { reviewSurface, type ActionPreview } from '@vululu/contracts';
const content = createContext<ReactNode>(null);
function Review() {
  return <section aria-label="Révision A2UI">{useContext(content)}</section>;
}
const review = createComponentImplementation(
  { name: 'CreativeReview', schema: z.object({}).strict() },
  Review
);
const form = createComponentImplementation({ name: 'CreativeForm', schema: z.object({}).strict() }, () => (
  <section aria-label="Paramètres A2UI">{useContext(content)}</section>
));
const catalog = new Catalog('https://vululu.invalid/catalog/creative-v1', 'v0.9', [review, form], []);
export default function CreativeReviewSurface({
  surface,
  children
}: {
  surface?: ActionPreview['surface'];
  children: ReactNode;
}) {
  const model = useMemo(() => {
    const msg = surface
        ? reviewSurface.parse(surface)
        : {
            version: 'v0.9' as const,
            updateComponents: {
              surfaceId: 'creative-form',
              components: [{ id: 'root', component: 'CreativeForm' }]
            }
          },
      surfaceId = msg.updateComponents.surfaceId,
      p = new MessageProcessor<ReactCatalogComponent>([catalog]);
    p.processMessages([{ version: 'v0.9', createSurface: { surfaceId, catalogId: catalog.id } }, msg]);
    const m = p.model.surfacesMap.get(surfaceId);
    if (!m) throw Error('Surface indisponible');
    return m;
  }, [surface]);
  return (
    <content.Provider value={children}>
      <A2uiSurface surface={model} />
    </content.Provider>
  );
}
