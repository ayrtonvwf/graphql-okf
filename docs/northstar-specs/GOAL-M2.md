# graphql-okf — M2 Goal Specification

**Status:** Draft
**Scope:** Milestone 2 (LLM-assisted enrichment)
**Depends on:** Milestone 1 (`GOAL-M1.md`) — M2 builds on a working deterministic
bundle and MUST NOT weaken any M1 guarantee.
**Audience:** Anyone (human or agent) implementing or evaluating M2

This document specifies *what* M2 delivers. It is the *what we build* spec for the
second milestone. The tooling and process (`SETUP.md`) are shared across
milestones. Where M2 and M1 requirements appear to conflict, M1's determinism and
idempotency guarantees win, and M2 MUST be designed around them (see §2).

---

## 1. Vision

M1 produces a faithful but *thin* bundle: every concept states the structural
facts read directly off the schema, and — per `M1/GOAL-6.2` — invents nothing.
That is correct and deterministic, but for many real schemas the machine-readable
facts are sparse: a field named `status` returning an enum, with no description,
tells a consumer very little about what it means or when to use it.

M2 adds an **optional enrichment layer**: an LLM reads the deterministic bundle
(and, where available, supplementary context) and writes richer, human-readable
prose — plain-language explanations of what a type represents, when an operation
is used, what an argument controls, how enum values differ — the "so what" that
the schema alone cannot express.

The defining constraint is that **enrichment is an overlay, never a rewrite**. The
deterministic M1 bundle remains the ground truth. Enrichment is layered on top in
a way that is clearly attributed, independently regenerable, and incapable of
corrupting the deterministic core or breaking M1's idempotency. M2 makes the
bundle *more useful* without making it *less trustworthy*.

The beneficiary is the same client engineer or AI agent from M1, plus anyone who
needs the bundle to read like documentation a person wrote, not a schema dump.

---

## 2. Relationship to M1 (non-negotiable constraints)

M2 introduces non-determinism (LLM output) into a system whose core value in M1
was determinism. These constraints keep the two compatible. They are the most
important requirements in this document.

- `GOAL-M2-2.1` — **The deterministic core is inviolate.** Enrichment MUST NOT
  modify any machine-owned content produced by M1. Re-running the M1 deterministic
  pass over an enriched bundle MUST still be a no-op with respect to machine-owned
  regions (`M1/GOAL-8.1` continues to hold).
- `GOAL-M2-2.2` — **Enrichment is a distinct, third content class.** M1 defined
  machine-owned vs. human-authored content (`M1/GOAL-8.3`). M2 adds a third:
  **LLM-generated** content. All three MUST be distinguishable within a concept
  file by a documented, stable mechanism (e.g. delimited regions or frontmatter
  provenance), and each class is governed by different rules (machine-owned:
  overwritten each run; human-authored: never touched; LLM-generated: regenerated
  only on request, per §5).
- `GOAL-M2-2.3` — **Enrichment is opt-in.** Producing an M1 bundle MUST remain
  possible with no LLM involvement whatsoever. Enrichment is a separate, explicitly
  invoked operation; the default `create`/`update` path stays deterministic.
- `GOAL-M2-2.4` — **Human edits still win.** Enrichment MUST NOT overwrite
  human-authored content, exactly as M1 required. If a human has edited a region,
  enrichment leaves it alone.
- `GOAL-M2-2.5` — **Determinism of the non-enriched surface is preserved.** With
  enrichment disabled, M2 MUST behave identically to M1. Adding the M2 code MUST
  NOT introduce nondeterminism into the deterministic path.

---

## 3. Inputs and context for enrichment

- `GOAL-M2-3.1` — Enrichment MUST operate on an existing M1 bundle as its primary
  input; it does not re-read the schema from scratch (though it MAY consult the
  same source for detail the bundle omits).
- `GOAL-M2-3.2` — The LLM provider MUST be configurable (model, endpoint,
  credentials via environment, not committed). No single provider may be
  hard-wired.
- `GOAL-M2-3.3` — Enrichment SHOULD be able to use cross-concept context (a type's
  fields, the operations that return it, linked types) so generated prose is
  coherent with the graph, not written per-file in isolation.
- `GOAL-M2-3.4` — The system SHOULD accept optional supplementary context (e.g. a
  human-provided glossary, domain notes, or existing external docs) to ground
  enrichment and reduce hallucination.

---

## 4. Output: enriched content

- `GOAL-M2-4.1` — Enrichment MUST write generated prose into the LLM-generated
  content class (§2.2), never into machine-owned or human-authored regions.
- `GOAL-M2-4.2` — Enriched concepts MUST carry **provenance metadata** in
  frontmatter recording that the prose is LLM-generated, which model/version
  produced it, and when. A consumer MUST be able to tell enriched prose from
  schema-derived fact.
- `GOAL-M2-4.3` — Enrichment MUST NOT contradict the deterministic facts in the
  same concept. Generated prose describes and explains the structural facts; it
  MUST NOT assert type signatures, field names, or arguments that differ from what
  M1 emitted. (Where feasible, a validation pass SHOULD flag prose that references
  fields/types absent from the concept.)
- `GOAL-M2-4.4` — Enrichment MUST remain within OKF conformance: still valid
  Markdown + YAML frontmatter, still one concept per file, `type` still present,
  cross-links still intact. Enrichment adds body prose and provenance keys; it does
  not restructure the bundle.
