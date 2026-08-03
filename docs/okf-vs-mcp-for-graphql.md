# OKF or MCP for GraphQL? The reasoning behind `graphql-okf`

*A working document. Hypotheses, not results.*

---

## What this document is

`graphql-okf` reads a GraphQL schema and produces an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog) (OKF) bundle — a directory of cross-linked Markdown files describing the API's interface, kept up to date as the schema evolves.

There is an obvious question hanging over that: **why not just use a GraphQL MCP server?** An agent can already introspect a live schema through the Model Context Protocol. Why generate files?

This document is our answer, written out in full so it can be argued with. It states what we believe, why we believe it, how much of it is currently evidence versus reasoning versus bet, and how we intend to find out where we're wrong.

**This document contains no benchmark results, because we have not run the benchmark yet.** The harness is [designed](superpowers/specs/2026-07-28-benchmark-harness-design.md) and not yet built. Everything below labeled *measurable* is a commitment to measure, not a report. Everything labeled *structural* is an argument we think holds without measurement. Where we simply don't know, we say so — see [What we don't know](#what-we-dont-know), which is the most important section here.

This document is not a claim that MCP is bad. We think the honest conclusion is probably that these are complements, and most of the interesting work is figuring out exactly where the seam falls.

---

## Background, briefly

**MCP (Model Context Protocol)** is a protocol for giving an agent runtime access to tools and data. A GraphQL MCP server typically exposes the schema to the agent — via introspection, a search interface over schema elements, or a set of curated operations — and often lets the agent execute queries against the live API.

**OKF (Open Knowledge Format)** is a specification for representing a knowledge base as a bundle of Markdown files with YAML frontmatter, cross-linked into a graph, with an update log. It is not GraphQL-specific and not agent-vendor-specific. Plain files, no runtime.

**`graphql-okf`** is a deterministic transform from a GraphQL schema (SDL file or live introspection endpoint) to an OKF bundle. It doesn't just generate once: re-running against an evolved schema reconciles the existing bundle — adding new concepts, updating changed ones, marking removed ones, preserving human-authored notes, and recording what changed in a `log.md`. No LLM runs at generation time; the same schema always produces the same bundle.

---

## First: a framing correction

The naive version of this argument — "OKF is better than GraphQL over MCP" — is a category error, and deserves to be called out. MCP is a transport for runtime tool access. OKF is an artifact format that sits in a repository. They are not the same kind of thing, and a head-to-head framed that way collapses under the first serious question.

The framing we think survives:

> **MCP treats API knowledge as a *service*. OKF treats API knowledge as a *codebase artifact*.**

Nearly everything below follows from that single distinction. Services are fresh, executable, siloed, ephemeral, unversioned, and unreviewable. Artifacts are stale-able, inert, linkable, persistent, versioned, reviewable, and annotatable.

So the real question is not "which is better." It is: **which class of knowledge belongs on which side of that line?**

### The precedent that already exists

There is a strong analogy available to anyone who has used GraphQL professionally:

> **OKF is to API semantics what GraphQL Codegen is to API types.**

Nobody seriously argues that you should introspect the schema at runtime to obtain your TypeScript types. You run codegen, you commit the generated types, you review them in pull requests, you diff them, and you notice when they change. The generated artifact living in your repository is understood to be *better* than the live source for that purpose — not because it's fresher (it isn't) but because it's addressable, reviewable, versioned, and available offline.

`graphql-okf` makes the identical move one layer up, at the layer types cannot reach. If you accept codegen, you have already accepted the premise of this project. The disagreement can then move to the interesting question of whether the semantic layer benefits from the same treatment as the type layer.

---

## The hypotheses

Each hypothesis below carries an **epistemic status**, because we think conflating "measurable today" with "true if OKF succeeds" is exactly what makes readers discount an argument wholesale.

| Status | Meaning |
| --- | --- |
| **Measurable** | We can run an experiment that could falsify this. We intend to. |
| **Structural** | An argument from the architecture. Not measurable in a benchmark, but not speculative either. |
| **Bet** | Conditional on OKF ecosystem adoption. Honest speculation. |

