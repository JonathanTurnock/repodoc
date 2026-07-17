---
column: done
labels: [webview]
priority: high
release: v0.1.0
effort: L
updatedAt: 2026-07-17T13:00:00.000Z
---
# Kanban board webview with drag & drop

Render the board in a webview panel: Trello-style columns with WIP limits,
labels, priorities, card search, and per-agent filters. Dragging a card between
columns posts a move message to the extension, which renumbers the card files on
disk. Cards assigned to an agent show a live status line and progress bar.
