import {
  BREAKING_REASONS,
  type ChangeReason,
  type DiffEntry,
  type DiffOptions,
  type RollupDiff,
  type RollupReport,
  type RollupRow
} from "./types.js";

function rowKey(r: RollupRow): string {
  return `${r.provider}/${r.model}@${r.date}`;
}

function relDelta(prev: number, next: number): number {
  if (prev === 0 && next === 0) return 0;
  if (prev === 0) return Number.POSITIVE_INFINITY;
  return (next - prev) / prev;
}

/**
 * Diff two otel-genai-rollup outputs and classify each change. Useful as a
 * CI gate between rollup snapshots (today vs yesterday, this PR vs main).
 *
 * Default threshold for token / span / cost jumps is 10%.
 */
export function diffRollups(previous: RollupReport, next: RollupReport, opts: DiffOptions = {}): RollupDiff {
  assertReport(previous, "previous");
  assertReport(next, "next");
  const threshold = opts.threshold ?? 0.1;

  const changes: DiffEntry[] = [];
  const push = (reason: ChangeReason, subject: string, fields: Partial<DiffEntry> = {}): void => {
    const e: DiffEntry = { reason, subject, ...fields };
    changes.push(e);
  };

  // ─── per-row indexing ─────────────────────────────────────────────────
  const prevByKey = new Map<string, RollupRow>();
  for (const r of previous.rows) prevByKey.set(rowKey(r), r);
  const nextByKey = new Map<string, RollupRow>();
  for (const r of next.rows) nextByKey.set(rowKey(r), r);

  // ─── model / provider tracking across the union of rows ───────────────
  const prevModels = new Set(previous.rows.map((r) => r.model));
  const nextModels = new Set(next.rows.map((r) => r.model));
  const prevProviders = new Set(previous.rows.map((r) => r.provider));
  const nextProviders = new Set(next.rows.map((r) => r.provider));

  const addedModels: string[] = [];
  const removedModels: string[] = [];
  const addedProviders: string[] = [];
  const removedProviders: string[] = [];

  for (const m of nextModels) {
    if (!prevModels.has(m)) {
      addedModels.push(m);
      push("model-added", m);
    }
  }
  for (const m of prevModels) {
    if (!nextModels.has(m)) {
      removedModels.push(m);
      push("model-removed", m);
    }
  }
  for (const p of nextProviders) {
    if (!prevProviders.has(p)) {
      addedProviders.push(p);
      push("provider-added", p);
    }
  }
  for (const p of prevProviders) {
    if (!nextProviders.has(p)) {
      removedProviders.push(p);
      push("provider-removed", p);
    }
  }

  // ─── per-row deltas (when key matches) ────────────────────────────────
  for (const [k, prev] of prevByKey) {
    const next2 = nextByKey.get(k);
    if (!next2) continue;

    const spanDelta = next2.spans - prev.spans;
    const spanRatio = relDelta(prev.spans, next2.spans);
    if (Math.abs(spanRatio) >= threshold) {
      push(spanDelta > 0 ? "spans-jumped" : "spans-dropped", k, {
        delta: spanDelta,
        ratio: spanRatio,
        detail: `${prev.spans} → ${next2.spans}`
      });
    }

    const inputRatio = relDelta(prev.inputTokens, next2.inputTokens);
    if (inputRatio >= threshold) {
      push("input-tokens-jumped", k, {
        delta: next2.inputTokens - prev.inputTokens,
        ratio: inputRatio,
        detail: `${prev.inputTokens} → ${next2.inputTokens}`
      });
    }
    const outputRatio = relDelta(prev.outputTokens, next2.outputTokens);
    if (outputRatio >= threshold) {
      push("output-tokens-jumped", k, {
        delta: next2.outputTokens - prev.outputTokens,
        ratio: outputRatio,
        detail: `${prev.outputTokens} → ${next2.outputTokens}`
      });
    }

    const costDelta = next2.costUSD - prev.costUSD;
    const costRatio = relDelta(prev.costUSD, next2.costUSD);
    if (Math.abs(costRatio) >= threshold) {
      push(costDelta > 0 ? "cost-increased" : "cost-decreased", k, {
        delta: costDelta,
        ratio: costRatio,
        detail: `${prev.costUSD.toFixed(4)} → ${next2.costUSD.toFixed(4)} USD`
      });
    }

    if ((prev.currency ?? "USD") !== (next2.currency ?? "USD")) {
      push("currency-changed", k, { detail: `${prev.currency ?? "USD"} → ${next2.currency ?? "USD"}` });
    }
    if ((prev.allUnpriced ?? false) !== (next2.allUnpriced ?? false)) {
      push("pricing-status-changed", k, {
        detail: `allUnpriced: ${prev.allUnpriced ?? false} → ${next2.allUnpriced ?? false}`
      });
    }
  }

  // ─── window shift ─────────────────────────────────────────────────────
  if (previous.window && next.window) {
    if (previous.window.from !== next.window.from || previous.window.to !== next.window.to) {
      push("window-shifted", "report-window", {
        detail: `${previous.window.from}..${previous.window.to} → ${next.window.from}..${next.window.to}`
      });
    }
  }

  const breaking = changes.some((c) => BREAKING_REASONS.has(c.reason));
  return {
    changes,
    breaking,
    added: { models: addedModels.sort(), providers: addedProviders.sort() },
    removed: { models: removedModels.sort(), providers: removedProviders.sort() },
    totals: {
      previous: {
        spans: previous.totals.spans,
        inputTokens: previous.totals.inputTokens,
        outputTokens: previous.totals.outputTokens,
        costUSD: previous.totals.costUSD
      },
      next: {
        spans: next.totals.spans,
        inputTokens: next.totals.inputTokens,
        outputTokens: next.totals.outputTokens,
        costUSD: next.totals.costUSD
      }
    }
  };
}

function assertReport(r: RollupReport, side: string): void {
  if (!r || typeof r !== "object") throw new Error(`${side} must be a RollupReport object`);
  if (!Array.isArray(r.rows)) throw new Error(`${side}.rows must be an array`);
  if (!r.totals || typeof r.totals !== "object") throw new Error(`${side}.totals is required`);
}
