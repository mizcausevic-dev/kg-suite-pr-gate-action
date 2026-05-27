import { type DiffOptions, type RollupDiff, type RollupReport } from "./types.js";
/**
 * Diff two otel-genai-rollup outputs and classify each change. Useful as a
 * CI gate between rollup snapshots (today vs yesterday, this PR vs main).
 *
 * Default threshold for token / span / cost jumps is 10%.
 */
export declare function diffRollups(previous: RollupReport, next: RollupReport, opts?: DiffOptions): RollupDiff;
