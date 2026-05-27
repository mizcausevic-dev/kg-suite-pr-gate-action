import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { detect as standardDetect } from "./protocols/detect/detect.js";
/**
 * Wraps the standard kg-protocol-detect with an extra recognizer for OTel GenAI
 * rollup reports (output of otel-genai-rollup). The standard detect lib only
 * recognizes raw OTLP envelopes; rollup reports are a derived shape with
 * `rows[]` + `totals{}` + optional `window`.
 */
function detect(input) {
    const base = standardDetect(input);
    if (base.protocol !== "unknown")
        return base;
    if (input === null || typeof input !== "object" || Array.isArray(input))
        return base;
    const obj = input;
    const rows = obj.rows;
    const totals = obj.totals;
    if (Array.isArray(rows) &&
        totals !== null &&
        typeof totals === "object" &&
        !Array.isArray(totals) &&
        "costUSD" in totals) {
        return {
            protocol: "otel-genai-otlp",
            confidence: "medium",
            reason: "rollup-report shape (rows[] + totals.costUSD) — output of otel-genai-rollup"
        };
    }
    return base;
}
import { diffAgentCards } from "./protocols/agent-card/diff.js";
import { toMarkdown as toAgentCardMarkdown } from "./protocols/agent-card/format.js";
import { diffToolCards } from "./protocols/mcp-tool-card/diff.js";
import { toMarkdown as toToolCardMarkdown } from "./protocols/mcp-tool-card/format.js";
import { diffProvenance } from "./protocols/prompt-provenance/diff.js";
import { toMarkdown as toProvenanceMarkdown } from "./protocols/prompt-provenance/format.js";
import { diffManifests } from "./protocols/evidence-bundle/diff.js";
import { toMarkdown as toBundleMarkdown } from "./protocols/evidence-bundle/format.js";
import { diffRollups } from "./protocols/otel-genai/diff.js";
import { toMarkdown as toRollupMarkdown } from "./protocols/otel-genai/format.js";
function defaultWalk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".git" || name.startsWith("."))
            continue;
        const p = join(dir, name);
        let st;
        try {
            st = statSync(p);
        }
        catch {
            continue;
        }
        if (st.isDirectory()) {
            out.push(...defaultWalk(p));
        }
        else if (st.isFile() && p.toLowerCase().endsWith(".json")) {
            out.push(p);
        }
    }
    return out;
}
function defaultGitShow(sha, path) {
    try {
        return execSync(`git show ${sha}:${path}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    }
    catch {
        return null;
    }
}
export async function run(env) {
    const scanDir = env.inputs.scan_dir ?? ".";
    const baseShaInput = env.inputs.base_sha ?? "";
    const commentOnPr = env.inputs.comment_on_pr ?? "auto";
    const failOnBreaking = (env.inputs.fail_on_breaking ?? "true").toLowerCase() !== "false";
    const failOnAnyChange = (env.inputs.fail_on_any_change ?? "false").toLowerCase() === "true";
    const otelThresholdRaw = env.inputs.otel_genai_threshold ?? "0.10";
    const otelThreshold = Number.parseFloat(otelThresholdRaw);
    if (!Number.isFinite(otelThreshold) || otelThreshold < 0 || otelThreshold > 1) {
        throw new Error(`input "otel-genai-threshold" must be a finite number in [0,1] — got "${otelThresholdRaw}"`);
    }
    const token = env.inputs.github_token ?? "";
    const walk = env.walk ?? defaultWalk;
    const read = env.readFile ?? ((p) => readFileSync(p, "utf8"));
    const exists = env.exists ?? ((p) => existsSync(p));
    const gitShow = env.gitShow ?? defaultGitShow;
    const write = env.write ?? ((line) => process.stdout.write(`${line}\n`));
    if (!exists(scanDir)) {
        write(`::error::scan-dir "${scanDir}" does not exist on disk.`);
        return { exitCode: 1, files: [], totalChanges: 0, anyBreaking: false, unknownCount: 0, commentPosted: false, reason: "scan-dir not found" };
    }
    // Resolve base SHA.
    let baseSha = baseShaInput;
    if (!baseSha && env.GITHUB_EVENT_PATH && exists(env.GITHUB_EVENT_PATH)) {
        try {
            const event = JSON.parse(read(env.GITHUB_EVENT_PATH));
            baseSha = event.pull_request?.base?.sha ?? "";
        }
        catch {
            // ignore
        }
    }
    const paths = walk(scanDir);
    const files = [];
    for (const path of paths) {
        let nextRaw;
        try {
            nextRaw = read(path);
        }
        catch {
            continue;
        }
        let nextParsed;
        try {
            nextParsed = JSON.parse(nextRaw);
        }
        catch (e) {
            files.push({
                path,
                protocol: "unknown",
                newDoc: false,
                changeCount: 0,
                breaking: false,
                markdown: `- \`${path}\`: malformed JSON (${e.message})`,
                skipped: "malformed-json"
            });
            continue;
        }
        const detected = detect(nextParsed);
        if (detected.protocol === "unknown") {
            files.push({
                path,
                protocol: "unknown",
                newDoc: false,
                changeCount: 0,
                breaking: false,
                markdown: `- \`${path}\`: not a recognized Kinetic Gain Suite document (${detected.reason})`,
                skipped: "unknown-protocol"
            });
            continue;
        }
        // Retrieve previous version at base SHA.
        const prevRaw = baseSha ? gitShow(baseSha, path) : null;
        if (prevRaw === null) {
            files.push({
                path,
                protocol: detected.protocol,
                newDoc: true,
                changeCount: 0,
                breaking: false,
                markdown: `_New \`${detected.protocol}\` document — no previous version at base SHA._`
            });
            continue;
        }
        let prevParsed;
        try {
            prevParsed = JSON.parse(prevRaw);
        }
        catch (e) {
            files.push({
                path,
                protocol: detected.protocol,
                newDoc: true,
                changeCount: 0,
                breaking: false,
                markdown: `_Could not parse previous version (${e.message}) — treating as new doc._`
            });
            continue;
        }
        // Dispatch to the right diff function.
        const dispatched = dispatchDiff(detected.protocol, prevParsed, nextParsed, { otelThreshold });
        files.push({
            path,
            protocol: detected.protocol,
            newDoc: false,
            changeCount: dispatched.changeCount,
            breaking: dispatched.breaking,
            markdown: dispatched.markdown
        });
    }
    const totalChanges = files.reduce((acc, f) => acc + f.changeCount, 0);
    const anyBreaking = files.some((f) => f.breaking);
    const unknownCount = files.filter((f) => f.protocol === "unknown").length;
    const aggregated = renderAggregateMarkdown(files);
    setOutput(env, "breaking", String(anyBreaking));
    setOutput(env, "change-count", String(totalChanges));
    setOutput(env, "file-count", String(files.filter((f) => !f.skipped).length));
    setOutput(env, "unknown-count", String(unknownCount));
    write(`\n${aggregated}\n`);
    const isPullRequest = env.GITHUB_EVENT_NAME === "pull_request";
    const wantsComment = commentOnPr === "true" || (commentOnPr === "auto" && isPullRequest);
    let commentPosted = false;
    let reason;
    if (wantsComment) {
        if (!token) {
            reason = "no github-token provided";
        }
        else if (!env.GITHUB_EVENT_PATH) {
            reason = "no GITHUB_EVENT_PATH";
        }
        else if (!env.GITHUB_REPOSITORY) {
            reason = "no GITHUB_REPOSITORY";
        }
        else {
            const event = JSON.parse(read(env.GITHUB_EVENT_PATH));
            const issueNumber = event.number ?? event.pull_request?.number;
            if (!issueNumber) {
                reason = "no PR number in event payload";
            }
            else {
                const body = `### Kinetic Gain Suite — PR governance gate\n\n${aggregated}\n\n_Generated by [kg-suite-pr-gate-action](https://github.com/mizcausevic-dev/kg-suite-pr-gate-action)._`;
                const poster = env.postComment ?? defaultPostComment;
                await poster({ token, repo: env.GITHUB_REPOSITORY, issueNumber, body });
                commentPosted = true;
            }
        }
    }
    if (failOnBreaking && anyBreaking) {
        write(`::error::Kinetic Gain Suite PR gate — BREAKING change detected across ${files.filter((f) => f.breaking).length} Suite doc(s).`);
        return { exitCode: 1, files, totalChanges, anyBreaking, unknownCount, commentPosted, reason };
    }
    if (failOnAnyChange && totalChanges > 0) {
        write(`::error::Kinetic Gain Suite PR gate — ${totalChanges} change(s) detected and fail-on-any-change=true.`);
        return { exitCode: 1, files, totalChanges, anyBreaking, unknownCount, commentPosted, reason };
    }
    return { exitCode: 0, files, totalChanges, anyBreaking, unknownCount, commentPosted, reason };
}
function dispatchDiff(protocol, prev, next, opts) {
    switch (protocol) {
        case "agent-cards-spec": {
            // @ts-expect-error vendored AgentCard type
            const diff = diffAgentCards(prev, next);
            return { changeCount: diff.changes.length, breaking: diff.breaking, markdown: toAgentCardMarkdown(diff) };
        }
        case "mcp-tool-card-spec": {
            // @ts-expect-error vendored ToolCard type
            const diff = diffToolCards(prev, next);
            return { changeCount: diff.changes.length, breaking: diff.breaking, markdown: toToolCardMarkdown(diff) };
        }
        case "prompt-provenance-spec": {
            // @ts-expect-error vendored ProvenanceDoc type
            const diff = diffProvenance(prev, next);
            return { changeCount: diff.changes.length, breaking: diff.breaking, markdown: toProvenanceMarkdown(diff) };
        }
        case "evidence-bundle-spec": {
            // @ts-expect-error vendored Manifest type
            const diff = diffManifests(prev, next);
            return { changeCount: diff.changes.length, breaking: diff.breaking, markdown: toBundleMarkdown(diff) };
        }
        case "otel-genai-otlp": {
            // OTel GenAI rollup diff (rollup reports, not raw OTLP).
            // @ts-expect-error vendored RollupReport type
            const diff = diffRollups(prev, next, { threshold: opts.otelThreshold });
            return { changeCount: diff.changes.length, breaking: diff.breaking, markdown: toRollupMarkdown(diff) };
        }
        case "mcp-tools-list":
        case "unknown":
        default:
            return { changeCount: 0, breaking: false, markdown: `_No diff library wired for protocol \`${protocol}\` yet._` };
    }
}
function renderAggregateMarkdown(files) {
    if (files.length === 0)
        return "_No JSON files found under scan-dir._";
    const lines = [];
    const totalChanges = files.reduce((acc, f) => acc + f.changeCount, 0);
    const breakingCount = files.filter((f) => f.breaking).length;
    const skippedCount = files.filter((f) => f.skipped).length;
    const routedCount = files.length - skippedCount;
    lines.push(`Scanned **${files.length}** JSON file(s) · routed **${routedCount}** Suite doc(s) · **${totalChanges}** total change(s) · **${breakingCount}** breaking.`);
    lines.push("");
    // Bucket by protocol.
    const byProtocol = new Map();
    for (const f of files) {
        const arr = byProtocol.get(f.protocol) ?? [];
        arr.push(f);
        byProtocol.set(f.protocol, arr);
    }
    for (const [protocol, items] of byProtocol) {
        lines.push(`#### \`${protocol}\` — ${items.length} file(s)`);
        lines.push("");
        for (const item of items) {
            const flag = item.breaking ? " **BREAKING**" : item.newDoc ? " _new_" : item.skipped ? " _skipped_" : "";
            lines.push(`<details><summary><code>${item.path}</code>${flag}</summary>`);
            lines.push("");
            lines.push(item.markdown);
            lines.push("");
            lines.push("</details>");
            lines.push("");
        }
    }
    return lines.join("\n");
}
function setOutput(env, key, value) {
    if (env.GITHUB_OUTPUT)
        appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
async function defaultPostComment(args) {
    const r = await fetch(`https://api.github.com/repos/${args.repo}/issues/${args.issueNumber}/comments`, {
        method: "POST",
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${args.token}`,
            "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({ body: args.body })
    });
    if (!r.ok)
        throw new Error(`GitHub API comment failed: ${r.status} ${await r.text()}`);
}
