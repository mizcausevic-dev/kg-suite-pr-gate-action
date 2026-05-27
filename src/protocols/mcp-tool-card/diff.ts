import {
  BREAKING_REASONS,
  type ChangeReason,
  type DiffEntry,
  type DiffOptions,
  type PiiExposure,
  type SecretsExposure,
  type SideEffectClass,
  type ToolCard,
  type ToolCardDiff
} from "./types.js";

const SIDE_EFFECT_RANK: Record<SideEffectClass, number> = {
  read: 0,
  mutating: 1,
  external: 2,
  destructive: 3
};
const PII_RANK: Record<PiiExposure, number> = { none: 0, low: 1, medium: 2, high: 3 };
const SECRET_RANK: Record<SecretsExposure, number> = {
  none: 0,
  reads_secret_material: 1,
  writes_secret_material: 2,
  handles_keys: 3
};

function diffSet<T extends string>(prev: T[] | undefined, next: T[] | undefined): { added: T[]; removed: T[] } {
  const a = new Set(prev ?? []);
  const b = new Set(next ?? []);
  return {
    added: [...b].filter((x) => !a.has(x)).sort(),
    removed: [...a].filter((x) => !b.has(x)).sort()
  };
}

function schemaChanged(
  prev: ToolCard["schema"],
  next: ToolCard["schema"],
  key: "input_schema_inline" | "output_schema_inline" | "input_schema_uri" | "output_schema_uri"
): boolean {
  const p = prev[key];
  const n = next[key];
  return JSON.stringify(p ?? null) !== JSON.stringify(n ?? null);
}

