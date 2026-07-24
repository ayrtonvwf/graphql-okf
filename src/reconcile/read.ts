import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function collect(root: string, relative: string, out: string[]): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      await collect(root, child, out);
    } else if (entry.name.endsWith(".md")) {
      out.push(child);
    }
  }
}

export async function readExistingBundle(outDir: string): Promise<ReadonlyMap<string, string>> {
  const paths: string[] = [];
  try {
    await collect(outDir, "", paths);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
  paths.sort();

  const files = new Map<string, string>();
  for (const path of paths) {
    files.set(path, await readFile(join(outDir, path), "utf8"));
  }
  return files;
}

export async function isEmptyOrMissing(outDir: string): Promise<boolean> {
  try {
    return (await readdir(outDir)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return true;
    }
    throw error;
  }
}
