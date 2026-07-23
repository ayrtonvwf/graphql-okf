import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GraphqlOkfError } from "../errors.js";

export async function writeBundle(
  bundle: ReadonlyMap<string, string>,
  outDir: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const existing = await readdir(outDir);
  if (existing.length > 0) {
    throw new GraphqlOkfError(
      "OUTPUT_NOT_EMPTY",
      `Output directory "${outDir}" is not empty. graphql-okf writes a fresh bundle and will not overwrite existing files.`,
    );
  }

  for (const [relativePath, contents] of bundle) {
    const absolute = join(outDir, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, "utf8");
  }
}
