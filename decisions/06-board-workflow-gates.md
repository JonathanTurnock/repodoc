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
gate has an `id`, an optional `label`, and exactly one of two kinds:

- **script** — `script` names a command that must have run green (e.g.
  `"npm test"`). Evidence-based: the agent runs it and, only on exit 0, records a
  done line in the card's `## Gates` section; the extension does not execute it.
- **field** — `field` names a card field (custom or reserved) evaluated live
  against the card's frontmatter using a `check` mini-syntax. Absent `check`
  means "non-empty"; otherwise `check` is one of `empty`, `nonempty`, `= v`,
  `!= v`, `> n`, `>= n`, `< n`, `<= n`, `contains v`, or `match <regex>`.

Before a card's `column` changes, the target column's `enter` gates and the
current column's `exit` gates are evaluated, and the move is allowed only if they
all pass.

**Approvals are just field gates.** A review sign-off is a field the reviewer
sets — this board uses a `peer-reviewed` select checked with `= true` on the
Done column. Identity is social trust backed by `git blame`: an agent must never
set a field whose gate encodes a human sign-off (name heuristic: `peer-reviewed`,
`approved-by`) unless it is that person. Collapsing approvals into fields removed
a whole gate kind — there is no separate `approval` machinery, just a field and a
check.

Satisfied `script` gates leave evidence as task-list lines in the card's
`## Gates` section: `- [x] <gateId> — <note> (<who>, <ISO time>)`. A human may
override a gate they cannot or will not satisfy the normal way by recording an
`OVERRIDDEN` line with their name, which keeps the override visible in the diff.

## Consequences

- The process is diffable and lives beside the work it governs; changing a
  column's gates is a reviewable config change.
- Two kinds instead of four keeps the model small: everything is either recorded
  script evidence or a live field check, and approvals reuse the field machinery
  rather than adding their own.
- Field gates evaluate live from frontmatter, so they are always current — no
  stale evidence line to trust. Script gates remain evidence in v1: fast to ship
  and honest about who ran what, at the cost of trusting the recorded result
  rather than re-running it. Executing gates from the extension is later work.
- Approvals are social trust, not access control — as trustworthy as the git
  history that records them, and an override is a recorded act, not a bypass.
