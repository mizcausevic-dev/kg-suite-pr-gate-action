// Diff two prompt-provenance documents per prompt-provenance-spec v0.1.
// Reference: https://github.com/mizcausevic-dev/prompt-provenance-spec

export type ApprovalState = "draft" | "proposed" | "approved" | "deprecated" | "revoked";

export interface ProvenanceDoc {
  provenance_version: string;
  prompt: {
    id: string;
    name?: string;
    version: string;
    hash: string;
    content_uri?: string;
    content_type?: string;
  };
  lineage?: {
    parent?: string;
    derivation?: string;
    derived_at?: string;
  };
  authorship: {
    created_by: string;
    reviewed_by?: string[];
    approved_by?: string;
    created_at: string;
    approved_at?: string;
  };
  intent?: {
    purpose?: string;
    in_scope?: string[];
    out_of_scope?: string[];
    models_supported?: string[];
  };
  evaluations?: Array<{
    suite: string;
    result_uri?: string;
    score?: number;
    passed?: boolean;
    ran_at?: string;
  }>;
  approval: {
    state: ApprovalState;
    policy_uri?: string;
  };
}

export type ChangeReason =
  | "provenance-version-changed"
  | "prompt-id-changed"
  | "prompt-version-changed"
  | "prompt-hash-changed"
  | "prompt-content-uri-changed"
  | "prompt-content-type-changed"
  | "lineage-parent-added"
  | "lineage-parent-removed"
  | "lineage-parent-changed"
  | "lineage-derivation-changed"
  | "approval-state-advanced"
  | "approval-state-regressed"
  | "approval-policy-changed"
  | "authorship-created-by-changed"
  | "authorship-approved-by-changed"
  | "authorship-reviewer-added"
  | "authorship-reviewer-removed"
  | "intent-purpose-changed"
  | "intent-in-scope-changed"
  | "intent-out-of-scope-changed"
  | "intent-models-supported-changed"
  | "evaluation-added"
  | "evaluation-removed"
  | "evaluation-result-changed";

/**
 * Reasons that invalidate a downstream consumer's prior assumptions about
 * the prompt's identity, approval, or content. Hash + approval regressions
 * are the headline cases — a downstream agent must not silently keep using
 * a prompt whose content was rewritten or whose approval was revoked.
 */
export const BREAKING_REASONS: ReadonlySet<ChangeReason> = new Set([
  "provenance-version-changed",
  "prompt-id-changed",
  "prompt-hash-changed",
  "approval-state-regressed",
  "lineage-parent-changed",
  "intent-out-of-scope-changed"
]);

/** State-machine rank for approval. Used to detect regression. */
export const APPROVAL_RANK: Record<ApprovalState, number> = {
  draft: 0,
  proposed: 1,
  approved: 2,
  deprecated: 3,
  revoked: 4
};

export interface DiffEntry {
  reason: ChangeReason;
  detail?: string;
}

export interface ProvenanceDiff {
  changes: DiffEntry[];
  breaking: boolean;
  evaluations: { added: string[]; removed: string[] };
}

export interface DiffOptions {
  /** When true, fail on any change (not just breaking ones). */
  strict?: boolean;
}
