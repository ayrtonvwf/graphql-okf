import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function readTree(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child);
      } else {
        files.set(child, await readFile(join(dir, child), "utf8"));
      }
    }
  };
  await walk("");
  return files;
}

export async function writeTree(dir: string, tree: ReadonlyMap<string, string>): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  for (const [relative, contents] of tree) {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
