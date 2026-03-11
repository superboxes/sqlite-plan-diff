import type { EqpRawRow, NormalizedPlan, NormalizedPlanNode, PlanOp } from "../types";

interface NodeRef {
  id: number;
  parent: number;
  node: NormalizedPlanNode;
}

function splitWhereTerms(whereExpr: string | undefined): string[] | undefined {
  if (!whereExpr) {
    return undefined;
  }

  const terms = whereExpr
    .split(/\s+AND\s+/i)
    .map((term) => term.trim())
    .filter(Boolean);

  return terms.length > 0 ? terms : undefined;
}

function parseAccessNode(detail: string, op: "SCAN" | "SEARCH"): Omit<
  NormalizedPlanNode,
  "raw" | "children"
> | null {
  const tableMatch = detail.match(new RegExp(`^${op}\\s+(?:TABLE\\s+)?([^\\s(]+)`, "i"));
  if (!tableMatch) {
    return null;
  }

  const table = tableMatch[1];
  const covering = /USING\s+COVERING\s+(?:INDEX|AUTOMATIC INDEX)/i.test(detail);
  const indexMatch = detail.match(
    /USING\s+(?:COVERING\s+)?(?:INDEX|AUTOMATIC INDEX)\s+([^\s(]+)/i
  );
  const usesPrimaryKey = /USING\s+INTEGER PRIMARY KEY/i.test(detail);
  const whereMatch = detail.match(/\((.+)\)\s*$/);

  return {
    op,
    table,
    index: indexMatch?.[1] ?? (usesPrimaryKey ? "PRIMARY_KEY" : undefined),
    covering: covering || undefined,
    whereTerms: splitWhereTerms(whereMatch?.[1])
  };
}

function normalizeDetail(detail: string): Omit<NormalizedPlanNode, "raw" | "children"> {
  const trimmed = detail.trim();

  const tempBtreeMatch = trimmed.match(/^USE TEMP B-TREE(?: FOR (.+))?/i);
  if (tempBtreeMatch) {
    return {
      op: "TEMP_BTREE",
      tempReason: tempBtreeMatch[1]?.trim()
    };
  }

  const searchNode = parseAccessNode(trimmed, "SEARCH");
  if (searchNode) {
    return searchNode;
  }

  const scanNode = parseAccessNode(trimmed, "SCAN");
  if (scanNode) {
    return scanNode;
  }

  if (/SUBQUERY/i.test(trimmed)) {
    return { op: "SUBQUERY" };
  }

  if (/COMPOUND QUERY|UNION|INTERSECT|EXCEPT/i.test(trimmed)) {
    return { op: "COMPOUND" };
  }

  return { op: "OTHER" };
}

function flatten(roots: NormalizedPlanNode[]): NormalizedPlanNode[] {
  const result: NormalizedPlanNode[] = [];
  const walk = (node: NormalizedPlanNode): void => {
    result.push(node);
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return result;
}

export function normalizePlan(rows: EqpRawRow[]): NormalizedPlan {
  if (rows.length === 0) {
    return { roots: [], allNodes: [] };
  }

  const refs: NodeRef[] = rows.map((row) => {
    const parsed = normalizeDetail(row.detail);
    return {
      id: row.id,
      parent: row.parent,
      node: {
        op: parsed.op as PlanOp,
        table: parsed.table,
        index: parsed.index,
        covering: parsed.covering,
        whereTerms: parsed.whereTerms,
        tempReason: parsed.tempReason,
        raw: row,
        children: []
      }
    };
  });

  const byId = new Map<number, NodeRef>();
  for (const ref of refs) {
    if (!byId.has(ref.id)) {
      byId.set(ref.id, ref);
    }
  }

  const roots: NormalizedPlanNode[] = [];
  for (const ref of refs) {
    const parentRef = byId.get(ref.parent);
    if (!parentRef || ref.parent < 0 || parentRef === ref) {
      roots.push(ref.node);
      continue;
    }

    parentRef.node.children.push(ref.node);
  }

  roots.sort((a, b) => a.raw.id - b.raw.id);
  for (const ref of refs) {
    ref.node.children.sort((a, b) => a.raw.id - b.raw.id);
  }

  return {
    roots,
    allNodes: flatten(roots)
  };
}
