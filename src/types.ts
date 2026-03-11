export type PlanOp = "SCAN" | "SEARCH" | "TEMP_BTREE" | "SUBQUERY" | "COMPOUND" | "OTHER";

export interface EqpRawRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
  raw: Record<string, unknown>;
}

export interface NormalizedPlanNode {
  op: PlanOp;
  table?: string;
  index?: string;
  covering?: boolean;
  whereTerms?: string[];
  tempReason?: string;
  raw: EqpRawRow;
  children: NormalizedPlanNode[];
}

export interface NormalizedPlan {
  roots: NormalizedPlanNode[];
  allNodes: NormalizedPlanNode[];
}

export type SemanticChangeKind =
  | "scan_to_search"
  | "search_to_scan"
  | "index_added"
  | "index_removed"
  | "index_changed"
  | "covering_gained"
  | "covering_lost"
  | "temp_btree_introduced"
  | "temp_btree_removed"
  | "major_subtree_change";

export interface SemanticChange {
  kind: SemanticChangeKind;
  message: string;
  table?: string;
  before?: string | null;
  after?: string | null;
}

export interface SemanticDiffResult {
  changes: SemanticChange[];
}

export interface PlanWithRaw {
  rawRows: EqpRawRow[];
  normalizedPlan: NormalizedPlan;
}
