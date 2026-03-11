import { renderJson } from "../diff/renderJson";
import { renderNormalizedPlan, renderSemanticDiff } from "../diff/renderTerminal";
import { semanticDiff } from "../diff/semanticDiff";
import { normalizePlan } from "../parser/normalizePlan";
import { connectSqlite } from "../sqlite/connect";
import { runExplainQueryPlan } from "../sqlite/eqp";
import type { PlanWithRaw, SemanticDiffResult } from "../types";
import { formatError, writeLine } from "./shared";
import type { CommandIO } from "./shared";

export interface DiffInput {
  dbPath: string;
  beforeQuery: string;
  afterQuery: string;
  beforeParams?: unknown[];
  afterParams?: unknown[];
}

export interface DiffOutput {
  before: PlanWithRaw;
  after: PlanWithRaw;
  diff: SemanticDiffResult;
}

export function executeDiff(input: DiffInput): DiffOutput {
  const db = connectSqlite(input.dbPath);
  try {
    const beforeRows = runExplainQueryPlan(db, input.beforeQuery, input.beforeParams ?? []);
    const afterRows = runExplainQueryPlan(db, input.afterQuery, input.afterParams ?? []);

    const before = { rawRows: beforeRows, normalizedPlan: normalizePlan(beforeRows) };
    const after = { rawRows: afterRows, normalizedPlan: normalizePlan(afterRows) };
    const diff = semanticDiff(before.normalizedPlan, after.normalizedPlan);

    return { before, after, diff };
  } finally {
    db.close();
  }
}

export interface DiffCommandInput extends DiffInput {
  json?: boolean;
}

export function runDiffCommand(input: DiffCommandInput, io: CommandIO): number {
  try {
    const output = executeDiff(input);
    if (input.json) {
      writeLine(io.out, renderJson(output));
      return 0;
    }

    writeLine(io.out, "Semantic Diff");
    writeLine(io.out, renderSemanticDiff(output.diff));
    writeLine(io.out);
    writeLine(io.out, "Before Plan");
    writeLine(io.out, renderNormalizedPlan(output.before.normalizedPlan));
    writeLine(io.out);
    writeLine(io.out, "After Plan");
    writeLine(io.out, renderNormalizedPlan(output.after.normalizedPlan));
    return 0;
  } catch (error) {
    writeLine(io.err, `Error: ${formatError(error)}`);
    return 1;
  }
}
