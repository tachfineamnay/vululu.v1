import type {
  CapabilityInvocation,
  CapabilityProviderPort,
  CapabilityResult
} from '@vululu/application';

/**
 * Provider MOCK d agentic capabilities.
 * Aucun reseau, aucun modele, aucun cout reel : le resultat est deterministe.
 * Les tests de fallback utilisent une sous-classe/fake qui leve sur un modele.
 */
export class MockCapabilityProvider implements CapabilityProviderPort {
  constructor(private readonly failModelKeys: ReadonlySet<string> = new Set(), private readonly timeoutModelKeys: ReadonlySet<string> = new Set(), private readonly invalidModelKeys: ReadonlySet<string> = new Set()) {}

  async invoke(input: CapabilityInvocation): Promise<CapabilityResult> {
    if (input.signal?.aborted) throw new Error('mock_aborted');
    if (this.timeoutModelKeys.has(input.modelKey)) return new Promise((_resolve, reject) => input.signal?.addEventListener('abort', () => reject(new Error('mock_aborted')), { once: true }));
    if (this.failModelKeys.has(input.modelKey)) {
      throw new Error('mock_provider_failure:' + input.modelKey);
    }
    return {
      output: this.invalidModelKeys.has(input.modelKey) ? null as unknown as Record<string, unknown> : {
        capabilityKey: input.capabilityKey,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
        deterministic: true,
        echo: input.input
      },
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      costCents: 2,
      latencyMs: 5,
      mock: true
    };
  }
}
