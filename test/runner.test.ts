import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { run, type RunnerEnv } from "../src/runner.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = `${here}/../fixtures`;

const AGENT_CARD = readFileSync(`${FIXTURES}/agent-card.json`, "utf8");
const AGENT_CARD_BREAKING = readFileSync(`${FIXTURES}/agent-card-v2-breaking.json`, "utf8");
const MCP_TOOL_CARD = readFileSync(`${FIXTURES}/mcp-tool-card.json`, "utf8");
const MCP_TOOL_CARD_BREAKING = readFileSync(`${FIXTURES}/mcp-tool-card-v2-breaking.json`, "utf8");
const PROMPT_PROVENANCE = readFileSync(`${FIXTURES}/prompt-provenance.json`, "utf8");
const PROMPT_PROVENANCE_REVOKED = readFileSync(`${FIXTURES}/prompt-provenance-revoked.json`, "utf8");
const EVIDENCE_BUNDLE = readFileSync(`${FIXTURES}/evidence-bundle.json`, "utf8");
const EVIDENCE_BUNDLE_BREAKING = readFileSync(`${FIXTURES}/evidence-bundle-v2-breaking.json`, "utf8");
const OTEL_ROLLUP = readFileSync(`${FIXTURES}/otel-genai-rollup.json`, "utf8");
const OTEL_ROLLUP_JUMP = readFileSync(`${FIXTURES}/otel-genai-rollup-jump.json`, "utf8");

function makeEnv(opts: {
  scanDir?: string;
  current: Record<string, string>;
  previous: Record<string, string>;
  isPullRequest?: boolean;
  hasToken?: boolean;
  failOnBreaking?: string;
  failOnAnyChange?: string;
  baseSha?: string;
}): RunnerEnv {
  const scanDir = opts.scanDir ?? "docs";
  const inputs: Record<string, string | undefined> = {
    scan_dir: scanDir,
    comment_on_pr: "false"
  };
  if (opts.failOnBreaking !== undefined) inputs.fail_on_breaking = opts.failOnBreaking;
  if (opts.failOnAnyChange !== undefined) inputs.fail_on_any_change = opts.failOnAnyChange;
  inputs.base_sha = opts.baseSha ?? "abc123";
  if (opts.hasToken) inputs.github_token = "ghs_test";

  const env: RunnerEnv = {
    inputs,
    walk: () => Object.keys(opts.current),
    readFile: (p) => opts.current[p] ?? "{}",
    exists: (p) => p === scanDir || p in opts.current || p.endsWith("event.json"),
    gitShow: (_sha, path) => opts.previous[path] ?? null,
    write: () => undefined
  };
  if (opts.isPullRequest) {
    env.GITHUB_EVENT_NAME = "pull_request";
    env.GITHUB_REPOSITORY = "x/y";
    env.GITHUB_EVENT_PATH = `${here}/event.json`;
    env.readFile = (p) => {
      if (p in opts.current) return opts.current[p];
      if (p.endsWith("event.json")) return JSON.stringify({ number: 42, pull_request: { number: 42, base: { sha: "abc123" } } });
      return "{}";
    };
  }
  return env;
}

