# Changelog

## v0.1.0 — 2026-05-27

- Initial release: single PR-gate GitHub Action that auto-routes every changed Kinetic Gain Suite document in a PR to the right per-protocol diff via `kg-protocol-detect`.
- Inputs: `scan-dir` (default `.`), `base-sha` (default `pull_request.base.sha`), `comment-on-pr` (auto/true/false), `fail-on-breaking` (default true), `fail-on-any-change` (default false), `otel-genai-threshold` (default 0.10), `github-token`.
- Outputs: `breaking`, `change-count`, `file-count`, `unknown-count`.
- **Vendored** the five per-protocol diff libraries (agent-card-diff, mcp-tool-card-diff, prompt-provenance-diff, evidence-bundle-diff, otel-genai-diff) plus `kg-protocol-detect` under `src/protocols/` — fully self-contained, no `npm install` at runtime.
- **Extended detect**: wraps standard `kg-protocol-detect` with a local recognizer for OTel GenAI rollup reports (`rows[]` + `totals.costUSD` shape) so the orchestrator can route them to `diffRollups`.
- **One PR comment**: every file appears in a collapsible `<details>` block, bucketed by protocol, with a `**BREAKING**` flag where applicable.
- Handles edge cases: new documents, malformed JSON, unknown protocols (valid JSON that isn't a Suite doc), empty scan-dir, threshold validation.
- Composite Node 20 action with `dist/index.js` committed for SHA/tag pinning.
- 13 tests with injected `walk`/`readFile`/`gitShow` for hermetic execution — covers single-protocol routing, multi-protocol cross-breaking, new-doc handling, malformed JSON, unknown protocols, and the single-PR-comment guarantee.
- 10 fixtures (one v1 + one v2-breaking pair per protocol) — borrowed from the five `*-diff` libraries.
- Drop-in replacement for "wire up five separate `*-diff-action`s" workflows.
- Node 20/22 CI (lint, typecheck, coverage, build, `npm audit`), AGPL-3.0-or-later, Dependabot.