---

### H0 — Context economics

**Claim.** For a given task, an agent working from an OKF bundle consumes fewer tokens than one working through a GraphQL MCP server, at equal or better accuracy.

**Mechanism.** An MCP server either delivers a large introspection payload into context or requires round-trips to assemble the relevant subgraph. A bundle is a filesystem the agent navigates lazily: index → directory index → concept file. It reads what it needs and pays for what it reads. Navigation uses the agent's native file tools, which are already well-practiced, rather than a tool surface it encounters for the first time in this session.

**Status: measurable.** This is the hypothesis with numbers attached, which is why we put it first.

**The honest caveat.** GraphQL MCP servers are getting better at exactly this. Modern ones expose schema search, return subgraphs rather than full introspection, and ship minified schema representations. A benchmark against a naive dump-the-whole-introspection server would be a strawman and would deserve to be dismissed. We intend to measure against the most efficient GraphQL MCP servers we can find, with versions pinned in the results manifest and the claim dated, because "the most efficient MCP" is a moving target and any number we publish expires.

---

### H1 — History: MCP exposes state; some tasks are about deltas

**Claim.** Tasks whose answer is a *change* rather than a *state* are structurally out of reach for an introspection-based MCP, and are answerable from an OKF bundle's `log.md`.

**Mechanism.** A live schema is a snapshot. It can tell you what exists now. It cannot tell you what used to exist, when something changed, or what a field's type used to be. `log.md` records reconciliation events over time, in the bundle's own vocabulary, with links to the affected concepts.

**The general form matters more than any example.** Our first instinct was an exotic case — a field deprecated, then removed, then reinstated. That happens, but it's rare, and building an argument on it is weak. The useful formulation is broader:

> Any task whose answer is a **delta** is invisible to a state-only interface.

Which covers cases that are not rare at all:

- *"Why does this client code call a field that doesn't exist?"* — Removed on a specific date. Without history, an agent's best move is to report that the field doesn't exist and possibly invent a replacement.
- *"Is this deprecation new? Do I need to migrate now, or has it been sitting there for three years?"* — `@deprecated` carries a reason but no date. Nothing in the schema tells you when.
- *"This field changed from `String` to an enum and broke my code — when?"*
- **Migration and upgrade work generally**, where the diff *is* the task.

