---
status: Accepted
date: 2026-07-17
---
# Decision 07 — Custom card fields defined per board, stored flat in frontmatter


## Context

Cards carry a fixed set of fields — labels, priority, agent, checklist. Real
projects need more: an estimate, a sprint, a release, an area. Baking every
possible field into the core is a losing game, and letting cards carry arbitrary
untyped keys would make the board unreadable and the values impossible to render
consistently. We wanted per-board, typed fields that both the extension and the
agents editing the files can understand without a heavier parser.

## Decision

A board declares its extra fields in `.config.json` under `fields`, each a typed
definition: `id`, optional `label`, a `type` of `text` | `number` | `boolean` |
`date` | `select` | `multiselect`, and `options` for the two select kinds. An
optional `showOnCard` renders the value as a chip on the card face.

Values live as FLAT frontmatter keys on the card, one per field id, typed by the
def — `estimate: 5`, `release: v0.2.0`, `blocked: true`, `due: 2026-07-20`, and
`multiselect` in the inline-array form `areas: [core, ci]`. Keeping them flat and
inline means the existing YAML-subset parser and the agents reading the files
stay simple — no nested `custom:` block, no block-style lists. A `select` value
that is not among the declared `options` is preserved and flagged as unknown,
never rewritten or dropped, so hand-authored or renamed values survive.

## Consequences

- Boards extend their card schema without a core change; the field defs are the
  contract the UI and agents both read.
- Flat frontmatter keeps parsing and hand-editing trivial, at the cost of a small
  reserved-key namespace: a field `id` must not collide with a built-in card key.
- Unknown select values are surfaced, not destroyed, so the board tolerates
  drift between a card and a board whose options changed underneath it.
