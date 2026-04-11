import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";

function createBufferedIO(): {
  io: { out: (text: string) => void; err: (text: string) => void };
  getOut: () => string;
  getErr: () => string;
} {
  let out = "";
  let err = "";
  return {
    io: {
      out: (text: string) => {
        out += text;
      },
      err: (text: string) => {
        err += text;
      }
    },
    getOut: () => out,
    getErr: () => err
  };
}

const fixtureDb = resolve("test/fixtures/app.db");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
  version: string;
};

describe("CLI", () => {
  it("supports --version with a zero exit code", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(["node", "sqlite-plan-diff", "--version"], buffered.io);

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");
    expect(buffered.getOut().trim()).toBe(packageJson.version);
  });

  it("supports explain with --format markdown", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "explain",
        fixtureDb,
        "select * from users where email = ?",
        "--format",
        "markdown"
      ],
      buffered.io
    );

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");
    expect(buffered.getOut()).toContain("## Raw EQP Rows");
    expect(buffered.getOut()).toContain("## Normalized Summary");
    expect(buffered.getOut()).toContain("```text");
  });

  it("supports explain with --json", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "explain",
        fixtureDb,
        "select * from users where email = ?",
        "--json"
      ],
      buffered.io
    );

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");

    const payload = JSON.parse(buffered.getOut());
    expect(payload.rawRows.length).toBeGreaterThan(0);
    expect(payload.normalizedPlan.roots.length).toBeGreaterThan(0);
  });

  it("supports diff with --json", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "diff",
        fixtureDb,
        "--before",
        "select * from users where name = 'Alice'",
        "--after",
        "select * from users where email = 'alice@example.com'",
        "--json"
      ],
      buffered.io
    );

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");

    const payload = JSON.parse(buffered.getOut());
    expect(Array.isArray(payload.diff.changes)).toBe(true);
    expect(payload.diff.changes.length).toBeGreaterThan(0);
  });

  it("supports diff with --format markdown", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "diff",
        fixtureDb,
        "--before",
        "select * from users where name = 'Alice'",
        "--after",
        "select * from users where email = 'alice@example.com'",
        "--format",
        "markdown"
      ],
      buffered.io
    );

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");
    expect(buffered.getOut()).toContain("## Semantic Diff");
    expect(buffered.getOut()).toContain("[scan_to_search]");
    expect(buffered.getOut()).toContain("## Before Plan");
    expect(buffered.getOut()).toContain("## After Plan");
  });

  it("rejects conflicting --json and --format flags", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "diff",
        fixtureDb,
        "--before",
        "select * from users where name = 'Alice'",
        "--after",
        "select * from users where email = 'alice@example.com'",
        "--json",
        "--format",
        "markdown"
      ],
      buffered.io
    );

    expect(code).toBe(1);
    expect(buffered.getOut()).toBe("");
    expect(buffered.getErr()).toContain('Cannot combine --json with --format');
  });

  it("supports whatif without mutating the source database", async () => {
    const buffered = createBufferedIO();
    const code = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "whatif",
        fixtureDb,
        "--query",
        "select * from orders where customer_id = 42 order by created_at desc",
        "--index",
        "create index idx_orders_customer_created on orders(customer_id, created_at desc)",
        "--json"
      ],
      buffered.io
    );

    expect(code).toBe(0);
    expect(buffered.getErr()).toBe("");

    const payload = JSON.parse(buffered.getOut());
    expect(Array.isArray(payload.diff.changes)).toBe(true);
    expect(payload.diff.changes.length).toBeGreaterThan(0);

    const verify = createBufferedIO();
    const verifyCode = await runCli(
      [
        "node",
        "sqlite-plan-diff",
        "explain",
        fixtureDb,
        "select * from orders where customer_id = 42 order by created_at desc",
        "--json"
      ],
      verify.io
    );

    expect(verifyCode).toBe(0);
    const verifyPayload = JSON.parse(verify.getOut());
    const details: string[] = verifyPayload.rawRows.map((row: { detail: string }) => row.detail);
    expect(details.some((detail) => detail.includes("idx_orders_customer_created"))).toBe(false);
  });
});