**Status: measurable**, though not by the benchmark as currently designed — see [How we intend to measure](#how-we-intend-to-measure).

**The honest weakness.** `log.md` is a history of the *bundle*, not a history of the *API*. Adopt `graphql-okf` today and you have zero history. The value accrues over time, and that is a real adoption-curve problem that we should not paper over. The mitigation is regeneration frequency, which we discuss under [Determinism buys freshness](#determinism-buys-freshness).

**A second, subtler objection we should answer preemptively:** *why not just `git log -p okf/`?*

The bundle is in git; git already records history. Our answer is that `log.md` is a **denormalization of git history into the retrieval surface**, expressed in the agent's own units:

- Reading git history costs the agent knowing to look, plus N tool calls, plus inferring meaning from diffs of generated Markdown. `log.md` costs one file read, already expressed as concepts rather than lines.
- `log.md` records one entry per *reconciliation*, not per commit. Five commits touching the bundle produce one semantic event.
- It survives outside git — in a bundle shipped as a package, a zip, or an artifact detached from its repository.

Whether that convenience actually changes agent behavior is an empirical question, and it's one we can test.

---

### H2 — Annotation: a schema is a type system and carries shape, nothing else

**Claim.** The knowledge that most improves an agent's performance against an unfamiliar API is largely knowledge a GraphQL schema structurally cannot express, and an OKF bundle gives that knowledge an addressable home.

**Mechanism.** Consider the things a working engineer knows about an API that the schema does not say:

- **Cost.** "`orders` without a date filter times out at about thirty seconds."
- **Policy and sequencing.** "Only call `refund` after `capture` has settled."
- **Truth versus legacy.** "`status` is typed `String`, but only five of the eleven values are ever returned now."
- **Idempotency contracts.** "This mutation is safe to retry, but only if you pass `clientMutationId`."

This knowledge exists. It lives in Slack threads and in one senior engineer's head. In an MCP-only world it has nowhere addressable to live. In an OKF bundle it has a file path.

Two consequences worth stating explicitly:

- **It becomes reviewable.** An annotation lands in a pull request, gets argued about, gets versioned, gets `git blame`d. Nobody on your team code-reviews an MCP server's tool descriptions.
- **It survives regeneration.** This is not aspirational. The generated/human boundary is already in the format — every generated file carries a marker after which human-authored content is preserved across regenerations:

  ```markdown
  <!-- graphql-okf:generated:start -->
  * [types/](types/index.md) - Types
  <!-- graphql-okf:generated:end -->

  <!-- Human-authored content below this line is preserved across regenerations. -->
  ```

  That is the difference between "you can write notes" and "your notes are a supported artifact with a stability guarantee."

**Status: measurable**, and currently unmeasured — no case in the benchmark tests it yet.

**But first, an important qualification**, because H2 is easy to over-claim. A great deal *can* go in the schema, and where it can, it should. That deserves its own section.

---

## What belongs in the schema versus the bundle

We want as much knowledge as possible to live close to the graph definition, so that the entire ecosystem that reads a GraphQL schema benefits — not just OKF consumers. This is not in tension with the project. It is the project's best input.

### What GraphQL can carry today

**Descriptions** are the underused one. Every element that matters accepts a description — types, fields, arguments, enum values, input fields, scalars, directive definitions — descriptions *are* exposed through introspection, and the specification explicitly permits Markdown in them. Free-form prose already travels to every consumer in the ecosystem. The ceiling here is high and most schemas are nowhere near it.

Its limit is that a description is an unstructured string. Nothing distinguishes a cost warning from a usage example from a migration note, and a `` See `Order` `` written in prose resolves to nothing.

**Custom directives** give you structure — `@cost`, `@requiresScopes`, `@idempotent`, whatever your domain needs. And here there is a gap that is easy to miss and that directly affects this project.

### Applied directives are not exposed through introspection

Introspection returns directive *definitions* — name, arguments, valid locations, repeatability. It does **not** report which schema elements a directive was applied *to*. There is no `appliedDirectives` on `__Field`, `__Type`, or anything else. `@deprecated` is the sole exception, specially privileged into `isDeprecated` / `deprecationReason`. `@specifiedBy` is similarly surfaced via `specifiedByURL`.

This is why Apollo Federation ships SDL out-of-band through `_service { sdl }` rather than relying on introspection.

Verified against `graphql` 16.14.2:

```js
const { buildSchema, introspectionFromSchema, buildClientSchema } = require('graphql');

const schema = buildSchema(`
  directive @audit on FIELD_DEFINITION
  type Query { a: String @audit @deprecated(reason: "x") }
`);

const client = buildClientSchema(introspectionFromSchema(schema));
const field = client.getQueryType().getFields().a;

field.astNode            // undefined  — the @audit application is gone
field.deprecationReason  // "x"        — @deprecated survives, it is special-cased
client.getDirectives()   // [ 'audit', 'include', 'skip', 'deprecated', ... ]
                         // the *definition* of @audit is still there
```

**The consequence for `graphql-okf` is concrete and present in the code today.** Applied directives are extracted from `astNode.directives` ([`src/model/project.ts`](../src/model/project.ts)), and `astNode` is populated only when the schema was parsed from SDL. So:

- **From an SDL file** — every applied directive is visible and linked into the bundle.
- **From a live introspection endpoint** — `appliedDirectives` is always empty. The bundle will still generate a page for each directive *definition*, but no concept will link to it. A reader sees a documented directive that nothing appears to use.

`@deprecated` and `@specifiedBy` survive both paths, because `graphql-okf` models them as first-class fields rather than as applied directives.

**Bundle fidelity therefore depends on input mode.** The IR already carries `origin: "sdl" | "introspection"`, so the tool knows which situation it is in. Making that visible to the reader of a bundle is an open design question we have not resolved — see [What we don't know](#what-we-dont-know).

**Custom scalars** carry less than people expect: a name, a description, and `@specifiedBy(url:)`. No format, no range, no validation rules in any machine-readable form. But `@specifiedBy` is interesting for a reason beyond its own utility — **it is GraphQL conceding that some semantics must live outside the schema and be reached by a link.** That precedent matters below.

### Four tests for what cannot go in the schema

Even with unlimited custom directives, a fact belongs in the bundle rather than the schema when:

1. **It isn't element-scoped.** "How checkout works across four mutations and two subscriptions" has no single node to attach to. Directives are element-scoped by construction; narrative that spans elements has no home.
2. **You don't own the schema.** If you consume Shopify's GraphQL API, annotating the schema is not a strategy available to you *at all*. This one is absolute, and it may be the single largest population of users.
3. **It changes on a different clock.** p99 latency, which enum values actually occur in production, observed rate limits. Putting these in SDL couples your documentation cadence to your deploy cadence and makes the schema churn for non-schema reasons.
4. **It's temporal.** SDL is a snapshot with no time dimension. Even `@deprecated` doesn't say *when*.

A fifth, softer test is **governance**: the schema is owned by the API team, but much of the useful knowledge is owned by consumers, SREs, and support. If recording "this times out" requires a schema pull request against another team's repository, it never gets recorded.

### The consequence: schema annotation feeds OKF, it doesn't compete with it

**The more you put in your schema, the better your bundle gets — for free, and deterministically.** These are not rival strategies. Schema annotation is the highest-quality input to the transform.

Which implies a design constraint we intend to hold:

> **`graphql-okf` should never define its own annotation directives.**

The moment it ships an `@okfNote`, it becomes a schema-mutating tool and loses the "we only read your schema, we ask nothing of you" neutrality that makes it adoptable. The correct posture is to read *anyone's* directives generically, render them well, and invent nothing.

---

### H3 — Availability

**Claim.** A bundle is available in situations where an MCP server is not.

Offline. Unauthenticated. When the API is down. Inside CI. At pull-request review time. An agent reviewing a PR at three in the morning does not have your staging token, and often shouldn't.

**Status: structural.** There is not much to measure here; it either applies to your situation or it doesn't. But it changes *who* can use the knowledge and *when*, which is not a small thing.

---

### H4 — Addressability and composition

**Claim.** MCP has no addressing scheme for knowledge, and therefore cannot compose. OKF does, and therefore can.

**Mechanism.** There is no URI meaning "the `cancelOrder` mutation of our API" that another document can point at. MCP servers are silos: your "codebase architecture" MCP cannot link into your "GraphQL API" MCP, and no amount of protocol work fixes that without inventing precisely the thing OKF already has — stable, addressable paths for units of knowledge.

**The underlying primitive is worth naming as one idea rather than two:**

> **Stable addressability is the precondition for both composition and durable annotation.**

A concept path that survives regeneration is simultaneously what lets another bundle link to it *and* what lets a human note stay attached to it. One property, two capabilities.

### The multi-bundle architecture we're aiming at

Rather than hydrating the generated GraphQL bundle with hand-written prose, we expect the better architecture is **separate bundles, interlinked**: a thin, machine-owned, frequently-regenerated `graphql-okf` bundle, and a separate human-owned bundle carrying textual documentation and business rules generated from documentation that already exists.

We think this separation is a requirement rather than a preference, for one reason: **different owners, different clocks.** The GraphQL bundle is machine-owned and regenerated constantly. A docs bundle is human-owned and changes rarely. The generated/human marker inside a file is a *mitigation* for mixing them. Separation *eliminates* the problem.

But there's an asymmetry that has to be solved, and it's the most interesting unsolved design question in the project:

- **docs → graphql links are easy and safe.** The docs bundle points at `../graphql-api/types/Order.md`. If `Order` is removed, the link dangles — which is a *good* failure mode, because it's mechanically detectable, and `log.md` says exactly when and why it broke.
- **graphql → docs links cannot be generated deterministically.** The generator has no way to know a docs page exists. The pointer has to come from somewhere, and there are only three candidates:
  1. A human writes it below the preservation marker — which is hydration again, the thing we're trying to avoid.
  2. A sidecar mapping file in the bundle: human-owned, machine-read, keeping generated files pure while allowing links to be rendered into them.
  3. **It comes from the schema** — via `@specifiedBy`, or a `@docs(url: ...)`-style directive.

Option 3 is where two separate threads of this document meet: **the schema is the natural place to store the join key between bundles.** Not the documentation itself — just the pointer. That is a tiny, cheap, ecosystem-friendly annotation that benefits every consumer of the schema, and it is exactly the shape that `@specifiedBy` already legitimized.

One further piece: the stable identifier on the GraphQL side should probably be **schema coordinates** (`Order.status`, `Query.orders(filter:)`), a notation that already exists in the GraphQL world. A documented, bidirectional mapping between schema coordinate and bundle path would give other bundles — and other tools — something canonical to address. `graphql-okf` already treats its naming scheme as the single source of truth internally; making the coordinate↔path mapping a *public contract* is what would make it addressable externally.

And once docs → graphql links exist, **backlinks are generated rather than authored** — a tool can index inbound links and render "referenced by" sections. Which is exactly the OKF-generic tooling described in H5. The hypotheses converge.

**Status: structural.** This cannot be measured in a scenario matrix. It is an argument from architecture, and should be read as one.

---

### H5 — Retrieval is decoupled from publication

**Claim.** A bundle separates *who publishes the knowledge* from *who chooses how to retrieve it*. MCP couples them.

**Mechanism.** An MCP server's search quality is fixed by whoever wrote the server. You get their retrieval strategy — take it or leave it. A bundle's retrieval strategy is chosen by the *consumer*, can improve without the API provider doing anything, and multiple strategies can run over the same bundle *simultaneously*: ripgrep, a vector index, a local graph database, the agent's own file tools. MCP structurally cannot do that.

There are two versions of this argument, and they have different epistemic status.

**The version that is true today (structural):** the bundle is plain files, so ripgrep, git, glob, and an agent's native Read/Grep already consume it with **zero integration**. This is not "other OKF tools exist" — it is "no tool is required at all." MCP requires every consumer to speak MCP. A directory of Markdown requires nothing from anyone.

**The version that is a bet:** as OKF matures, people will build OKF-generic tooling — ingesting bundles into graph databases, vector stores, and other optimized retrieval systems. Those builders will not be thinking about GraphQL at all; they'll be building for *any* OKF bundle. `graphql-okf` free-rides on all of it, and may end up with retrieval substantially better than the relatively simple text search that GraphQL MCP servers offer today.

We think that bet is reasonable. It is still a bet, and it is conditional on OKF adoption that has not happened yet. We label it as one rather than smuggling it in alongside the measurable claims.

**Status: structural (first version) / bet (second version).**

---

## Determinism buys freshness

This deserves its own section because it converts our most damaging weakness into a solved problem.

Staleness is the worst thing on the list of places OKF loses. Its failure mode is the bad one: an agent that is confidently wrong. A bundle is only as current as its last reconciliation.

Cheap, deterministic regeneration doesn't merely mitigate that. Combined with a CI check — *regenerate, fail if dirty* — it **converts drift from a silent agent error into a build failure.** And that check is only affordable *because* there is no LLM in the loop.

So determinism is not a purity goal. It is the thing that makes a freshness guarantee cheap enough to run on every commit. `graphql-okf` should be fast and cheap to regenerate, and that is a load-bearing requirement rather than a nice-to-have.

A second-order consequence: **regeneration frequency sets the resolution of your history.** Regenerating per deploy gives you deploy-resolution history. Regenerating per pull request in CI gives you PR-resolution history *and* the "why" for free, if log entries can carry a provenance reference back to the commit or PR. That would upgrade `log.md` from "what changed" to "what changed, and where to read about why."

**On adding LLM enrichment later** (planned as milestone M2, and deliberately optional): the moment it exists, the bundle has two tiers of trust, and they must be structurally distinguishable — via frontmatter or a separated file region — or agents will treat inferred content as authoritative. It also breaks the "re-running against an unchanged schema is a no-op" property unless results are cached and pinned by content hash. We consider both of these hard requirements on any enrichment feature, not polish.

---

## Where OKF genuinely loses

Stating this plainly is what makes the rest credible.

- **MCP can execute. OKF cannot.** An MCP server runs the query, validates it against the live server, and returns real data. For "what does this actually return," OKF loses outright, permanently, and by design. This is not a gap to be closed; it is a different job.
- **MCP is always fresh.** A bundle is as stale as its last reconciliation. Mitigated by CI regeneration, not eliminated — and not everyone will wire that up.
- **OKF has repository footprint.** Files in every diff. Reviewers have to learn which Markdown is generated and how to read it. This is a real tax on a real team.
- **Large schemas may favor a good MCP.** On a very large schema, an MCP with strong search may beat naive filesystem navigation. Whether that holds once bundle-side retrieval tooling exists is an open question — and note that this is a comparison of *retrieval strategies*, not of *knowledge substrates*.
- **Adoption cost is front-loaded, benefit is back-loaded.** History accrues; annotation requires someone to sit down and write it. Day one of `graphql-okf` is strictly worse than day one hundred, and MCP has no equivalent ramp.
- **Introspection-only sources produce lower-fidelity bundles**, as documented above. If your only access to an API is a live endpoint, you lose every applied directive.

---

## The thesis we actually hold

Not "OKF beats MCP." This:

> **They are complements, and the seam is reasonably clean. OKF for knowledge, history, annotation, review, and offline work. MCP for execution and verification.**

Which reframes the most interesting empirical question. It is not "does OKF beat MCP." It is:

> **Does OKF + MCP beat MCP alone?**

That is a better question, a more defensible result, and a far more adoptable conclusion. It also happens to be what we'd recommend to a user regardless of how the numbers land.

We remain genuinely curious about the head-to-head — which task classes each wins — because the shape of that answer tells us where the seam actually falls rather than where we assume it falls.

---

## How we intend to measure

The [benchmark harness design](superpowers/specs/2026-07-28-benchmark-harness-design.md) specifies a 3×3×3 matrix: three scenarios (`okf-bundle`, `graphql-mcp`, `baseline`) × three cases × three trials, scored for accuracy by a blinded LLM judge against checked-in rubrics, and for token consumption from the Agent SDK's usage statistics.

Its credibility rests on one property: **across scenarios, exactly one variable moves.** Same model, same system prompt, same tools, same prompts, same fixture, same grading. Only the context available to the agent differs. The design enforces this structurally — the runner consumes scenario descriptors and contains no `if (scenario === ...)` branches, and the judge module cannot import the scenario vocabulary at all.

### What the current design does and does not cover

The three cases (`qa`, `add-review`, `cancel-reason`) test **state**. That is deliberate — they were the most straightforward thing to build first, and you need something to start with. But it means:

| Hypothesis | Covered by the current matrix? |
| --- | --- |
| H0 — context economics | **Yes.** This is the primary measurement. |
| H1 — history / deltas | **No.** Needs a case whose answer exists only in `log.md`. |
| H2 — annotation | **No.** Needs a case whose answer exists only in a human annotation. |
| H3 — availability | Not applicable; structural. |
| H4 — addressability / composition | **Not measurable in this matrix.** Architectural. |
| H5 — retrieval decoupling | **Not measurable in this matrix.** Architectural, plus a bet. |

The two missing cases are the highest-value additions, because they are the cells where the baseline and MCP scenarios should score at or near zero — which is the cleanest kind of result a benchmark can produce. We intend to add them.

For H4 and H5 we intend to run **experiments rather than benchmarks** — building a real interlinked pair of bundles, and running a real alternative retrieval strategy over a bundle — and to report what we learn qualitatively rather than pretending we have numbers.

### Confounds we know about

**Retrieval strategy versus knowledge substrate.** If we benchmark against a schema-search MCP while our OKF scenario does naive filesystem walking, we are measuring *retrieval strategy*, not *knowledge substrate*. Two setups differing on two axes tell you nothing clean. The fix is either comparable retrieval on both sides, or running OKF at two retrieval tiers so the substrate effect separates from the retrieval effect.

**Strawman selection.** We must benchmark against the best available GraphQL MCP servers, not the easiest to set up. Worth noting that the strongest competitor may not be a better schema-dump server at all: Apollo's MCP server takes a different philosophical position, exposing *curated operations* as tools rather than exposing the schema. That is a third stance — knowledge pre-compiled into executable operations — and it eventually deserves its own scenario rather than being lumped in with schema-search servers.

**Expiring numbers.** MCP servers improve. We pin versions in the results manifest and date every claim.

**Judge bias.** Grading is blinded to scenario, and the judge sees only the final artifact.

**Our own incentives.** We are the authors of the tool. The scenario that makes our tool look good is the one we are least equipped to evaluate skeptically. Publishing the rubrics, the prompts, and the harness — and inviting people to run it — is the only real defense we have, and we intend to do that.

---

## What we don't know

This is the section we most want people to engage with.

**On the format and the spec**

- **Does OKF specify cross-bundle addressing?** If it does not, `graphql-okf` has a direct interest in pushing for one upstream. Multi-bundle interlinking (H4) depends on it, and we would rather contribute to a shared convention than invent a private one.
- **How should the graphql → docs link direction be solved?** Human-authored below the marker, a machine-read sidecar file, or a schema-side join key. We lean toward the schema-side join key on ecosystem grounds, but we haven't built any of the three.
- **Should the schema coordinate ↔ bundle path mapping become public contract?** We think probably yes. We have not designed the stability guarantees that would require.

**On fidelity and honesty of the artifact**

- **How should a bundle disclose that it was generated from introspection** and therefore has no applied-directive information? A frontmatter field, a warning in `index.md`, a CLI warning, or nothing at all? A reader currently has no way to distinguish "this API uses no custom directives" from "we couldn't see them." We consider this a genuine defect and haven't decided the fix.
- **Should the "documented directive that nothing uses" artifact of introspection mode be suppressed, annotated, or left alone?**

**On the hypotheses themselves**

- **Does `log.md` actually change agent behavior**, or do agents simply not look at it unless prompted? Discoverability may dominate availability. If agents don't read the log unprompted, the history hypothesis needs a different delivery mechanism, not a better log.
- **How much annotation is enough?** There is presumably a point where hand-written notes stop paying for themselves. We have no idea where it is.
- **Does bundle navigation degrade on very large schemas**, and at what size? We have no data. Our examples are small.
- **Is per-PR regeneration in CI actually tolerable** in terms of diff noise, or does bundle churn make reviewers start ignoring the directory — which would defeat the reviewability argument in H2 entirely?
- **Does the codegen analogy persuade anyone who isn't already convinced?** It's rhetorically clean. We don't know if it survives contact with a skeptic.

**On the ecosystem bet**

- **Will OKF-generic tooling actually materialize?** H5's strong form depends on it entirely. If OKF does not achieve adoption, `graphql-okf` still works — the "no tool required" version holds regardless — but the exponential-improvement story does not arrive.

---

## How to disagree with this

The claims most likely to be wrong, in our own estimation, ranked:

1. **H5's ecosystem bet.** Conditional on adoption that hasn't happened.
2. **H0's margin.** MCP servers are improving fast; the gap may be small or may close.
3. **H1's practical value.** History may matter less often than we think, or may go unread.
4. **The whole framing**, if it turns out that in practice teams simply never write the annotations that H2 depends on. Every argument about human-authored knowledge assumes humans author it.

If you think we're wrong, the most useful forms of disagreement are: a task class we've mis-assigned across the service/artifact line, a GraphQL MCP server we should be benchmarking against, or a confound in the measurement design we haven't listed.

---

*This document will be revised as the benchmark produces results. Its current state is: reasoning, with the experiment specified but not yet run.*
