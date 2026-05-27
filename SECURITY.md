# Security Policy

`kg-suite-pr-gate-action` reads JSON files under `scan-dir` at the workflow's checkout HEAD, retrieves the previous version of each via `git show`, posts a single PR comment via the GitHub API (when run on a pull_request event with a valid token), and writes structured outputs. No remote fetch beyond the GitHub API comment call, no execution of user-supplied code.

The action uses `${{ github.token }}` by default — scoped to the repository where the workflow runs and never persisted. If you provide your own token via the `github-token` input, ensure it has only `pull-requests: write` permissions.

The `git show` invocation runs in a sub-shell with stdout-only piping. Files are parsed via `JSON.parse` without `eval` or `Function()`. Malformed JSON is caught and reported as `skipped` rather than crashing the run. The `otel-genai-threshold` input is validated to `[0, 1]` before use.

The five per-protocol diff libraries and `kg-protocol-detect` are **vendored** under `src/protocols/` rather than installed at runtime — meaning every release pins a known set of detection rules and diff logic. To update vendored libs, the action must be rebuilt + republished, which keeps the supply chain explicit.

## Supported versions

Only the latest tagged release is supported.

## Reporting a vulnerability

Please use GitHub Security Advisories for private disclosure:

- [Open a security advisory](https://github.com/mizcausevic-dev/kg-suite-pr-gate-action/security/advisories/new)

Do not file public issues for security reports.
