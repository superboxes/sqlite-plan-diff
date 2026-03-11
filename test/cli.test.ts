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

describe("CLI", () => {
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
