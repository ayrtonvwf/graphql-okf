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

/**
 * OKF §6.1's absolute bundle-relative form, which the spec recommends "because
 * it is stable when documents are moved within their subdirectory". Bundle
 * paths themselves stay slash-free — they are file-map keys — so this is the
 * single place the two spellings meet.
 */
export function bundleLink(toPath: string): string {
  return `/${toPath}`;
}

export function typeLink(ref: TypeRef): string {
  const decorated = `\`${decoratedType(ref)}\``;
  return ref.path === null ? decorated : `[${decorated}](${bundleLink(ref.path)})`;
}
