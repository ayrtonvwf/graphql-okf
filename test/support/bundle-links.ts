import { posix } from "node:path";

const LINK = /\]\(([^)]+)\)/g;

/** True for a link target that points outside the bundle, or nowhere. */
function isExternal(target: string): boolean {
  return /^[a-z]+:/.test(target) || target.startsWith("#");
}

/**
 * Every bundle-internal Markdown link target in `text`, in source order.
 * External URLs and pure fragments are excluded: they come from schema
 * documentation strings, which GOAL-6.3 preserves verbatim, and are none of
 * the emitter's business.
 */
export function internalLinkTargets(text: string): string[] {
  const targets: string[] = [];
  for (const match of text.matchAll(LINK)) {
    const target = match[1];
    if (target !== undefined && !isExternal(target)) {
      targets.push(target);
    }
  }
  return targets;
}

/**
 * The bundle-relative path a link target names, with no leading slash, so the
 * result is a key into the bundle's file map. A `/`-prefixed target is OKF
 * §6.1's absolute bundle-relative form and resolves against the bundle root;
 * anything else resolves against the linking file's directory.
 */
export function resolveBundleLink(fromPath: string, target: string): string {
  if (target.startsWith("/")) {
    return posix.normalize(target.slice(1));
  }
  return posix.normalize(posix.join(posix.dirname(fromPath), target));
}
