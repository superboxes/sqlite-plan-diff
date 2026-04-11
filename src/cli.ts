#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command, CommanderError } from "commander";
import { runDiffCommand } from "./commands/diff";
import { runExplainCommand } from "./commands/explain";
import { defaultCommandIO, formatError } from "./commands/shared";
import type { CommandIO } from "./commands/shared";
import { runWhatIfCommand } from "./commands/whatif";

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function readVersion(): string {
  try {
    const packageJsonPath = resolve(__dirname, "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function createProgram(io: CommandIO, setExitCode: (code: number) => void): Command {
  const program = new Command();

  program
    .name("sqlite-plan-diff")
    .description("Compare SQLite EXPLAIN QUERY PLAN output semantically.")
    .version(readVersion())
    .showHelpAfterError()
    .configureOutput({
      writeOut: (message) => io.out(message),
      writeErr: (message) => io.err(message)
    });

  program
    .command("explain <dbPath> <query>")
    .description("Run EXPLAIN QUERY PLAN and print raw plus normalized output.")
    .option("-p, --param <value>", "Bind positional parameter (repeatable)", collectValues, [])
    .option("--format <format>", "Output format: terminal, markdown, json")
    .option("--json", "Alias for --format json")
    .action(
      (
        dbPath: string,
        query: string,
        options: { param: string[]; json?: boolean; format?: string }
      ) => {
      const code = runExplainCommand(
        { dbPath, query, params: options.param, json: options.json, format: options.format },
        io
      );
      setExitCode(code);
      }
    );

  program
    .command("diff <dbPath>")
    .description("Compare normalized plans of two queries.")
    .requiredOption("--before <query>", "Query for baseline plan")
    .requiredOption("--after <query>", "Query for candidate plan")
    .option("--before-param <value>", "Bind positional parameter for --before (repeatable)", collectValues, [])
    .option("--after-param <value>", "Bind positional parameter for --after (repeatable)", collectValues, [])
    .option("--format <format>", "Output format: terminal, markdown, json")
    .option("--json", "Alias for --format json")
    .action(
      (
        dbPath: string,
        options: {
          before: string;
          after: string;
          beforeParam: string[];
          afterParam: string[];
          json?: boolean;
          format?: string;
        }
      ) => {
        const code = runDiffCommand(
          {
            dbPath,
            beforeQuery: options.before,
            afterQuery: options.after,
            beforeParams: options.beforeParam,
            afterParams: options.afterParam,
            json: options.json,
            format: options.format
          },
          io
        );
        setExitCode(code);
      }
    );

  program
    .command("whatif <dbPath>")
    .description("Apply hypothetical DDL on a temp DB clone and compare plans.")
    .requiredOption("--query <query>", "Query to analyze")
    .requiredOption("--index <ddl>", "Hypothetical CREATE INDEX statement")
    .option("-p, --param <value>", "Bind positional parameter for --query (repeatable)", collectValues, [])
    .option("--format <format>", "Output format: terminal, markdown, json")
    .option("--json", "Alias for --format json")
    .action(
      async (
        dbPath: string,
        options: { query: string; index: string; param: string[]; json?: boolean; format?: string }
      ) => {
        const code = await runWhatIfCommand(
          {
            dbPath,
            query: options.query,
            indexDdl: options.index,
            params: options.param,
            json: options.json,
            format: options.format
          },
          io
        );
        setExitCode(code);
      }
    );

  return program;
}

export async function runCli(argv: string[], io: CommandIO = defaultCommandIO): Promise<number> {
  let exitCode = 0;
  const program = createProgram(io, (code) => {
    if (code !== 0) {
      exitCode = code;
    }
  });

  program.exitOverride();

  try {
    await program.parseAsync(argv);
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode ?? 1;
    }

    io.err(`Fatal error: ${formatError(error)}\n`);
    return 1;
  }
}

if (require.main === module) {
  runCli(process.argv).then((code) => {
    process.exitCode = code;
  });
}
