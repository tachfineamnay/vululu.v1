export interface LlmProvider<Input> {
  generate(
    input: Input,
    options: { signal: AbortSignal; maxCostCents: number; idempotencyKey: string }
  ): Promise<unknown>;
}
