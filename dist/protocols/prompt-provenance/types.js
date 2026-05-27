// Diff two prompt-provenance documents per prompt-provenance-spec v0.1.
// Reference: https://github.com/mizcausevic-dev/prompt-provenance-spec
/**
 * Reasons that invalidate a downstream consumer's prior assumptions about
 * the prompt's identity, approval, or content. Hash + approval regressions
 * are the headline cases — a downstream agent must not silently keep using
 * a prompt whose content was rewritten or whose approval was revoked.
 */
export const BREAKING_REASONS = new Set([
    "provenance-version-changed",
    "prompt-id-changed",
    "prompt-hash-changed",
    "approval-state-regressed",
    "lineage-parent-changed",
    "intent-out-of-scope-changed"
]);
/** State-machine rank for approval. Used to detect regression. */
export const APPROVAL_RANK = {
    draft: 0,
    proposed: 1,
    approved: 2,
    deprecated: 3,
    revoked: 4
};
