import { renderJson } from "../diff/renderJson";
import { renderExplainMarkdown } from "../diff/renderMarkdown";
import { renderNormalizedPlan, renderRawRows } from "../diff/renderTerminal";
import { normalizePlan } from "../parser/normalizePlan";
import { runExplainQueryPlan } from "../sqlite/eqp";
import { connectSqlite } from "../sqlite/connect";
import type { PlanWithRaw } from "../types";
import { formatError, resolveOutputFormat, writeLine } from "./shared";
import type { CommandIO } from "./shared";

export interface ExplainInput {
  dbPath: string;
  query: string;
  params?: unknown[];
}

export function executeExplain(input: ExplainInput): PlanWithRaw {
  const db = connectSqlite(input.dbPath);
  try {
    const rawRows = runExplainQueryPlan(db, input.query, input.params ?? []);
    const normalizedPlan = normalizePlan(rawRows);
    return { rawRows, normalizedPlan };
  } finally {
    db.close();
  }
}

export interface ExplainCommandInput extends ExplainInput {
  json?: boolean;
  format?: string;
}

export function runExplainCommand(input: ExplainCommandInput, io: CommandIO): number {
  try {
    const output = executeExplain(input);
    const format = resolveOutputFormat(input);
    if (format === "json") {
      writeLine(io.out, renderJson(output));
      return 0;
    }

    if (format === "markdown") {
      writeLine(io.out, renderExplainMarkdown(output));
      return 0;
    }

    writeLine(io.out, "Raw EQP Rows");
    writeLine(io.out, renderRawRows(output.rawRows));
    writeLine(io.out);
    writeLine(io.out, "Normalized Summary");
    writeLine(io.out, renderNormalizedPlan(output.normalizedPlan));
    return 0;
  } catch (error) {
    writeLine(io.err, `Error: ${formatError(error)}`);
    return 1;
  }
}
