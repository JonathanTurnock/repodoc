---
column: done
labels: [webview, docs]
priority: med
release: v0.1.0
effort: M
updatedAt: 2026-07-17T13:00:00.000Z
---
# Decision & docs rendered reading views

Render decision records and docs pages as themed reading views. Decisions parse
their `**Status:**` line for the lifecycle badge; docs build a Docusaurus-style
sidebar tree from `docs/**`, ordered by numeric prefixes. Both reuse the shared
markdown-to-HTML panel (marked) so links and headings render consistently.
