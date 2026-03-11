import { describe, expect, it } from "vitest";
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

describe("normalizePlan", () => {
  it("parses SEARCH node fields conservatively", () => {
    const plan = normalizePlan([
      row(0, -1, "SEARCH users USING COVERING INDEX idx_users_email (email=? AND active=1)")
    ]);

    expect(plan.roots).toHaveLength(1);
    const root = plan.roots[0]!;
    expect(root).toMatchObject({
      op: "SEARCH",
      table: "users",
      index: "idx_users_email",
      covering: true
    });
    expect(root.whereTerms).toEqual(["email=?", "active=1"]);
  });

  it("builds tree shape and captures temp b-tree reason", () => {
    const plan = normalizePlan([
      row(0, -1, "SCAN orders"),
      row(1, 0, "USE TEMP B-TREE FOR ORDER BY")
    ]);

    expect(plan.roots).toHaveLength(1);
    const root = plan.roots[0]!;
    expect(root.children).toHaveLength(1);
    const child = root.children[0]!;
    expect(child).toMatchObject({
      op: "TEMP_BTREE",
      tempReason: "ORDER BY"
    });
  });
});
