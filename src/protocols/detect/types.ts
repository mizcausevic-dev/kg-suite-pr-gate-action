// Sniff which Kinetic Gain Suite spec (or OTel GenAI OTLP envelope) a JSON
// document represents by inspecting the version discriminator + a few
// well-known shape signals.

export type ProtocolId =
  | "agent-cards-spec"
  | "mcp-tool-card-spec"
  | "prompt-provenance-spec"
  | "evidence-bundle-spec"
  | "otel-genai-otlp"
  | "mcp-tools-list"
  | "unknown";

export type Confidence = "high" | "medium" | "low";

export interface DetectResult {
  protocol: ProtocolId;
  version?: string;
  confidence: Confidence;
  /** Brief explanation of how this verdict was reached. */
  reason: string;
}
