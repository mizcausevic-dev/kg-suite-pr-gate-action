# kg-suite-pr-gate-action

[![CI](https://github.com/mizcausevic-dev/kg-suite-pr-gate-action/actions/workflows/ci.yml/badge.svg)](https://github.com/mizcausevic-dev/kg-suite-pr-gate-action/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-blue.svg)](LICENSE)

**One PR-gate Action, all five Kinetic Gain Suite protocols.** Walks the repo for changed JSON documents, identifies each one's protocol via [`kg-protocol-detect`](https://github.com/mizcausevic-dev/kg-protocol-detect), dispatches to the right per-protocol diff (AgentCard / MCP Tool Card / prompt-provenance / evidence-bundle / OTel GenAI rollup), and posts a **single consolidated PR comment** with breaking changes flagged per protocol.

Replaces the "wire up five separate `*-diff-action`s" pattern with one workflow step.

Part of the [Kinetic Gain Suite](https://suite.kineticgain.com/).

---

## Usage

```yaml
name: Kinetic Gain Suite PR Gate
on:
  pull_request:
    paths: ["**/*.json"]

jobs:
  suite-pr-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # needed so the Action can git show base.sha:path
      - uses: mizcausevic-dev/kg-suite-pr-gate-action@v0.1-shipped
        with:
          scan-dir: governance     # restrict to the governance/ tree
          fail-on-breaking: true
```

Before this Action, gating five Suite protocols meant wiring five separate steps:

```yaml
# OLD: five Actions, five PR comments, five checks
- uses: mizcausevic-dev/agent-card-diff-action@v0.1-shipped
- uses: mizcausevic-dev/mcp-tool-card-diff-action@v0.1-shipped
- uses: mizcausevic-dev/prompt-provenance-diff-action@v0.1-shipped
- uses: mizcausevic-dev/evidence-bundle-diff-action@v0.1-shipped
- uses: mizcausevic-dev/otel-genai-diff-action@v0.1-shipped
```

Now it's one step, one consolidated PR comment with sections per protocol, one combined breaking/non-breaking exit code.

## Inputs

| input                  | required | default | description |
|---|---|---|---|
| `scan-dir`             |          | `.`     | Directory to walk recursively for JSON files. |
| `base-sha`             |          | `pull_request.base.sha` | Override the base SHA. |
| `comment-on-pr`        |          | `auto`  | `auto` posts only on `pull_request` events. |
| `fail-on-breaking`     |          | `true`  | Fail when ANY changed Suite doc has a BREAKING diff. |
| `fail-on-any-change`   |          | `false` | Fail when ANY changed Suite doc has any diff at all. |
| `otel-genai-threshold` |          | `0.10`  | Threshold for OTel GenAI rollup diffs (0..1). |
| `github-token`         |          | `${{ github.token }}` | Token for posting the PR comment. |

## Outputs

| output           | description |
|---|---|
| `breaking`       | `true` iff ANY changed Suite doc has a BREAKING diff. |
| `change-count`   | Total number of detected changes across all routed Suite docs. |
| `file-count`     | Number of changed Suite doc files that were diffed. |
| `unknown-count`  | Number of changed JSON files that did not match any Suite protocol. |

## How routing works

1. **Walk**: scan `scan-dir` recursively for `*.json` files.
2. **Detect**: run [`kg-protocol-detect`](https://github.com/mizcausevic-dev/kg-protocol-detect) on each (extended locally to recognize OTel GenAI rollup reports).
3. **Dispatch**: route to the right vendored diff library:
   - `agent-cards-spec` → [`diffAgentCards`](https://github.com/mizcausevic-dev/agent-card-diff)
   - `mcp-tool-card-spec` → [`diffToolCards`](https://github.com/mizcausevic-dev/mcp-tool-card-diff)
   - `prompt-provenance-spec` → [`diffProvenance`](https://github.com/mizcausevic-dev/prompt-provenance-diff)
   - `evidence-bundle-spec` → [`diffManifests`](https://github.com/mizcausevic-dev/evidence-bundle-diff)
   - `otel-genai-otlp` (rollup report) → [`diffRollups`](https://github.com/mizcausevic-dev/otel-genai-diff)
4. **Aggregate**: render one structured PR comment with one collapsible section per file, bucketed by protocol.
5. **Gate**: exit 1 if `fail-on-breaking` and any breaking, or `fail-on-any-change` and any change.

## How it handles edge cases

- **New document** (file didn't exist at base SHA) → reported as `_new_`, exits 0.
- **Malformed JSON** → reported as `_skipped_` with the parse error, exits 0.
- **Unknown protocol** (valid JSON but not a Suite doc) → reported as `_skipped_`, counted in `unknown-count`.
- **Empty scan-dir** → exits 0 with empty file list.
- **Non-PR context** (push, manual dispatch) → skips PR comment; still emits aggregated markdown to logs.
- **Threshold validation** — out-of-range `otel-genai-threshold` rejects early.

## Composes with

- [**`kg-protocol-detect-action`**](https://github.com/mizcausevic-dev/kg-protocol-detect-action) — same routing, but inventory-only (no diff). Useful if you want to surface protocol counts without gating.
- [**`agent-card-diff-action`**](https://github.com/mizcausevic-dev/agent-card-diff-action) · [**`mcp-tool-card-diff-action`**](https://github.com/mizcausevic-dev/mcp-tool-card-diff-action) · [**`prompt-provenance-diff-action`**](https://github.com/mizcausevic-dev/prompt-provenance-diff-action) · [**`evidence-bundle-diff-action`**](https://github.com/mizcausevic-dev/evidence-bundle-diff-action) · [**`otel-genai-diff-action`**](https://github.com/mizcausevic-dev/otel-genai-diff-action) — the underlying per-protocol actions. Use these instead if you want one PR check per protocol rather than one consolidated check.
- Fleet-level companions: [`agent-card-fleet-summary-action`](https://github.com/mizcausevic-dev/agent-card-fleet-summary-action) · [`mcp-tool-card-fleet-summary-action`](https://github.com/mizcausevic-dev/mcp-tool-card-fleet-summary-action) · [`prompt-provenance-fleet-summary-action`](https://github.com/mizcausevic-dev/prompt-provenance-fleet-summary-action) · [`evidence-bundle-fleet-summary-action`](https://github.com/mizcausevic-dev/evidence-bundle-fleet-summary-action) · [`otel-genai-fleet-summary-action`](https://github.com/mizcausevic-dev/otel-genai-fleet-summary-action).

## License

[AGPL-3.0-or-later](LICENSE)
