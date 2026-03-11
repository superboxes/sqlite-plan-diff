export interface CommandIO {
  out: (text: string) => void;
  err: (text: string) => void;
}

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
