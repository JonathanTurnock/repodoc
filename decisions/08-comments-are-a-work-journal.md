---
status: Accepted
date: 2026-07-17
---
# Decision 08 — Comments are a work journal, not a count

## Context

Cards used to carry a `comments:` number in frontmatter — a badge that told you a
card had, say, three comments, but nothing about what they said. A count is
noise: it cannot tell a human returning to a card, or the next agent picking it
up, what was actually done and why. Agents in particular generate a lot of
context while working a card that evaporates the moment the run ends. We wanted
that context to survive as a durable, readable narrative attached to the work
itself, without a database or a comment server.

## Decision

Comments are a `## Comments` journal section in the card file. Each entry is a
single bullet: `- **<who>** (<ISO time>): <text>`, in file order, oldest first.
Agents journal by DEFAULT — the skill instructs every agent to append an entry
whenever it makes meaningful progress on a card, one entry per work session, and
to never rewrite earlier entries. The `comments:` frontmatter number is gone; the
count badge is derived from the entries.

File references inside comment text are first-class: a token shaped `path:line`
or `path:start-end` (e.g. `src/core/store.ts:123`, `src/panels/boardPanel.ts:40-60`)
becomes a one-click link that opens the file at that highlighted range. Agents
are told to always cite `path:line` when they mention code, so the journal
doubles as an index into the exact spots the work touched.

## Consequences

- Cards become self-documenting work logs: the story of a card — what was tried,
  what landed, where — lives beside the card and travels with the repo in git.
- The journal grows unbounded; that is acceptable while a card is active. Humans
  prune the history when they archive a card, the same way they would trim any
  long-lived note.
- The count badge is now derived from the entries rather than hand-maintained, so
  it can never drift from reality.
- File references turn narration into navigation, which is why the skill pushes
  agents to always include `path:line` — a comment that names a change without
  pointing at it wastes the link.
