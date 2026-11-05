import crypto from 'node:crypto';
import type { SceneRenderInput } from './index';
import { renderText } from './textLayout';

export function normalizeColor(value: string, fallback: string): string {
  return /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value) ? value : fallback;
}

export async function composeScene(input: SceneRenderInput, width: number, height: number) {
  const scale = Math.min(width, height) / 1080; const margin = Math.round(92 * scale); const gap = Math.round(44 * scale);
  const contentWidth = width - margin * 2; const top = Math.round(height * 0.30); const bottom = height - margin - Math.round(100 * scale);
  const landscape = width / height >= 1.4; const titleWidth = landscape ? Math.floor((contentWidth - gap) / 2) : contentWidth;
  const brand = await renderText({ field: 'brand', value: input.brandName, x: margin, y: margin, width: contentWidth, maxHeight: Math.round(height * 0.12), maxFontSize: 32 * scale, minFontSize: 22 * scale, bold: true });
  const title = await renderText({ field: 'title', value: input.title, x: margin, y: top, width: titleWidth, maxHeight: landscape ? bottom - top : Math.round((bottom - top) * 0.4), maxFontSize: 86 * scale, minFontSize: 32 * scale, bold: input.visualStyle !== 'minimal' });
  const descriptionX = landscape ? margin + titleWidth + gap : margin;
  const descriptionY = landscape ? top : top + title.box.height + gap;
  const description = await renderText({ field: 'description', value: input.description, x: descriptionX, y: descriptionY, width: landscape ? contentWidth - titleWidth - gap : contentWidth, maxHeight: bottom - descriptionY, maxFontSize: 36 * scale, minFontSize: 24 * scale });
  const label = await renderText({ field: 'label', value: 'VULULU AI · DÉMO MOCK · v' + input.version, x: margin, y: height - margin - Math.round(30 * scale), width: contentWidth, maxHeight: Math.round(50 * scale), maxFontSize: 24 * scale, minFontSize: 20 * scale });
  const primary = normalizeColor(input.colorPrimary, '#6C5CE7'); const secondary = normalizeColor(input.colorSecondary, '#00D2FF');
  const offset = parseInt(crypto.createHash('sha256').update((input.direction ?? '') + '|' + (input.instruction ?? '')).digest('hex').slice(0, 4), 16) % Math.max(1, Math.floor(width / 3));
  const cx = Math.round((input.version > 1 ? width * 0.65 : width * 0.15) + offset);
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs>
<rect width="${width}" height="${height}" fill="url(#bg)"/>
<circle cx="${cx}" cy="${height * 0.16}" r="${Math.min(width, height) * 0.32}" fill="#ffffff" opacity="${input.visualStyle === 'minimal' ? 0 : input.visualStyle === 'bold' ? 0.30 : 0.15}"/>
<circle cx="${width * 0.85}" cy="${height * 0.9}" r="${Math.min(width, height) * 0.45}" fill="#ffffff" opacity="0.12"/>
<rect width="${width}" height="${height}" fill="#07101e" opacity="0.68"/>
<rect x="${margin / 2}" y="${margin / 2}" width="${width - margin}" height="${height - margin}" rx="${32 * scale}" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="${2 * scale}"/>
<rect x="${margin}" y="${top - 40 * scale}" width="${input.visualStyle === 'bold' ? titleWidth : titleWidth * 0.35}" height="${6 * scale}" fill="#ffffff" opacity="0.7"/>
</svg>`);
  return { background, blocks: [brand, title, description, label] };
}
