import { renderJson } from "../diff/renderJson";
import { renderComparisonMarkdown } from "../diff/renderMarkdown";
import { renderNormalizedPlan, renderSemanticDiff } from "../diff/renderTerminal";
import { semanticDiff } from "../diff/semanticDiff";
import { normalizePlan } from "../parser/normalizePlan";
import { runExplainQueryPlan } from "../sqlite/eqp";
import { connectSqlite } from "../sqlite/connect";
import { cloneDbToTemp } from "../sandbox/cloneDb";
import type { PlanWithRaw, SemanticDiffResult } from "../types";
import { formatError, resolveOutputFormat, writeLine } from "./shared";
import type { CommandIO } from "./shared";

export interface WhatIfInput {
  dbPath: string;
  query: string;
  indexDdl: string;
  params?: unknown[];
}

export interface WhatIfOutput {
  before: PlanWithRaw;
  after: PlanWithRaw;
  diff: SemanticDiffResult;
}

export async function executeWhatIf(input: WhatIfInput): Promise<WhatIfOutput> {
  const cloned = await cloneDbToTemp(input.dbPath);
  let db: ReturnType<typeof connectSqlite> | undefined;

  try {
    db = connectSqlite(cloned.path);
    const beforeRows = runExplainQueryPlan(db, input.query, input.params ?? []);

    try {
      db.exec(input.indexDdl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply hypothetical DDL: ${message}`);
    }

    const afterRows = runExplainQueryPlan(db, input.query, input.params ?? []);

    const before = { rawRows: beforeRows, normalizedPlan: normalizePlan(beforeRows) };
    const after = { rawRows: afterRows, normalizedPlan: normalizePlan(afterRows) };
    const diff = semanticDiff(before.normalizedPlan, after.normalizedPlan);

    return { before, after, diff };
  } finally {
    if (db) {
      db.close();
    }
    await cloned.cleanup();
  }
}

export interface WhatIfCommandInput extends WhatIfInput {
  json?: boolean;
  format?: string;
}

export async function runWhatIfCommand(input: WhatIfCommandInput, io: CommandIO): Promise<number> {
  try {
    const output = await executeWhatIf(input);
    const format = resolveOutputFormat(input);
    if (format === "json") {
      writeLine(io.out, renderJson(output));
      return 0;
    }

    if (format === "markdown") {
      writeLine(io.out, renderComparisonMarkdown(output));
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
