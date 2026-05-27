import { type DiffOptions, type ProvenanceDiff, type ProvenanceDoc } from "./types.js";
/** Diff two prompt-provenance documents; classify each change and flag breaking. */
export declare function diffProvenance(previous: ProvenanceDoc, next: ProvenanceDoc, _opts?: DiffOptions): ProvenanceDiff;