- `GOAL-M2-4.5` — Generated prose SHOULD be clearly bounded in length and scope so
  a concept file does not balloon; enrichment augments, it does not bury the facts.

---

## 5. The enrichment lifecycle (regeneration & staleness)

Because LLM output is non-deterministic and models change, M2 needs an explicit
policy for when enrichment runs, so re-runs don't churn the bundle.

- `GOAL-M2-5.1` — Enrichment MUST NOT run implicitly on every `update`. A default
  deterministic `update` MUST leave existing LLM-generated regions **untouched**,
  so an M1-style re-run does not rewrite prose and produce spurious diffs.
- `GOAL-M2-5.2` — Enrichment MUST be **explicitly requestable**, at minimum for:
  concepts that have no enrichment yet, and concepts a user targets for
  regeneration.
- `GOAL-M2-5.3` — When the underlying deterministic content of a concept changes
  (a field added, a type signature changed), M2 MUST be able to **mark the
  concept's enrichment stale** rather than silently leaving prose that now
  describes an outdated structure. Acting on staleness (regenerating) MAY require
  explicit invocation, but the staleness MUST be detectable and surfaced.
- `GOAL-M2-5.4` — Regenerating enrichment for an unchanged concept with an
  unchanged model/prompt SHOULD be suppressible (e.g. cached/skipped) so that
  routine runs are cheap and diff-quiet. Full determinism is not required of LLM
  output, but needless regeneration MUST be avoidable.
- `GOAL-M2-5.5` — Every enrichment or regeneration that changes content MUST be
  recorded in `log.md` (consistent with `M1/GOAL-8.4`), distinguishing enrichment
  changes from deterministic ones.

---

## 6. Cost, safety, and review

- `GOAL-M2-6.1` — Enrichment MUST be reviewable before it is trusted: because it
  is written to a distinct content class and recorded as a normal diff, a human (or
  agent) MUST be able to inspect exactly what prose was generated and for which
  concepts before committing (consistent with `M1/GOAL-8.6`).
- `GOAL-M2-6.2` — The system SHOULD provide cost controls: the ability to enrich a
  subset (selected concepts, only-missing, only-stale) rather than the whole bundle
  every time, and visibility into how many concepts a run would enrich.
- `GOAL-M2-6.3` — Enrichment failures (provider error, timeout, partial batch)
  MUST NOT corrupt the bundle or leave the deterministic core inconsistent; a
  failed enrichment run leaves machine-owned and human-authored content untouched
  and is safe to retry.

---

## 7. Delivery surface

- `GOAL-M2-7.1` — Enrichment MUST be exposed through both the library API and the
  CLI, as a distinct operation (or explicit flag) separate from deterministic
  `create`/`update`, reflecting its opt-in nature (§2.3).
- `GOAL-M2-7.2` — CLI/config MUST allow selecting scope (all / missing / stale /
  specified concepts) and the provider/model, and MUST make it obvious when a run
  will incur LLM calls.
- `GOAL-M2-7.3` — Enrichment SHOULD be runnable in the same scheduled/CI context
  as M1 (per `M1/GOAL-9.5`), e.g. enrich newly added concepts when the schema
  gains them — but only when explicitly configured to do so, never implicitly.

---

## 8. Explicit non-goals for M2

- `NG-M2-1` — No federation analysis. Detecting federation, subgraphs, or entity
  ownership remains Milestone 3.
- `NG-M2-2` — No resolver-level or backend-behavioral description (what an
  operation does under the hood, downstream calls). That is Milestone 4, and is a
  different kind of inference than describing the interface.
- `NG-M2-3` — No backend source-code ingestion. M2's inputs remain the M1 bundle,
  the schema, and optional human-provided context — not application code.
- `NG-M2-4` — Enrichment does NOT replace or paraphrase away schema doc-strings.
  A schema-authored description (`M1/GOAL-6.3`) is human-authored ground truth and
  is preserved; enrichment adds around it, it does not overwrite it.
- `NG-M2-5` — M2 does NOT make the enriched prose authoritative over the schema.
  On any conflict, the deterministic facts win, and the prose is what gets fixed.

---

## 9. Definition of done (M2)

- `DOD-M2-1` — With enrichment disabled, M2 reproduces M1 behavior exactly: a
  deterministic bundle, idempotent no-op re-runs, no LLM calls.
- `DOD-M2-2` — Enrichment, when invoked, writes LLM-generated prose into a distinct
  content class with provenance metadata, leaving machine-owned and human-authored
  content untouched.
- `DOD-M2-3` — A deterministic `update` over an enriched bundle does not rewrite or
  churn enrichment prose; enrichment regenerates only when explicitly requested.
- `DOD-M2-4` — Concepts whose deterministic content changed can be detected and
  surfaced as having stale enrichment.
- `DOD-M2-5` — Enrichment is scoped (all/missing/stale/selected), cost-visible,
  provider-configurable, and safe to fail/retry without corrupting the bundle.
- `DOD-M2-6` — Enriched bundles remain OKF-conformant and internally consistent:
  generated prose does not contradict the schema-derived facts in the same concept.
- `DOD-M2-7` — Enrichment changes are recorded in `log.md`, distinguishable from
  deterministic changes, and reviewable as a normal diff before commit.
