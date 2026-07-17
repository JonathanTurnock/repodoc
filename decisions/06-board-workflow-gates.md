---
status: Accepted
date: 2026-07-17
---
# Decision 06 — Board columns carry enforceable workflow gates


## Context

A board's columns encode a process — "reviewed before Done", "tests pass before
Review" — but nothing enforced it. Agents (and humans) moved cards freely, so the
column a card sat in was a claim, not a guarantee. We wanted that process to be
declared in one place, honoured by the agents editing the files, and auditable
after the fact, without a server or a bot deciding who may do what.

## Decision

Columns declare `enter` and/or `exit` gates in `boards/<id>/.config.json`. Each
gate has an `id`, a `kind`, and a `label`, and there are four kinds:

- `checklist` — the card's `## Checklist` must be complete.
- `command` — a check such as `npm test`; evidence-based in v1 (the agent runs
  it and records the result, the extension does not execute it).
- `approval` — an identity in `by:` must approve; identity is the committer's
  `git user.name`, so an approval is social trust backed by `git blame`.
- `field` — a custom (or reserved) field must have a value, or equal one.

Before a card's `column` changes, the target column's `enter` gates and the
current column's `exit` gates are evaluated. Satisfied `command` and `approval`
gates leave evidence as task-list lines in the card's `## Gates` section:
`- [x] <gateId> — <note> (<who>, <ISO time>)`. A human may override a gate they
cannot or will not satisfy the normal way by recording an `OVERRIDDEN` line with
their name, which keeps the override visible in the diff. Agents never tick
approval gates that name humans.

## Consequences

- The process is diffable and lives beside the work it governs; changing a
  column's gates is a reviewable config change.
- Approvals are social trust, not access control — they are as trustworthy as the
  git history that records them, and an override is a recorded act, not a bypass.
- `command` gates are evidence in v1: fast to ship and honest about who ran what,
  at the cost of trusting the recorded result rather than re-running it. Executing
  gates from the extension is left as later work.
