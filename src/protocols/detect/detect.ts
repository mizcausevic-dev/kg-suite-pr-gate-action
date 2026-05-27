import type { DetectResult } from "./types.js";

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

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
export function detect(input: unknown): DetectResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { protocol: "unknown", confidence: "low", reason: "input is not a JSON object" };
  }
  const obj = input as Record<string, unknown>;

  // ─── 1. Explicit version fields ────────────────────────────────────────
  const acv = asString(obj.agent_card_version);
  if (acv) return { protocol: "agent-cards-spec", version: acv, confidence: "high", reason: "agent_card_version field present" };

  const tcv = asString(obj.tool_card_version);
  if (tcv) return { protocol: "mcp-tool-card-spec", version: tcv, confidence: "high", reason: "tool_card_version field present" };

  const ppv = asString(obj.provenance_version);
  if (ppv) return { protocol: "prompt-provenance-spec", version: ppv, confidence: "high", reason: "provenance_version field present" };

  const ebv = asString(obj.evidence_bundle_version);
  if (ebv) return { protocol: "evidence-bundle-spec", version: ebv, confidence: "high", reason: "evidence_bundle_version field present" };

  // ─── 2. OTLP envelope ──────────────────────────────────────────────────
  if (Array.isArray(obj.resourceSpans)) {
    return { protocol: "otel-genai-otlp", confidence: "high", reason: "resourceSpans[] envelope detected" };
  }

  // ─── 3. MCP tools/list result ─────────────────────────────────────────
  if (Array.isArray(obj.tools) && obj.tools.every((t) => typeof t === "object" && t !== null && "name" in t)) {
    return { protocol: "mcp-tools-list", confidence: "medium", reason: "tools[] array with named entries detected" };
  }

  // ─── 4. Shape signals without a version ───────────────────────────────
  if (typeof obj.agent === "object" && typeof obj.capabilities === "object" && typeof obj.refusal_taxonomy !== "undefined") {
    return { protocol: "agent-cards-spec", confidence: "low", reason: "agent + capabilities + refusal_taxonomy shape (no version)" };
  }
  if (typeof obj.tool === "object" && typeof obj.safety === "object" && typeof obj.audit === "object") {
    return { protocol: "mcp-tool-card-spec", confidence: "low", reason: "tool + safety + audit shape (no version)" };
  }
  if (typeof obj.prompt === "object" && typeof obj.lineage === "object" && typeof obj.authorship === "object") {
    return { protocol: "prompt-provenance-spec", confidence: "low", reason: "prompt + lineage + authorship shape (no version)" };
  }
  if (typeof obj.bundle === "object" && Array.isArray(obj.items)) {
    return { protocol: "evidence-bundle-spec", confidence: "low", reason: "bundle + items[] shape (no version)" };
  }

  return { protocol: "unknown", confidence: "low", reason: "no Kinetic Gain Suite discriminators or shape signals matched" };
}
