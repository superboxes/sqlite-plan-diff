export interface CommandIO {
  out: (text: string) => void;
  err: (text: string) => void;
}

export type OutputFormat = "terminal" | "json" | "markdown";

export const defaultCommandIO: CommandIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text)
};

export function writeLine(writer: (text: string) => void, line = ""): void {
  writer(`${line}\n`);
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function resolveOutputFormat(input: {
  json?: boolean;
  format?: string;
}): OutputFormat {
  if (input.json && input.format && input.format !== "json") {
    throw new Error('Cannot combine --json with --format values other than "json".');
  }

  if (input.json) {
    return "json";
  }

  if (!input.format) {
    return "terminal";
  }

  if (input.format === "terminal" || input.format === "json" || input.format === "markdown") {
    return input.format;
  }

  throw new Error(
    `Unsupported output format "${input.format}". Expected one of: terminal, json, markdown.`
  );
}