/** Diff two MCP Tool Card documents and classify each change. */
export function diffToolCards(previous: ToolCard, next: ToolCard, _opts: DiffOptions = {}): ToolCardDiff {
  assertCard(previous, "previous");
  assertCard(next, "next");

  const changes: DiffEntry[] = [];
  const push = (reason: ChangeReason, detail?: string): void => {
    const e: DiffEntry = { reason };
    if (detail !== undefined) e.detail = detail;
    changes.push(e);
  };

  // ─── meta ──────────────────────────────────────────────────────────────
  if (previous.tool_card_version !== next.tool_card_version) {
    push("card-version-changed", `${previous.tool_card_version} → ${next.tool_card_version}`);
  }
  if (previous.tool.version !== next.tool.version) {
    push("tool-version-changed", `${previous.tool.version} → ${next.tool.version}`);
  }
  if (previous.tool.description !== next.tool.description) {
    push("tool-description-changed");
  }
  if (previous.tool.mcp_server_uri !== next.tool.mcp_server_uri) {
    push("mcp-server-uri-changed", `${previous.tool.mcp_server_uri} → ${next.tool.mcp_server_uri}`);
  }

  // ─── safety ────────────────────────────────────────────────────────────
  const sed = SIDE_EFFECT_RANK[next.safety.side_effect_class] - SIDE_EFFECT_RANK[previous.safety.side_effect_class];
  if (sed > 0) push("side-effect-class-escalated", `${previous.safety.side_effect_class} → ${next.safety.side_effect_class}`);
  else if (sed < 0) push("side-effect-class-relaxed", `${previous.safety.side_effect_class} → ${next.safety.side_effect_class}`);

  if (previous.safety.reversible && !next.safety.reversible) push("reversible-flipped-false");
  if (!previous.safety.reversible && next.safety.reversible) push("reversible-flipped-true");

  if (previous.safety.rate_limited && !next.safety.rate_limited) push("rate-limit-removed");
  if (!previous.safety.rate_limited && next.safety.rate_limited) push("rate-limit-added");

  const piiD = PII_RANK[next.safety.pii_exposure] - PII_RANK[previous.safety.pii_exposure];
  if (piiD > 0) push("pii-exposure-escalated", `${previous.safety.pii_exposure} → ${next.safety.pii_exposure}`);
  else if (piiD < 0) push("pii-exposure-relaxed", `${previous.safety.pii_exposure} → ${next.safety.pii_exposure}`);

  const secD = SECRET_RANK[next.safety.secrets_exposure] - SECRET_RANK[previous.safety.secrets_exposure];
  if (secD > 0) push("secrets-exposure-escalated", `${previous.safety.secrets_exposure} → ${next.safety.secrets_exposure}`);
  else if (secD < 0) push("secrets-exposure-relaxed", `${previous.safety.secrets_exposure} → ${next.safety.secrets_exposure}`);

  if (previous.safety.human_approval_required && !next.safety.human_approval_required) push("human-approval-removed");
  if (!previous.safety.human_approval_required && next.safety.human_approval_required) push("human-approval-added");

  // ─── external systems / refusal modes ──────────────────────────────────
  const xs = diffSet(previous.safety.external_systems, next.safety.external_systems);
  for (const s of xs.added) push("external-system-added", s);
  for (const s of xs.removed) push("external-system-removed", s);

  const rm = diffSet(previous.safety.refusal_modes, next.safety.refusal_modes);
  for (const s of rm.added) push("refusal-mode-added", s);
  for (const s of rm.removed) push("refusal-mode-removed", s);

  // ─── schema ────────────────────────────────────────────────────────────
  if (schemaChanged(previous.schema, next.schema, "input_schema_inline") || schemaChanged(previous.schema, next.schema, "input_schema_uri")) {
    push("input-schema-changed");
  }
  if (schemaChanged(previous.schema, next.schema, "output_schema_inline") || schemaChanged(previous.schema, next.schema, "output_schema_uri")) {
    push("output-schema-changed");
  }

  // ─── tested_with ───────────────────────────────────────────────────────
  const prevProviders = new Map((previous.tested_with ?? []).map((t) => [`${t.provider}/${t.model}`, t]));
  const nextProviders = new Map((next.tested_with ?? []).map((t) => [`${t.provider}/${t.model}`, t]));
  const provDiff = diffSet([...prevProviders.keys()], [...nextProviders.keys()]);
  for (const k of provDiff.removed) push("tested-with-provider-removed", k);
  for (const k of [...nextProviders.keys()]) {
    const before = prevProviders.get(k);
    const after = nextProviders.get(k);
    if (before && after && before.passed && !after.passed) {
      push("tested-with-newly-failing", k);
    }
  }
  // Surface added providers via the returned set rather than as a flagged change.
  const testedAdded = provDiff.added;
  const testedRemoved = provDiff.removed;

  // ─── audit ─────────────────────────────────────────────────────────────
  const auditLogs = diffSet(previous.audit?.log_locations, next.audit?.log_locations);
  for (const s of auditLogs.removed) push("audit-log-location-removed", s);

  if (
    previous.audit?.retention_days !== undefined &&
    next.audit?.retention_days !== undefined &&
    next.audit.retention_days < previous.audit.retention_days
  ) {
    push("audit-retention-reduced", `${previous.audit.retention_days}d → ${next.audit.retention_days}d`);
  }

  const breaking = changes.some((c) => BREAKING_REASONS.has(c.reason));
  return {
    changes,
    breaking,
    added: {
      externalSystems: xs.added,
      refusalModes: rm.added,
      testedProviders: testedAdded,
      auditLogs: auditLogs.added
    },
    removed: {
      externalSystems: xs.removed,
      refusalModes: rm.removed,
      testedProviders: testedRemoved,
      auditLogs: auditLogs.removed
    }
  };
}

function assertCard(card: ToolCard, side: string): void {
  if (!card || typeof card !== "object") throw new Error(`${side} must be a ToolCard object`);
  if (!card.tool) throw new Error(`${side}.tool is required`);
  if (!card.safety) throw new Error(`${side}.safety is required`);
  if (!card.schema) throw new Error(`${side}.schema is required`);
}
