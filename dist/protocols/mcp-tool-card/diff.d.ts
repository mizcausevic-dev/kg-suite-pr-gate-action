import { type DiffOptions, type ToolCard, type ToolCardDiff } from "./types.js";
/** Diff two MCP Tool Card documents and classify each change. */
export declare function diffToolCards(previous: ToolCard, next: ToolCard, _opts?: DiffOptions): ToolCardDiff;
