import type { NormalizedPlan, NormalizedPlanNode, SemanticChange, SemanticDiffResult } from "../types";

function accessNodes(plan: NormalizedPlan): NormalizedPlanNode[] {
  return plan.allNodes.filter((node) => (node.op === "SCAN" || node.op === "SEARCH") && Boolean(node.table));
}

function tempBtreeNodes(plan: NormalizedPlan): NormalizedPlanNode[] {
  return plan.allNodes.filter((node) => node.op === "TEMP_BTREE");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function getJoinShape(node: NormalizedPlanNode): string {
  if (node.op === "TEMP_BTREE" || node.op === "OTHER") {
    return node.children.map(getJoinShape).filter(Boolean).join("|");
  }

  const self =
    node.op === "SCAN" || node.op === "SEARCH" ? `ACCESS:${node.table ?? "UNKNOWN"}` : node.op;
  const children = node.children.map(getJoinShape).filter(Boolean).join("|");
  return `${self}[${children}]`;
}

function addChange(changes: SemanticChange[], next: SemanticChange): void {
  const key = `${next.kind}:${next.table ?? ""}:${next.before ?? ""}:${next.after ?? ""}:${next.message}`;
  const exists = changes.some((change) => {
    const other = `${change.kind}:${change.table ?? ""}:${change.before ?? ""}:${change.after ?? ""}:${change.message}`;
    return key === other;
  });

  if (!exists) {
    changes.push(next);
  }
}

export function semanticDiff(before: NormalizedPlan, after: NormalizedPlan): SemanticDiffResult {
  const changes: SemanticChange[] = [];

  const beforeAccess = accessNodes(before);
  const afterAccess = accessNodes(after);

  const beforeByTable = new Map<string, NormalizedPlanNode[]>();
  for (const node of beforeAccess) {
    const table = node.table!;
    const current = beforeByTable.get(table) ?? [];
    current.push(node);
    beforeByTable.set(table, current);
  }

  const afterByTable = new Map<string, NormalizedPlanNode[]>();
  for (const node of afterAccess) {
    const table = node.table!;
    const current = afterByTable.get(table) ?? [];
    current.push(node);
    afterByTable.set(table, current);
  }

  const tables = unique([...beforeByTable.keys(), ...afterByTable.keys()]);
  for (const table of tables) {
    const beforeNodes = beforeByTable.get(table) ?? [];
    const afterNodes = afterByTable.get(table) ?? [];

    if (beforeNodes.length === 0 || afterNodes.length === 0) {
      addChange(changes, {
        kind: "major_subtree_change",
        table,
        message: `Access path for table "${table}" only appears in ${
          beforeNodes.length > 0 ? "before" : "after"
        } plan.`
      });
      continue;
    }

    if (beforeNodes.length !== 1 || afterNodes.length !== 1) {
      addChange(changes, {
        kind: "major_subtree_change",
        table,
        message: `Table "${table}" changed access-node cardinality (${beforeNodes.length} -> ${afterNodes.length}).`
      });
      continue;
    }

    const beforeNode = beforeNodes[0];
    const afterNode = afterNodes[0];
    if (!beforeNode || !afterNode) {
      continue;
    }

    if (beforeNode.op === "SCAN" && afterNode.op === "SEARCH") {
      addChange(changes, {
        kind: "scan_to_search",
        table,
        message: `Table "${table}" improved from SCAN to SEARCH.`
      });
    } else if (beforeNode.op === "SEARCH" && afterNode.op === "SCAN") {
      addChange(changes, {
        kind: "search_to_scan",
        table,
        message: `Table "${table}" regressed from SEARCH to SCAN.`
      });
    }

    const beforeIndex = beforeNode.index ?? null;
    const afterIndex = afterNode.index ?? null;
    if (!beforeIndex && afterIndex) {
      addChange(changes, {
        kind: "index_added",
        table,
        before: null,
        after: afterIndex,
        message: `Table "${table}" now uses index "${afterIndex}".`
      });
    } else if (beforeIndex && !afterIndex) {
      addChange(changes, {
        kind: "index_removed",
        table,
        before: beforeIndex,
        after: null,
        message: `Table "${table}" no longer uses index "${beforeIndex}".`
      });
    } else if (beforeIndex && afterIndex && beforeIndex !== afterIndex) {
      addChange(changes, {
        kind: "index_changed",
        table,
        before: beforeIndex,
        after: afterIndex,
        message: `Table "${table}" changed index "${beforeIndex}" -> "${afterIndex}".`
      });
    }

    const beforeCovering = Boolean(beforeNode.covering);
    const afterCovering = Boolean(afterNode.covering);
    if (!beforeCovering && afterCovering) {
      addChange(changes, {
        kind: "covering_gained",
        table,
        message: `Table "${table}" gained a covering index access path.`
      });
    } else if (beforeCovering && !afterCovering) {
      addChange(changes, {
        kind: "covering_lost",
        table,
        message: `Table "${table}" lost a covering index access path.`
      });
    }
  }

  const beforeTempReasons = unique(
    tempBtreeNodes(before).map((node) => node.tempReason?.toUpperCase().trim() || "UNKNOWN")
  );
  const afterTempReasons = unique(
    tempBtreeNodes(after).map((node) => node.tempReason?.toUpperCase().trim() || "UNKNOWN")
  );

  for (const reason of afterTempReasons) {
    if (!beforeTempReasons.includes(reason)) {
      addChange(changes, {
        kind: "temp_btree_introduced",
        after: reason,
        message: `Temporary B-tree introduced (${reason}).`
      });
    }
  }

  for (const reason of beforeTempReasons) {
    if (!afterTempReasons.includes(reason)) {
      addChange(changes, {
        kind: "temp_btree_removed",
        before: reason,
        message: `Temporary B-tree removed (${reason}).`
      });
    }
  }

  const beforeAccessSeq = beforeAccess.map((node) => node.table ?? "UNKNOWN").join("|");
  const afterAccessSeq = afterAccess.map((node) => node.table ?? "UNKNOWN").join("|");

  const beforeTreeSig = before.roots.map(getJoinShape).filter(Boolean).join("||");
  const afterTreeSig = after.roots.map(getJoinShape).filter(Boolean).join("||");

  if (
    beforeAccess.length !== afterAccess.length ||
    beforeAccessSeq !== afterAccessSeq ||
    beforeTreeSig !== afterTreeSig
  ) {
    addChange(changes, {
      kind: "major_subtree_change",
      message: "Join order or subtree shape changed."
    });
  }

  return { changes };
}
