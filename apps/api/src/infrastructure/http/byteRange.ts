export type ByteRange = { start: number; end: number };

/**
 * Parse un Range HTTP mono-plage.
 * undefined = pas de header ; null = header invalide ; sinon plage valide.
 * Supporte bytes=start-end, bytes=start-, bytes=-suffixLength.
 */
export function parseByteRange(header: string | undefined, size: number): ByteRange | null | undefined {
  if (!header) return undefined;
  if (!header.startsWith('bytes=') || size <= 0) return null;
  const spec = header.slice('bytes='.length).trim();
  if (!spec || spec.includes(',')) return null;
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) return null;
  const startRaw = match[1];
  const endRaw = match[2];
  if (startRaw === '' && endRaw === '') return null;
  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
      return null;
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}
