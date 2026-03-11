import { describe, expect, it } from "vitest";
import { semanticDiff } from "../../src/diff/semanticDiff";
import { normalizePlan } from "../../src/parser/normalizePlan";
import type { EqpRawRow } from "../../src/types";

function row(id: number, parent: number, detail: string): EqpRawRow {
  return {
    id,
    parent,
    notused: 0,
    detail,
    raw: { id, parent, notused: 0, detail }
  };
}

describe("semanticDiff", () => {
  it("detects SCAN -> SEARCH and index improvements", () => {
    const before = normalizePlan([row(0, -1, "SCAN users")]);
    const after = normalizePlan([
      row(0, -1, "SEARCH users USING COVERING INDEX idx_users_email (email=?)")
    ]);

    const diff = semanticDiff(before, after);
    const kinds = diff.changes.map((change) => change.kind);

    expect(kinds).toContain("scan_to_search");
    expect(kinds).toContain("index_added");
    expect(kinds).toContain("covering_gained");
  });

  it("detects temporary b-tree introduction", () => {
    const before = normalizePlan([row(0, -1, "SCAN orders")]);
    const after = normalizePlan([
      row(0, -1, "SCAN orders"),
      row(1, 0, "USE TEMP B-TREE FOR ORDER BY")
    ]);

    const diff = semanticDiff(before, after);
    const kinds = diff.changes.map((change) => change.kind);

    expect(kinds).toContain("temp_btree_introduced");
  });

  it("detects major subtree/join order changes", () => {
    const before = normalizePlan([row(0, -1, "SCAN users"), row(1, -1, "SCAN orders")]);
    const after = normalizePlan([row(0, -1, "SCAN orders"), row(1, -1, "SCAN users")]);

    const diff = semanticDiff(before, after);
    const kinds = diff.changes.map((change) => change.kind);

    expect(kinds).toContain("major_subtree_change");
  });
});
