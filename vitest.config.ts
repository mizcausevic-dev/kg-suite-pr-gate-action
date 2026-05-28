import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The protocols/ subdirectory is vendored verbatim from the five per-protocol
      // diff libs (agent-card-diff, mcp-tool-card-diff, prompt-provenance-diff,
      // evidence-bundle-diff, otel-genai-diff) — each has its own published test
      // suite. Excluded here so coverage focuses on the orchestrator (runner.ts).
      exclude: [
        "src/cli.ts",
        "src/index.ts",
        "src/types.ts",
        "src/protocols/**"
      ],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 40,
        lines: 75
      }
    }
  }
});
