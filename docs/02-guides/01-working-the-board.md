# Working the board

The RepoDoc board for this repo lives under `boards/repodoc/`. It has the five
standard columns — Backlog, To Do, In Progress (WIP 3), In Review, and Done — and
work flows left to right.

## How cards flow

1. New work starts as a card in **Backlog** or **To Do**.
2. When someone (or an agent) starts it, the card moves to **In Progress**. The
   `doing` column has a WIP limit of 3 to keep work focused.
3. Finished work sits in **In Review** until it is checked.
4. Once reviewed, it moves to **Done**.

Dragging a card in the board webview sets its `column` in frontmatter and
renumbers the card files on disk so the `NN-` prefixes stay contiguous.

## Conventions for this repo

- **Labels** describe the area: `core`, `webview`, `bug`, `ci`, `docs`,
  `testing`. Pick the one or two that fit.
- **Priority** is `high`, `med`, or `low` — set it honestly so the board reads at
  a glance.
- **Assigning to an agent**: set `agent: claude` (the one agent configured in
  this board's `.config.json`) and move the card to `doing`.
- **Live progress**: while an agent is actively working a card it may set
  `live: true`, a one-line `status:`, and `progress: 0-100`. Nothing in the
  committed repo is left `live: true` — that flag is for an in-flight run only.
- **Checklists**: break a card into `- [ ]` / `- [x]` sub-steps under a
  `## Checklist` heading; tick them off as you go.

## Gates

Some columns guard their transitions. This board requires tests to pass before a
card enters **In Review**, and a peer review by Jonathan before it enters
**Done**. Before you move a card, its target column's `enter` gates (and its
current column's `exit` gates) must be satisfied — otherwise the move is blocked
and the card keeps its `status: blocked on gate: <gateId>`.

- **Script gates** (`tests-passing`, `npm test`): run the check yourself and, on
  success, record the result under a `## Gates` heading in the card as
  `- [x] tests-passing — <result> (<you>, <ISO time>)`. Never record a line for a
  run that did not pass.
- **Field gates** are satisfied by setting the field the gate checks. This
  board's `peer-review` gate checks `reviewed-by = jonathan`, so approval is just
  the `reviewed-by` select being set to `jonathan`. Agents never set a field that
  encodes a human sign-off (`reviewed-by`, `approved-by`, …) — that value is the
  named person's to set.
- **Overriding** a gate is allowed but recorded: an `OVERRIDDEN` line names who
  bypassed it, so it shows up in the diff and in `git blame`.

## Journal in comments

Keep a running work journal in each card's `## Comments` section. Whenever you
make meaningful progress, append an entry — `- **<who>** (<ISO time>): <what and
why>` — oldest first, never rewriting earlier entries. Reference the code you
touched inline as `path:line` or `path:start-end` (e.g. `src/core/store.ts:123`);
RepoDoc turns those into one-click links that open the file at that exact range.
The journal, not a bare count, is how the next person understands what happened
on the card. The count badge is derived from these entries.

Made a significant architectural choice while working a card? Add the next
decision record and link it — see [Writing decisions](03-writing-decisions.md).
