import type { ChangeReason, ProvenanceDiff } from "./types.js";

const REASON_LABEL: Record<ChangeReason, string> = {
  "provenance-version-changed": "Provenance schema version changed",
  "prompt-id-changed": "Prompt id changed",
  "prompt-version-changed": "Prompt version changed",
  "prompt-hash-changed": "Prompt content hash changed",
  "prompt-content-uri-changed": "Prompt content URI changed",
  "prompt-content-type-changed": "Prompt content type changed",
  "lineage-parent-added": "Lineage parent added",
  "lineage-parent-removed": "Lineage parent removed",
  "lineage-parent-changed": "Lineage parent changed",
  "lineage-derivation-changed": "Lineage derivation note changed",
  "approval-state-advanced": "Approval state advanced",
  "approval-state-regressed": "Approval state regressed",
  "approval-policy-changed": "Approval policy URI changed",
  "authorship-created-by-changed": "Original author changed",
  "authorship-approved-by-changed": "Approver changed",
  "authorship-reviewer-added": "Reviewer added",
  "authorship-reviewer-removed": "Reviewer removed",
  "intent-purpose-changed": "Intent purpose changed",
  "intent-in-scope-changed": "Intent in-scope list changed",
  "intent-out-of-scope-changed": "Intent out-of-scope list changed",
  "intent-models-supported-changed": "Supported model list changed",
  "evaluation-added": "Evaluation added",
  "evaluation-removed": "Evaluation removed",
  "evaluation-result-changed": "Evaluation result changed"
};

export function toMarkdown(diff: ProvenanceDiff): string {
  if (diff.changes.length === 0) return `**No changes.** Provenance documents are equivalent.`;
  const lines: string[] = [];
  lines.push(diff.breaking ? `## Prompt Provenance diff (**BREAKING**)` : `## Prompt Provenance diff`);
  lines.push(``);
  lines.push(`| change | detail |`);
  lines.push(`|---|---|`);
  for (const c of diff.changes) {
    lines.push(`| ${REASON_LABEL[c.reason] ?? c.reason} | ${c.detail ?? ""} |`);
  }
  return lines.join("\n");
}

export function toSummary(diff: ProvenanceDiff): string {
  if (diff.changes.length === 0) return "no changes";
  return `${diff.breaking ? "BREAKING " : ""}${diff.changes.length} change${diff.changes.length === 1 ? "" : "s"}`;
}
