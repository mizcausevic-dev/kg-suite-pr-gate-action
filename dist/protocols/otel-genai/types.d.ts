export interface RollupRow {
    /** UTC date YYYY-MM-DD, or "all" / "YYYY-MM" depending on bucket. */
    date: string;
    provider: string;
    model: string;
    spans: number;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
    allUnpriced?: boolean;
    currency?: string;
}
export interface RollupReport {
    spans: number;
    rows: RollupRow[];
    totals: {
        spans: number;
        inputTokens: number;
        outputTokens: number;
        costUSD: number;
    };
    window?: {
        from: string;
        to: string;
    };
}
export type ChangeReason = "model-added" | "model-removed" | "provider-added" | "provider-removed" | "spans-jumped" | "spans-dropped" | "input-tokens-jumped" | "output-tokens-jumped" | "cost-increased" | "cost-decreased" | "currency-changed" | "pricing-status-changed" | "window-shifted";
/**
 * Reasons that should fail a CI guardrail: significant cost / token jumps,
 * or surprises like a brand-new model appearing.
 */
export declare const BREAKING_REASONS: ReadonlySet<ChangeReason>;
export interface DiffEntry {
    reason: ChangeReason;
    subject: string;
    detail?: string;
    delta?: number;
    /** Relative delta as a fraction (0.25 = +25%) when applicable. */
    ratio?: number;
}
export interface RollupDiff {
    changes: DiffEntry[];
    breaking: boolean;
    added: {
        models: string[];
        providers: string[];
    };
    removed: {
        models: string[];
        providers: string[];
    };
    totals: {
        previous: {
            spans: number;
            inputTokens: number;
            outputTokens: number;
            costUSD: number;
        };
        next: {
            spans: number;
            inputTokens: number;
            outputTokens: number;
            costUSD: number;
        };
    };
}
export interface DiffOptions {
    /**
     * Minimum relative delta (0..1) to flag a token / span / cost change.
     * Default 0.10 (10%).
     */
    threshold?: number;
    /** When true, fail on any change (even non-breaking ones). */
    strict?: boolean;
}
