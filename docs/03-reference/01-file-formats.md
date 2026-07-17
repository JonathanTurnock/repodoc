# File formats

This is the exact on-disk schema RepoDoc reads and writes. It is the same format
the extension's core parses — the parsers live in `src/core/` (`frontmatter.ts`,
`cardParse.ts`, `boardConfig.ts`, `decisions.ts`, `docs.ts`).

## Board config — `boards/<board-id>/.config.json`

```json
{
  "name": "RepoDoc",
  "columns": [
    { "id": "backlog", "name": "Backlog", "color": "#7d828b" },
    { "id": "doing", "name": "In Progress", "color": "#5cd68a", "wip": 3 }
  ],
  "labels": {
    "core": { "name": "core", "color": "#3fb27f" }
  },
  "agents": {
    "claude": { "name": "Claude", "color": "#d97757", "initials": "CL" }
  }
}
```

- `columns` is an ordered list; each needs an `id`, and may set `name`, `color`,
  an optional `wip` limit, and `enter`/`exit` gates (see below). A column with no
  `name` falls back to a title-cased `id`.
- `labels` and `agents` are keyed maps. An entry that is null or carries no
  string field is dropped, so a stray `"claude": null` never reaches the UI.
- `fields` is an ordered list of custom card-field definitions (see below).

### Custom fields — `fields`

A board may declare extra typed card fields. Each definition carries an `id`
(the frontmatter key), an optional `label`, a `type`, `options` for the two
select kinds, and an optional `showOnCard` to render the value as a chip on the
card face:

```json
"fields": [
  { "id": "release", "label": "Release", "type": "select",
    "options": ["v0.1.0", "v0.2.0", "v0.3.0"], "showOnCard": true },
  { "id": "effort", "label": "Effort", "type": "select", "options": ["S", "M", "L"] }
]
```

`type` is one of `text`, `number`, `boolean`, `date`, `select`, or `multiselect`.
A field `id` must not collide with a reserved card key (`column`, `labels`, and
so on). A `select` value that is not among `options` is preserved and flagged as
unknown, never dropped.

### Gates — `enter` / `exit`

A column may gate transitions. `enter` gates must pass to move a card INTO the
column; `exit` gates must pass to move it OUT. Each gate has an `id`, a `kind`,
and an optional `label`:

- `checklist` — the card's `## Checklist` must be complete.
- `command` — `run` names a check (e.g. `"npm test"`); evidence-based in v1.
- `approval` — `by` lists identities (a git `user.name`) allowed to approve.
- `field` — `field` names a field id; satisfied when it is `nonEmpty`, or
  `equals` a given value.

```json
"enter": [
  { "id": "tests-passing", "kind": "command", "run": "npm test", "label": "All tests passing" },
  { "id": "peer-review", "kind": "approval", "by": ["jonathan"], "label": "Peer reviewed" }
]
```

## Card — `boards/<board-id>/NN-slug.md`

```md
---
column: doing
labels: [core, webview]
priority: high
agent: claude
updatedAt: 2026-07-17T12:00:00.000Z
---
# Card title

A sentence or two of description.

## Checklist

- [x] A finished step
- [ ] A step still to do
```

- Only `column` is required. Optional frontmatter: `labels` (inline array),
  `priority` (`high` | `med` | `low`), `agent`, `live` (boolean), `status`,
  `progress` (number), `comments` (number), `updatedAt`
  (ISO string).
- The body's first `# ` heading is the title. Everything between the title and a
  `## Checklist` heading is the description. Checklist items are `- [ ]` /
  `- [x]`.
- `NN` is a two-digit global order, contiguous from `01`; the slug after it is
  the card's identity. Frontmatter uses a small YAML subset — `key: value`
  pairs, inline `[a, b]` arrays, strings, numbers, and booleans.
- **Custom-field values** are flat frontmatter keys, one per board-defined field
  id, typed by the def: `release: v0.2.0` (select), `estimate: 5` (number),
  `blocked: true` (boolean), `due: 2026-07-20` (date), `areas: [core, ci]`
  (multiselect, inline-array form).
- **Gate evidence** lives under a `## Gates` heading as task-list items, one per
  satisfied `command` or `approval` gate, formatted
  `- [x] <gateId> — <note> (<who>, <ISO time>)`:

  ```md
  ## Gates

  - [x] tests-passing — npm test green, 130 unit + 9 e2e (claude, 2026-07-17T02:30:00Z)
  - [x] peer-review — approved (jonathan, 2026-07-17T09:00:00Z)
  ```

  A human override is recorded on the same line with `OVERRIDDEN` and their name,
  keeping the bypass visible in the diff.

## Decision — `decisions/NN-slug.md`

```md
# Decision NN — Title

## Context

## Decision

## Consequences
```

Frontmatter `status:` drives the badge (`Proposed` | `Accepted` | `Superseded`); `date:` is shown in the rendered view.
Records are ordered by their numeric prefix.

## Docs — `docs/NN-folder/NN-slug.md`

Plain markdown. Folders become collapsible sidebar sections and files become
pages; a leading `NN-` numeric prefix orders both, and the first `# ` heading is
the sidebar label (falling back to the title-cased file name).
