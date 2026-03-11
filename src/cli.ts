#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { runDiffCommand } from "./commands/diff";
import { runExplainCommand } from "./commands/explain";
import { defaultCommandIO, formatError } from "./commands/shared";
import type { CommandIO } from "./commands/shared";
import { runWhatIfCommand } from "./commands/whatif";

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function createProgram(io: CommandIO, setExitCode: (code: number) => void): Command {
  const program = new Command();

  program
    .name("sqlite-plan-diff")
    .description("Compare SQLite EXPLAIN QUERY PLAN output semantically.")
    .version("0.1.0")
    .showHelpAfterError()
    .configureOutput({
      writeOut: (message) => io.out(message),
      writeErr: (message) => io.err(message)
    });

  program
    .command("explain <dbPath> <query>")
    .description("Run EXPLAIN QUERY PLAN and print raw plus normalized output.")
    .option("-p, --param <value>", "Bind positional parameter (repeatable)", collectValues, [])
    .option("--json", "Print JSON output")
    .action((dbPath: string, query: string, options: { param: string[]; json?: boolean }) => {
      const code = runExplainCommand(
        { dbPath, query, params: options.param, json: options.json },
        io
      );
      setExitCode(code);
    });

  program
    .command("diff <dbPath>")
    .description("Compare normalized plans of two queries.")
    .requiredOption("--before <query>", "Query for baseline plan")
    .requiredOption("--after <query>", "Query for candidate plan")
    .option("--before-param <value>", "Bind positional parameter for --before (repeatable)", collectValues, [])
    .option("--after-param <value>", "Bind positional parameter for --after (repeatable)", collectValues, [])
    .option("--json", "Print JSON output")
    .action(
      (
        dbPath: string,
        options: {
          before: string;
          after: string;
          beforeParam: string[];
          afterParam: string[];
          json?: boolean;
        }
      ) => {
        const code = runDiffCommand(
          {
            dbPath,
            beforeQuery: options.before,
            afterQuery: options.after,
            beforeParams: options.beforeParam,
            afterParams: options.afterParam,
            json: options.json
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
    .option("--json", "Print JSON output")
    .action(
      async (
        dbPath: string,
        options: { query: string; index: string; param: string[]; json?: boolean }
      ) => {
        const code = await runWhatIfCommand(
          {
            dbPath,
            query: options.query,
            indexDdl: options.index,
            params: options.param,
            json: options.json
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
      return error.exitCode || 1;
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
