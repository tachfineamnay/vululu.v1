import { ApplicationError } from './errors';
import type { CapabilityInvocation, CapabilityProviderPort, CapabilityResult } from './ports';

export const DEFAULT_INVOCATION_TIMEOUT_MS = 5000;

function validResult(value: unknown, input: CapabilityInvocation): value is CapabilityResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as CapabilityResult;
  if (result.mock !== true || result.providerKey !== input.providerKey || result.modelKey !== input.modelKey || !Number.isSafeInteger(result.costCents) || result.costCents < 0 || !Number.isFinite(result.latencyMs) || result.latencyMs < 0 || !result.output || typeof result.output !== 'object' || Array.isArray(result.output)) return false;
  try {
    const json = JSON.stringify(result.output, (_key, item) => {
      if (item === undefined || ['function', 'symbol', 'bigint'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('invalid_json');
      if (item && typeof item === 'object' && !Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new Error('non_json_object');
      return item;
    });
    if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > 65_536) return false;
    const parsed: unknown = JSON.parse(json);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch { return false; }
}

/** Une tentative bornée : la réponse tardive ne peut produire aucun effet métier. */
export async function invokeCapability(provider: CapabilityProviderPort, input: CapabilityInvocation, timeoutMs = DEFAULT_INVOCATION_TIMEOUT_MS): Promise<CapabilityResult> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new ApplicationError('invocation_policy_invalid', 'Délai d’invocation MOCK invalide.', 409);
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new ApplicationError('invocation_timeout', 'Délai de réponse MOCK dépassé.', 504)); controller.abort(); }, timeoutMs);
  });
  try {
    const invocation = Promise.resolve().then(() => provider.invoke({ ...input, signal: controller.signal })).catch(() => {
      // Ne jamais propager un message du fournisseur : il peut contenir une entrée privée.
      throw new ApplicationError('invocation_failed', 'Échec de l’invocation MOCK.', 502);
    });
    const result = await Promise.race([invocation, timeout]);
    if (!validResult(result, input)) throw new ApplicationError('invocation_invalid_result', 'Résultat MOCK invalide.', 502);
    return result;
  } finally { clearTimeout(timer); }
}
