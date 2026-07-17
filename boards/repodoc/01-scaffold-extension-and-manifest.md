---
column: done
labels: [core]
priority: high
release: v0.1.0
effort: M
updatedAt: 2026-07-17T13:00:00.000Z
---
# Scaffold the VS Code extension and manifest

Bootstrap the extension so it activates in VS Code and contributes a RepoDoc
activity-bar container. Define the `package.json` manifest — publisher, engine,
the `repodoc` view container, the Boards/Decisions/Docs views, welcome content,
and the `repodoc.*` commands — and wire an esbuild bundle to `dist/extension.js`.
