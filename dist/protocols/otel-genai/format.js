const REASON_LABEL = {
    "model-added": "Model added",
    "model-removed": "Model removed",
    "provider-added": "Provider added",
    "provider-removed": "Provider removed",
    "spans-jumped": "Span count jumped",
    "spans-dropped": "Span count dropped",
    "input-tokens-jumped": "Input tokens jumped",
    "output-tokens-jumped": "Output tokens jumped",
    "cost-increased": "Cost increased",
    "cost-decreased": "Cost decreased",
    "currency-changed": "Currency changed",
    "pricing-status-changed": "Pricing status changed",
    "window-shifted": "Report window shifted"
};
function formatRatio(r) {
    if (r === undefined || !Number.isFinite(r))
        return r === Number.POSITIVE_INFINITY ? "+∞" : "";
    const pct = r * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
export function toMarkdown(diff) {
    if (diff.changes.length === 0)
        return `**No changes.** Rollups are equivalent within the configured threshold.`;
    const lines = [];
    lines.push(diff.breaking ? `## OTel GenAI rollup diff (**BREAKING**)` : `## OTel GenAI rollup diff`);
    lines.push(``);
    lines.push(`**Totals:** spans ${diff.totals.previous.spans} → ${diff.totals.next.spans} · input tokens ${diff.totals.previous.inputTokens} → ${diff.totals.next.inputTokens} · output tokens ${diff.totals.previous.outputTokens} → ${diff.totals.next.outputTokens} · cost \`$${diff.totals.previous.costUSD.toFixed(4)}\` → \`$${diff.totals.next.costUSD.toFixed(4)}\``);
    lines.push(``);
    lines.push(`| change | subject | delta | detail |`);
    lines.push(`|---|---|---|---|`);
    for (const c of diff.changes) {
        lines.push(`| ${REASON_LABEL[c.reason] ?? c.reason} | \`${c.subject}\` | ${formatRatio(c.ratio)} | ${c.detail ?? ""} |`);
    }
    return lines.join("\n");
}
export function toSummary(diff) {
    if (diff.changes.length === 0)
        return "no changes";
    return `${diff.breaking ? "BREAKING " : ""}${diff.changes.length} change${diff.changes.length === 1 ? "" : "s"}`;
}
