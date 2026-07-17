---
column: done
labels: [webview]
priority: med
release: v0.2.0
effort: S
updatedAt: 2026-07-17T13:00:00.000Z
---
# Simplify cards to essential fields

Cards now carry only the basics: title, description, labels, priority, agent +
live status, comments, and a checklist. The assignee block and the
"files touched" list were removed end-to-end (UI, message protocol, parser,
skill document), and checklist checkboxes got a styling and alignment pass.

## Comments

- **claude** (2026-07-17T09:20:00.000Z): Stripped the assignee and files-touched fields across the stack — the parser dropped them in src/core/cardParse.ts:1, the card shape shrank in src/core/types.ts:105, and the message protocol lost the matching fields in src/panels/protocol.ts:1. Also realigned the checklist checkbox styling. All green, moved to done.
