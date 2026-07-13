# Committed skills

These two skills are vendored from [obra/superpowers](https://github.com/obra/superpowers)
(commit `d884ae04edebef577e82ff7c4e143debd0bbec99`, MIT licensed — see
`SUPERPOWERS-LICENSE`), per `SETUP-9.5`. They exist here so a CI agent, which has
no marketplace install and no `SessionStart` hook, can still load and follow the
same methodology a local contributor gets automatically.

- `test-driven-development/` — red-green-refactor discipline: write a failing
  test first, watch it fail, write the minimal code to pass.
- `executing-plans/` — the plan-execution skill: work through a committed plan
  file one task at a time, running each task's stated verification step.

Local contributors should still use their marketplace install; these copies are
what CI reads (see the implementation-workflow section in `CLAUDE.md`,
`SETUP-9.6`). If the upstream skills change, re-sync deliberately rather than
letting these drift silently.
