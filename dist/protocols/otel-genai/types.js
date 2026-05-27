// Diff two otel-genai-rollup outputs (per OTel GenAI semconv).
// Reference: https://github.com/mizcausevic-dev/otel-genai-rollup
/**
 * Reasons that should fail a CI guardrail: significant cost / token jumps,
 * or surprises like a brand-new model appearing.
 */
export const BREAKING_REASONS = new Set([
    "model-added",
    "model-removed",
    "cost-increased",
    "input-tokens-jumped",
    "output-tokens-jumped",
    "spans-jumped",
    "currency-changed"
]);
