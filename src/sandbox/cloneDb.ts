import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export interface ClonedDb {
  path: string;
  cleanup: () => Promise<void>;
}

export async function cloneDbToTemp(dbPath: string): Promise<ClonedDb> {
  const tempDir = await mkdtemp(join(tmpdir(), "sqlite-plan-diff-"));
  const clonePath = join(tempDir, basename(dbPath));
  await copyFile(dbPath, clonePath);

  return {
    path: clonePath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}
