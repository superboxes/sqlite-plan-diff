import type Database from "better-sqlite3";
import type { EqpRawRow } from "../types";

function normalizeEqpRow(input: Record<string, unknown>, index: number): EqpRawRow {
  const id = Number(input.id ?? input.selectid ?? index);
  const parent = Number(input.parent ?? input.order ?? -1);
  const notused = Number(input.notused ?? input.from ?? 0);
  const detail = String(input.detail ?? "");

  return {
    id: Number.isFinite(id) ? id : index,
    parent: Number.isFinite(parent) ? parent : -1,
    notused: Number.isFinite(notused) ? notused : 0,
    detail,
    raw: input
  };
}

function inferPositionalParameterCount(sql: string): number {
  let count = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (!inSingle && !inDouble) {
      if (char === "-" && next === "-") {
        inLineComment = true;
        i += 1;
        continue;
      }

      if (char === "/" && next === "*") {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    if (!inDouble && char === "'" && sql[i - 1] !== "\\") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === '"' && sql[i - 1] !== "\\") {
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && char === "?") {
      count += 1;
    }
  }

  return count;
}

function resolveParameters(sql: string, params: unknown[]): unknown[] {
  if (params.length > 0) {
    return params;
  }

  const inferredCount = inferPositionalParameterCount(sql);
  if (inferredCount === 0) {
    return [];
  }

  return Array.from({ length: inferredCount }, () => null);
}

export function runExplainQueryPlan(
  db: Database.Database,
  query: string,
  params: unknown[] = []
): EqpRawRow[] {
  const sql = `EXPLAIN QUERY PLAN ${query}`;
  const resolved = resolveParameters(query, params);

  try {
    const rows = db.prepare(sql).all(...resolved) as Record<string, unknown>[];
    return rows.map((row, index) => normalizeEqpRow(row, index));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to execute EXPLAIN QUERY PLAN. ${message}. ` +
        "If your query uses placeholders, pass values with --param."
    );
  }
}
