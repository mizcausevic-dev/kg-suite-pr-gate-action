import { APPROVAL_RANK, BREAKING_REASONS } from "./types.js";
function evalKey(e) {
    return `${e.suite}@${e.ran_at ?? "unknown"}`;
}
function arrEquals(a, b) {
    const sa = [...(a ?? [])].sort();
    const sb = [...(b ?? [])].sort();
    if (sa.length !== sb.length)
        return false;
    for (let i = 0; i < sa.length; i++)
        if (sa[i] !== sb[i])
            return false;
    return true;
}
/** Diff two prompt-provenance documents; classify each change and flag breaking. */
export function diffProvenance(previous, next, _opts = {}) {
    assertDoc(previous, "previous");
    assertDoc(next, "next");
    const changes = [];
    const push = (reason, detail) => {
        const e = { reason };
        if (detail !== undefined)
            e.detail = detail;
        changes.push(e);
    };
    // ─── envelope ──────────────────────────────────────────────────────────
    if (previous.provenance_version !== next.provenance_version) {
        push("provenance-version-changed", `${previous.provenance_version} → ${next.provenance_version}`);
    }
    // ─── prompt identity + content ─────────────────────────────────────────
    if (previous.prompt.id !== next.prompt.id)
        push("prompt-id-changed", `${previous.prompt.id} → ${next.prompt.id}`);
    if (previous.prompt.version !== next.prompt.version) {
        push("prompt-version-changed", `${previous.prompt.version} → ${next.prompt.version}`);
    }
    if (previous.prompt.hash !== next.prompt.hash) {
        push("prompt-hash-changed", `${previous.prompt.hash.slice(7, 19)}… → ${next.prompt.hash.slice(7, 19)}…`);
    }
    if ((previous.prompt.content_uri ?? "") !== (next.prompt.content_uri ?? "")) {
        push("prompt-content-uri-changed");
    }
    if ((previous.prompt.content_type ?? "") !== (next.prompt.content_type ?? "")) {
        push("prompt-content-type-changed", `${previous.prompt.content_type ?? "—"} → ${next.prompt.content_type ?? "—"}`);
    }
    // ─── lineage ───────────────────────────────────────────────────────────
    const prevParent = previous.lineage?.parent;
    const nextParent = next.lineage?.parent;
    if (!prevParent && nextParent)
        push("lineage-parent-added", nextParent);
    if (prevParent && !nextParent)
        push("lineage-parent-removed", prevParent);
    if (prevParent && nextParent && prevParent !== nextParent) {
        push("lineage-parent-changed", `${prevParent} → ${nextParent}`);
    }
    if ((previous.lineage?.derivation ?? "") !== (next.lineage?.derivation ?? "")) {
        push("lineage-derivation-changed");
    }
    // ─── approval ──────────────────────────────────────────────────────────
    const prevState = previous.approval.state;
    const nextState = next.approval.state;
    if (prevState !== nextState) {
        const prevRank = APPROVAL_RANK[prevState];
        const nextRank = APPROVAL_RANK[nextState];
        const detail = `${prevState} → ${nextState}`;
        const terminal = ["deprecated", "revoked"];
        if (nextRank < prevRank || terminal.includes(nextState))
            push("approval-state-regressed", detail);
        else
            push("approval-state-advanced", detail);
    }
    if ((previous.approval.policy_uri ?? "") !== (next.approval.policy_uri ?? ""))
        push("approval-policy-changed");
    // ─── authorship ────────────────────────────────────────────────────────
    if (previous.authorship.created_by !== next.authorship.created_by) {
        push("authorship-created-by-changed", `${previous.authorship.created_by} → ${next.authorship.created_by}`);
    }
    if ((previous.authorship.approved_by ?? "") !== (next.authorship.approved_by ?? "")) {
        push("authorship-approved-by-changed", `${previous.authorship.approved_by ?? "—"} → ${next.authorship.approved_by ?? "—"}`);
    }
    const prevR = new Set(previous.authorship.reviewed_by ?? []);
    const nextR = new Set(next.authorship.reviewed_by ?? []);
    for (const r of nextR)
        if (!prevR.has(r))
            push("authorship-reviewer-added", r);
    for (const r of prevR)
        if (!nextR.has(r))
            push("authorship-reviewer-removed", r);
    // ─── intent ────────────────────────────────────────────────────────────
    if ((previous.intent?.purpose ?? "") !== (next.intent?.purpose ?? ""))
        push("intent-purpose-changed");
    if (!arrEquals(previous.intent?.in_scope, next.intent?.in_scope))
        push("intent-in-scope-changed");
    if (!arrEquals(previous.intent?.out_of_scope, next.intent?.out_of_scope))
        push("intent-out-of-scope-changed");
    if (!arrEquals(previous.intent?.models_supported, next.intent?.models_supported))
        push("intent-models-supported-changed");
    // ─── evaluations ───────────────────────────────────────────────────────
    const prevEvals = new Map();
    for (const e of previous.evaluations ?? [])
        prevEvals.set(evalKey(e), e);
    const nextEvals = new Map();
    for (const e of next.evaluations ?? [])
        nextEvals.set(evalKey(e), e);
    const evalAdded = [];
    const evalRemoved = [];
    for (const k of nextEvals.keys()) {
        if (!prevEvals.has(k)) {
            evalAdded.push(k);
            push("evaluation-added", k);
        }
    }
    for (const k of prevEvals.keys()) {
        if (!nextEvals.has(k)) {
            evalRemoved.push(k);
            push("evaluation-removed", k);
        }
    }
    for (const [k, prev] of prevEvals) {
        const next2 = nextEvals.get(k);
        if (!next2)
            continue;
        if (prev.passed !== next2.passed || prev.score !== next2.score) {
            push("evaluation-result-changed", `${k}: passed ${prev.passed ?? "?"} → ${next2.passed ?? "?"}, score ${prev.score ?? "?"} → ${next2.score ?? "?"}`);
        }
    }
    const breaking = changes.some((c) => BREAKING_REASONS.has(c.reason));
    return {
        changes,
        breaking,
        evaluations: { added: evalAdded.sort(), removed: evalRemoved.sort() }
    };
}
function assertDoc(doc, side) {
    if (!doc || typeof doc !== "object")
        throw new Error(`${side} must be a ProvenanceDoc object`);
    if (!doc.prompt)
        throw new Error(`${side}.prompt is required`);
    if (!doc.approval)
        throw new Error(`${side}.approval is required`);
    if (!doc.authorship)
        throw new Error(`${side}.authorship is required`);
}
