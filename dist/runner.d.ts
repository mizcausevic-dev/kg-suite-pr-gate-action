import type { ProtocolId } from "./protocols/detect/types.js";
export interface FileResult {
    path: string;
    protocol: ProtocolId;
    newDoc: boolean;
    changeCount: number;
    breaking: boolean;
    markdown: string;
    /** Set when protocol = "unknown" or parsing failed. */
    skipped?: string;
}
export interface RunnerEnv {
    inputs: Record<string, string | undefined>;
    GITHUB_OUTPUT?: string;
    GITHUB_EVENT_NAME?: string;
    GITHUB_REPOSITORY?: string;
    GITHUB_EVENT_PATH?: string;
    /** Walk dir + return JSON paths. Defaults to a recursive fs.readdirSync walk. */
    walk?: (dir: string) => string[];
    /** Read current-HEAD file. Defaults to fs.readFileSync. */
    readFile?: (path: string) => string;
    /** Predicate. Defaults to fs.existsSync. */
    exists?: (path: string) => boolean;
    /** Retrieve previous-version content at a SHA. Defaults to `git show`. */
    gitShow?: (sha: string, path: string) => string | null;
    /** PR-comment poster (defaults to GitHub API). */
    postComment?: (args: {
        token: string;
        repo: string;
        issueNumber: number;
        body: string;
    }) => Promise<void>;
    /** Output stream. */
    write?: (line: string) => void;
}
export interface RunnerResult {
    exitCode: 0 | 1;
    files: FileResult[];
    totalChanges: number;
    anyBreaking: boolean;
    unknownCount: number;
    commentPosted: boolean;
    reason?: string;
}
export declare function run(env: RunnerEnv): Promise<RunnerResult>;
