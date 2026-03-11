import type { EqpRawRow, NormalizedPlan, NormalizedPlanNode, SemanticDiffResult } from "../types";

function formatNodeLabel(node: NormalizedPlanNode): string {
  const segments: string[] = [node.op];
  if (node.table) {
    segments.push(`table=${node.table}`);
  }
  if (node.index) {
    segments.push(`index=${node.index}`);
  }
  if (node.covering) {
    segments.push("covering=true");
  }
  if (node.whereTerms && node.whereTerms.length > 0) {
    segments.push(`where=${node.whereTerms.join(" AND ")}`);
  }
  if (node.tempReason) {
    segments.push(`reason=${node.tempReason}`);
  }
  if (node.op === "OTHER" || node.op === "SUBQUERY" || node.op === "COMPOUND") {
    segments.push(`detail="${node.raw.detail}"`);
  }
  return segments.join(" | ");
}

function renderTreeNode(node: NormalizedPlanNode, prefix: string, isLast: boolean): string[] {
  const branch = prefix.length === 0 ? "" : isLast ? "└─ " : "├─ ";
  const nextPrefix = prefix.length === 0 ? "" : isLast ? `${prefix}   ` : `${prefix}│  `;
  const lines = [`${prefix}${branch}${formatNodeLabel(node)}`];

  node.children.forEach((child, index) => {
    lines.push(...renderTreeNode(child, nextPrefix, index === node.children.length - 1));
  });

  return lines;
}

export function renderRawRows(rows: EqpRawRow[]): string {
  if (rows.length === 0) {
    return "No EQP rows returned.";
  }

  const lines = rows.map(
    (row) => `- id=${row.id} parent=${row.parent} notused=${row.notused} detail=${row.detail}`
  );
  return lines.join("\n");
}

export function renderNormalizedPlan(plan: NormalizedPlan): string {
  if (plan.roots.length === 0) {
    return "No normalized nodes.";
  }

  const lines: string[] = [];
  plan.roots.forEach((root, index) => {
    lines.push(...renderTreeNode(root, "", index === plan.roots.length - 1));
  });
  return lines.join("\n");
}

export function renderSemanticDiff(result: SemanticDiffResult): string {
  if (result.changes.length === 0) {
    return "No semantic changes detected.";
  }

  return result.changes.map((change) => `- [${change.kind}] ${change.message}`).join("\n");
}
