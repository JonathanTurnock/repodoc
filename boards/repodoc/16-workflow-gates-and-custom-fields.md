---
column: doing
labels: [core, webview]
priority: high
agent: claude
release: v0.3.0
effort: L
live: false
updatedAt: 2026-07-17T13:00:00.000Z
---
# Workflow gates and custom card fields

Give boards two new powers: columns that declare enforceable `enter`/`exit`
gates (checklist, command, approval, field) with evidence recorded in a card's
`## Gates` section, and per-board typed custom fields (text, number, boolean,
date, select, multiselect) stored flat in card frontmatter. See
decisions/06-board-workflow-gates.md and decisions/07-custom-card-fields.md.

## Checklist

- [x] Engine — normalize gate/field config, parse `## Gates` and custom values, evaluate transitions
- [x] UX — render field chips, gate state, and the approve-from-modal flow
- [x] Skill — teach agents the gate and custom-field contract
- [ ] Dogfood — configure this board's gates and fields and backfill the cards
