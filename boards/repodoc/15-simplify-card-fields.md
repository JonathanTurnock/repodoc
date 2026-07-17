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
