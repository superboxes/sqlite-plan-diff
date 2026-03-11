import Database from "better-sqlite3";

export function connectSqlite(dbPath: string): Database.Database {
  try {
    return new Database(dbPath, { fileMustExist: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to open SQLite database "${dbPath}": ${message}`);
  }
}
