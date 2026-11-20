/** Client interne worker→python-tools. Jeton partagé, délai borné, aucune URL fournie par l'utilisateur. */
export type PythonToolsConfig = { url: string; token: string; timeoutMs: number };

export function pythonToolsConfig(): PythonToolsConfig | null {
  const url = (process.env.PYTHON_TOOLS_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.PYTHON_TOOLS_TOKEN || '').trim();
  if (!url || token.length < 24) return null;
  const rawTimeout = Number(process.env.PYTHON_TOOLS_TIMEOUT_MS || '30000');
  const timeoutMs = Number.isFinite(rawTimeout) ? Math.min(120_000, Math.max(1_000, rawTimeout)) : 30_000;
  return { url, token, timeoutMs };
}

export class PythonToolsError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryable: boolean, message: string) {
    super(message);
    this.name = 'PythonToolsError';
  }
}

const maxResponseBytes = 48 * 1024 * 1024;
type Envelope = { error?: { code?: string; message?: string; retryable?: boolean } };

export async function callPythonTool(
  capability: 'image.analyze@1' | 'image.segment@1',
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const config = pythonToolsConfig();
  if (!config) throw new PythonToolsError('python_tools_unavailable', 503, true, 'Boîte à outils Python non configurée sur ce serveur.');
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(config.url + '/v1/tools/' + capability, {
      method: 'POST',
      redirect: 'error',
      signal: combined,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.token },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PythonToolsError('python_tools_unreachable', 503, true, 'Boîte à outils Python injoignable.');
  }
  const text = await response.text().catch(() => '');
  if (text.length > maxResponseBytes) {
    throw new PythonToolsError('python_tools_response_too_large', 502, false, 'Réponse de la boîte à outils Python trop volumineuse.');
  }
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!response.ok) {
    const envelope = (parsed as Envelope | null)?.error;
    throw new PythonToolsError(envelope?.code ?? 'python_tools_failed', response.status,
      envelope?.retryable === true, envelope?.message ?? 'Échec de la boîte à outils Python.');
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new PythonToolsError('python_tools_invalid_response', 502, false, 'Réponse de la boîte à outils Python illisible.');
  }
  return parsed;
}
