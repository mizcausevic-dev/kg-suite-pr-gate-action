// Diff two MCP Tool Card documents per
// https://github.com/mizcausevic-dev/mcp-tool-card-spec (v0.1).
/**
 * Reasons that invalidate a downstream operator's prior trust assumptions —
 * a procurement / security reviewer needs to re-approve before consumers ship.
 */
export const BREAKING_REASONS = new Set([
    "side-effect-class-escalated",
    "reversible-flipped-false",
    "rate-limit-removed",
    "pii-exposure-escalated",
    "secrets-exposure-escalated",
    "human-approval-removed",
    "external-system-added",
    "refusal-mode-removed",
    "input-schema-changed",
    "tested-with-provider-removed",
    "tested-with-newly-failing",
    "audit-log-location-removed",
    "audit-retention-reduced"
]);
