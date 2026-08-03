# Absolute bundle-relative links — design

First of two steps resolving
[issue #22](https://github.com/ayrtonvwf/graphql-okf/issues/22), itself a
sub-issue of the token/cost umbrella
[#20](https://github.com/ayrtonvwf/graphql-okf/issues/20).

`GOAL-*` and `NG-*` refer to `docs/northstar-specs/GOAL-M1.md`. §-prefixed
numbers refer to the OKF v0.2 specification unless another document is named.

## Goal

Emit every internal Markdown link in the bundle in OKF's **absolute
bundle-relative** form — `/types/objects/Product.md` — instead of the
depth-dependent relative form we emit today
(`../scalars/DateTime.md`, `Money.md`).

Two reasons, in order of weight:

1. **It de-risks the flatten.** Issue #22's substantive change is moving
   `types/<kind>/<Name>.md` to `types/<Name>.md`. With relative links, every
   file's depth changes and so does every link in the bundle — a rewrite of the
   entire graph in one commit. With absolute links, the flatten is a path-table
   change plus a set of file moves, and the link text is unaffected. That is
   why issue #22 recommends landing this first, as its own step, and why this
   spec covers only the link form.
2. **It is what the spec recommends.** §6.1 names the absolute form the
   recommended one, "because it is stable when documents are moved within their
   subdirectory" — which is precisely the situation the flatten creates.

This step changes **no paths**. Every concept file stays exactly where it is.
Only the text inside links changes.

## Non-goals

- The flatten itself (`types/<kind>/<Name>.md` → `types/<Name>.md`). Separate
  spec, after this lands.
- Index content changes — signatures in indexes are
  [#21](https://github.com/ayrtonvwf/graphql-okf/issues/21), grouping
  `types/index.md` by kind belongs to the flatten spec.
- Built-in scalar and spec directive omission
  ([#23](https://github.com/ayrtonvwf/graphql-okf/issues/23)).
- Any configurability of link form. There is one form; a CLI flag would be
  YAGNI and would double the surface every downstream test has to cover.

## The rule

> Every link from one bundle file to another bundle file is `/` followed by the
> target's bundle-relative path.

No exceptions within the bundle. Links whose target is external (matching
`^[a-z]+:`) or a pure fragment (`#…`) are untouched — these come from
schema documentation strings, which `GOAL-6.3` requires be preserved verbatim.

Examples of the emitted form:

| Site | Today | After |
| --- | --- | --- |
| Field type in `types/objects/Product.md` | `../scalars/DateTime.md` | `/types/scalars/DateTime.md` |
| Sibling type in `types/objects/Product.md` | `Money.md` | `/types/objects/Money.md` |
| Applied directive | `../../directives/tag.md` | `/directives/tag.md` |
| Child dir in root `index.md` | `types/index.md` | `/types/index.md` |
| Concept row in `types/scalars/index.md` | `DateTime.md` | `/types/scalars/DateTime.md` |
| Changed concept in `log.md` | `types/objects/Product.md` | `/types/objects/Product.md` |

## Where the slash lives

Bundle paths keep their current form — `types/objects/Product.md`, **no leading
slash**. They are the keys of the file map that the emitter builds, the
reconciler diffs, and `applyPlan` joins against `outDir`. Prefixing them would
mean either stripping the slash back off at every filesystem boundary or
carrying two path spellings.

So: `src/model/naming.ts` continues to own path derivation and remains the
single source of truth (`GOAL-4.5`). The leading slash is a **rendering**
concern and is added in exactly one place, `src/emit/render/links.ts`. No other
module learns that links look different from paths.

## Interface change

`relLink` is replaced:

```ts
// src/emit/render/links.ts
export function bundleLink(toPath: string): string {
  return `/${toPath}`;
}

export function typeLink(ref: TypeRef): string {
  return `[\`${decoratedType(ref)}\`](${bundleLink(ref.path)})`;
}
```

The `fromPath` parameter disappears. This is the real simplification in the
change, not incidental churn: `fromPath` exists solely to compute link depth,
and with absolute links depth is not an input. It currently threads through
`src/emit/render/body.ts` — the directive renderer, the field and argument
table renderers, the interface/union renderers, and the operation renderer all
carry it for no other purpose. All of them shed it.

`decoratedType` is unchanged.

## Call sites

There are four link-emitting sites in the codebase, and no others.

**`src/emit/render/links.ts:22`** — `typeLink`. As above.

**`src/emit/render/body.ts:42`** — applied-directive links, via `relLink`.
Becomes `bundleLink(directive.path)`. The seven `typeLink` call sites in the
same file (lines ~61, 105, 116, 160, 189, 209, 290) drop their first argument,
and `fromPath` unthreads from the enclosing function signatures.

**`src/emit/bundle.ts:114` and `:126`** — index entries. Today these are
`` `${base}/index.md` `` for a child directory and
`posix.basename(concept.path)` for a concept. Both become `bundleLink(...)` of
the full path. This also removes a latent fragility: those links were correct
only because an `index.md` happens to sit beside what it lists, an invariant
the flatten is about to disturb.

**`src/reconcile/log.ts:21`** — changed/added/removed concept links. Becomes
`bundleLink(change.path)`. `log.md` is append-only, so entries written before
this change keep their existing relative links; those still resolve correctly
(the log sits at the bundle root, so its old links were already root-relative
minus the slash). Only new entries use the absolute form.

**`src/emit/render/directory-index.ts` is unchanged.** It renders whatever
`link` value it is handed; `bundle.ts` is what decides the form.

**`src/model/naming.ts` and the rest of `src/reconcile/` are unchanged.**

## Migration of existing bundles

**No migration machinery is required.** Links live entirely inside the
`graphql-okf:generated` region, which is re-rendered wholesale on every run.
An existing bundle picks up absolute links the next time `graphql-okf` runs
against it. The human-authored region below the end marker is untouched, as
always (`GOAL-8.3`) — including any relative links a human wrote there, which
remain the human's to maintain.

The reconciler will classify every concept as **changed**, and `log.md` will
receive one entry naming them all. That is the correct outcome and is
deliberately not special-cased: the files did change, `GOAL-8.4` requires the
record, and it happens exactly once per bundle. Collapsing it into a one-line
`Migrated` entry (as the v0.1→v0.2 frontmatter conversion does) would require
the reconciler to distinguish a link-only rewrite from a real content change —
new machinery, permanently carried, for a one-time event.

No tombstones are produced, because no path changes.

## Consequence: GitHub file browsing

GitHub's web UI resolves a leading `/` against the **repository** root, not the
bundle root. The example bundles committed under `okf/shop-api/` and
`okf/countries-api/` will therefore have cross-links that 404 when browsed on
github.com.

This is accepted. The bundle's consumer is an agent reading files from disk
with a known bundle root, for which the absolute form is unambiguous and
§6.1-recommended; GitHub rendering of the committed samples is a convenience,
not a requirement. It is called out in the example bundles' documentation
rather than designed around.

The alternative considered and rejected was to stop committing generated
bundles and produce them in CI instead. That removes the problem at its source
but gives up the reviewable diff of emitter output that `okf/` provides on
every PR — a real safeguard for a project whose entire output is text.

## Testing

Test-first throughout, per `.claude/skills/test-driven-development`.

**Unit.**
- `links.test.ts` — `bundleLink` prefixes a slash; `typeLink` renders the
  decorated type against an absolute target; wrapper decoration is unaffected.
- `body.test.ts` — directive, field-table, argument-table, interface, union and
  operation renderers all emit `/`-prefixed targets. Existing assertions on
  `../` targets are updated, not deleted.
- `bundle.test.ts` — index entries link absolutely, for both child-directory
  rows and concept rows.
- `log.test.ts` — run-block entries link absolutely.

**Conformance (`src/conformance.test.ts`).** Two changes:
- The existing no-dangling-link check (`GOAL-7.2`) resolves link targets with
  `posix.join(posix.dirname(path), target)`. It must instead treat a leading
  `/` as bundle root. Keep it rejecting genuinely dangling links — verify by
  temporarily breaking a path, not by assuming.
- **Add a new assertion:** no internal link is relative. Every link target is
  external, a fragment, or starts with `/`. This is the guard rail that keeps
  the flatten safe — it is what prevents a link from silently reacquiring a
  dependency on file depth.

**Integration.**
- *Legacy-bundle transition.* Write a bundle whose links are relative and whose
  concept files carry human-authored regions; re-run; assert links became
  absolute, every human region survived byte-for-byte, the affected concepts
  appear under **Changed** in `log.md`, and nothing was tombstoned. Nothing
  currently pins this behaviour and it is the one thing a reader would worry
  about.
- *Idempotence (`GOAL-8.1`, `NG-6`).* After regenerating the example bundles,
  a second run produces zero actions and appends nothing to `log.md`.

**Coverage.** The enforced gate (lines ≥ 90%, functions ≥ 90%, branches ≥ 85%,
statements ≥ 90%) applies as always. `bundleLink` is trivial but its call sites
are not, and the conformance additions carry most of the real assurance.

## Regenerating the committed bundles

`okf/shop-api/` and `okf/countries-api/` are regenerated as part of this
change. There is no `package.json` script for this today; the implementation
plan pins the exact CLI invocations, `--now` timestamps, and resource values so
the diff is reproducible by a reviewer. Expect a large but wholly mechanical
diff: one link-text change per link, no path changes, no frontmatter changes,
plus one `log.md` entry per bundle.

## Documentation

- `docs/northstar-specs/GOAL-M1.md` — `GOAL-7.1`/`GOAL-7.2` gain a sentence
  naming the absolute bundle-relative form as the emitted convention, citing
  OKF §6.1's recommendation. This documents an existing goal's implementation,
  and does not change what the goals require.
- The example bundles' documentation gains the note that links are
  bundle-root-absolute and therefore do not resolve in GitHub's file browser.

## Risks

- **Missed call site.** Mitigated by the new "no relative internal links"
  conformance assertion, which fails on any site left behind.
- **A schema documentation string containing a relative Markdown link.** Such a
  link is preserved verbatim under `GOAL-6.3`, so a naive "every link starts
  with `/`" assertion would flag content graphql-okf did not author, and the
  no-dangling-link check would flag it too. Today's fixtures do not exercise
  this: the only Markdown link in any description is
  `[links](https://example.test)` in `examples/shop-api/v1–v3.graphql`, which
  the existing `^[a-z]+:` guard already skips. The risk is therefore latent
  rather than observed. The plan addresses it by scoping the new assertion to
  links the emitter produced — those inside the generated region — and by
  adding a fixture description carrying a relative link, so the distinction is
  pinned by a test instead of by assumption.
- **Determinism.** Nothing here introduces ordering or wall-clock dependence.
  `bundleLink` is a pure function of the target path (`GOAL-8.1`, `NG-6`).
