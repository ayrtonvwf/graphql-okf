import { posix } from "node:path";
import type { TypeRef } from "../../model/ir.js";

export function decoratedType(ref: TypeRef): string {
  return applyWrappers(ref.wrappers, ref.name);
}

function applyWrappers(wrappers: TypeRef["wrappers"], inner: string): string {
  if (wrappers.length === 0) {
    return inner;
  }
  const [head, ...rest] = wrappers;
  const nested = applyWrappers(rest, inner);
  return head === "nonNull" ? `${nested}!` : `[${nested}]`;
}

export function relLink(fromPath: string, toPath: string): string {
  return posix.relative(posix.dirname(fromPath), toPath);
}

export function typeLink(fromPath: string, ref: TypeRef): string {
  return `[\`${decoratedType(ref)}\`](${relLink(fromPath, ref.path)})`;
}
