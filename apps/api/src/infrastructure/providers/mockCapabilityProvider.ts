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
  constructor(private readonly failModelKeys: ReadonlySet<string> = new Set()) {}

  async invoke(input: CapabilityInvocation): Promise<CapabilityResult> {
    if (this.failModelKeys.has(input.modelKey)) {
      throw new Error('mock_provider_failure:' + input.modelKey);
    }
    return {
      output: {
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
