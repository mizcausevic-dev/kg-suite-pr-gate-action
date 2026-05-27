import type { DetectResult } from "./types.js";
/**
 * Detect which protocol a JSON document represents.
 *
 * Resolution order:
 *  1. Explicit `*_version` discriminator fields (high confidence).
 *  2. OTLP envelope (`resourceSpans[]`) — high confidence.
 *  3. MCP `tools/list` result (`tools[]` only) — medium confidence.
 *  4. Shape signals on Suite docs without a version field (low confidence).
 *  5. Fallback to `unknown`.
 *
 * No throws — every input returns a verdict.
 */
export declare function detect(input: unknown): DetectResult;