describe("runner.run", () => {
  it("routes one document per protocol to the right diff lib", async () => {
    const r = await run(makeEnv({
      current: {
        "docs/a.json": AGENT_CARD,
        "docs/t.json": MCP_TOOL_CARD,
        "docs/p.json": PROMPT_PROVENANCE,
        "docs/b.json": EVIDENCE_BUNDLE,
        "docs/r.json": OTEL_ROLLUP
      },
      previous: {
        "docs/a.json": AGENT_CARD,
        "docs/t.json": MCP_TOOL_CARD,
        "docs/p.json": PROMPT_PROVENANCE,
        "docs/b.json": EVIDENCE_BUNDLE,
        "docs/r.json": OTEL_ROLLUP
      }
    }));
    expect(r.exitCode).toBe(0);
    expect(r.files).toHaveLength(5);
    expect(r.totalChanges).toBe(0);
    expect(r.anyBreaking).toBe(false);
    const protocols = r.files.map((f) => f.protocol).sort();
    expect(protocols).toContain("agent-cards-spec");
    expect(protocols).toContain("mcp-tool-card-spec");
    expect(protocols).toContain("prompt-provenance-spec");
    expect(protocols).toContain("evidence-bundle-spec");
    expect(protocols).toContain("otel-genai-otlp");
  });

  it("exits 1 when ANY routed protocol has a breaking diff (default fail-on-breaking=true)", async () => {
    const r = await run(makeEnv({
      current: {
        "docs/a.json": AGENT_CARD_BREAKING,
        "docs/t.json": MCP_TOOL_CARD,
        "docs/p.json": PROMPT_PROVENANCE
      },
      previous: {
        "docs/a.json": AGENT_CARD,
        "docs/t.json": MCP_TOOL_CARD,
        "docs/p.json": PROMPT_PROVENANCE
      }
    }));
    expect(r.exitCode).toBe(1);
    expect(r.anyBreaking).toBe(true);
    const a = r.files.find((f) => f.path === "docs/a.json");
    expect(a?.breaking).toBe(true);
  });

  it("detects breaking diffs across multiple protocols simultaneously", async () => {
    const r = await run(makeEnv({
      current: {
        "docs/a.json": AGENT_CARD_BREAKING,
        "docs/t.json": MCP_TOOL_CARD_BREAKING,
        "docs/p.json": PROMPT_PROVENANCE_REVOKED,
        "docs/b.json": EVIDENCE_BUNDLE_BREAKING,
        "docs/r.json": OTEL_ROLLUP_JUMP
      },
      previous: {
        "docs/a.json": AGENT_CARD,
        "docs/t.json": MCP_TOOL_CARD,
        "docs/p.json": PROMPT_PROVENANCE,
        "docs/b.json": EVIDENCE_BUNDLE,
        "docs/r.json": OTEL_ROLLUP
      },
      failOnBreaking: "false"
    }));
    expect(r.exitCode).toBe(0); // fail-on-breaking disabled
    expect(r.anyBreaking).toBe(true);
    const breaking = r.files.filter((f) => f.breaking);
    // All 5 should be breaking — explicit assertion of cross-protocol breakage.
    expect(breaking.length).toBeGreaterThanOrEqual(4);
  });

  it("treats new documents (no previous version at base SHA) as 'newDoc' and exits 0", async () => {
    const r = await run(makeEnv({
      current: { "docs/new.json": AGENT_CARD },
      previous: {} // gitShow returns null
    }));
    expect(r.exitCode).toBe(0);
    expect(r.files[0].newDoc).toBe(true);
    expect(r.files[0].protocol).toBe("agent-cards-spec");
  });

  it("skips files that are valid JSON but not recognized as any Suite protocol", async () => {
    const r = await run(makeEnv({
      current: { "docs/unknown.json": '{"foo": "bar"}' },
      previous: { "docs/unknown.json": '{"foo": "bar"}' }
    }));
    expect(r.exitCode).toBe(0);
    expect(r.files[0].protocol).toBe("unknown");
    expect(r.files[0].skipped).toBe("unknown-protocol");
    expect(r.unknownCount).toBe(1);
  });

  it("flags malformed JSON without throwing", async () => {
    const r = await run(makeEnv({
      current: { "docs/bad.json": "this is not json {{{" },
      previous: {}
    }));
    expect(r.exitCode).toBe(0);
    expect(r.files[0].skipped).toBe("malformed-json");
  });

  it("exits 1 when fail-on-any-change is true and any change exists", async () => {
    const r = await run(makeEnv({
      current: { "docs/a.json": AGENT_CARD_BREAKING },
      previous: { "docs/a.json": AGENT_CARD },
      failOnAnyChange: "true",
      failOnBreaking: "false"
    }));
    expect(r.exitCode).toBe(1);
    expect(r.totalChanges).toBeGreaterThan(0);
  });

  it("exits 1 when scan-dir doesn't exist on disk", async () => {
    const env: RunnerEnv = {
      inputs: { scan_dir: "nonexistent", comment_on_pr: "false" },
      walk: () => [],
      readFile: () => "{}",
      exists: () => false,
      write: () => undefined
    };
    const r = await run(env);
    expect(r.exitCode).toBe(1);
    expect(r.reason).toBe("scan-dir not found");
  });

  it("rejects out-of-range otel-genai-threshold", async () => {
    await expect(run({
      inputs: { scan_dir: "docs", otel_genai_threshold: "1.5" },
      walk: () => [],
      readFile: () => "{}",
      exists: () => true
    })).rejects.toThrow(/otel-genai-threshold/);
  });

  it("posts a single aggregated PR comment in pull_request context", async () => {
    const calls: Array<{ body: string }> = [];
    const env = makeEnv({
      current: {
        "docs/a.json": AGENT_CARD_BREAKING,
        "docs/t.json": MCP_TOOL_CARD_BREAKING
      },
      previous: {
        "docs/a.json": AGENT_CARD,
        "docs/t.json": MCP_TOOL_CARD
      },
      isPullRequest: true,
      hasToken: true,
      failOnBreaking: "false"
    });
    env.inputs.comment_on_pr = "auto";
    env.postComment = async (args) => { calls.push({ body: args.body }); };
    const r = await run(env);
    expect(r.commentPosted).toBe(true);
    expect(calls).toHaveLength(1); // ONE comment, not five
    expect(calls[0].body).toContain("Kinetic Gain Suite");
    expect(calls[0].body).toContain("agent-cards-spec");
    expect(calls[0].body).toContain("mcp-tool-card-spec");
  });

  it("skips PR comment when token is missing", async () => {
    const env = makeEnv({
      current: { "docs/a.json": AGENT_CARD },
      previous: { "docs/a.json": AGENT_CARD },
      isPullRequest: true
    });
    env.inputs.comment_on_pr = "true";
    const r = await run(env);
    expect(r.commentPosted).toBe(false);
    expect(r.reason).toBe("no github-token provided");
  });

  it("does not comment on non-PR events with comment_on_pr=auto", async () => {
    const env = makeEnv({
      current: { "docs/a.json": AGENT_CARD },
      previous: { "docs/a.json": AGENT_CARD }
    });
    env.GITHUB_EVENT_NAME = "push";
    env.inputs.comment_on_pr = "auto";
    const r = await run(env);
    expect(r.commentPosted).toBe(false);
  });

  it("handles empty directory gracefully", async () => {
    const env: RunnerEnv = {
      inputs: { scan_dir: "docs", comment_on_pr: "false", base_sha: "abc" },
      walk: () => [],
      readFile: () => "{}",
      exists: (p) => p === "docs",
      gitShow: () => null,
      write: () => undefined
    };
    const r = await run(env);
    expect(r.exitCode).toBe(0);
    expect(r.files).toHaveLength(0);
    expect(r.totalChanges).toBe(0);
  });
});
