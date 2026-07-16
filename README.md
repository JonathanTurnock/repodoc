# RepoDoc

Act as PM/Tech-lead inside your repo. RepoDoc gives VS Code a kanban board, decision records, and a documentation site — all stored as plain files in the repository, so coding agents can update docs, document decisions, and flow tickets across the board while you steer.

## Data layout

Everything lives at the workspace root as human- and agent-editable files:

| Path | Contents |
| --- | --- |
| `docs/NN-slug.md`, `docs/<subfolder>/NN-slug.md` | Documentation tree (numeric prefix orders the sidebar) |
| `decisions/NN-slug.md` | Decision records (ADRs) with `**Status:** …` lines |
| `boards/<board-id>/NN-slug.md` | One card per file — frontmatter holds column, labels, priority, agent |
| `boards/<board-id>/.config.json` | Board name, columns, WIP limits, labels, agents |

## Features

- **Native navigation** — Boards, Decisions, and Docs tree views in a RepoDoc activity-bar container.
- **Board view** — Trello-style columns with drag & drop, WIP limits, search, agent filters, and live agent progress on cards.
- **Card view** — labels, priority, assignee, checklist, and touched files in a detail modal.
- **Decisions & Docs** — rendered markdown views styled for reading.

## Development

- `npm install` — install dependencies
- Press `F5` in VS Code to launch an Extension Development Host
- `npm run compile` — type-check, lint, and bundle
- `npm run watch` — rebuild on change
- `npm test` — unit + extension e2e tests

Releases are built by GitHub Actions: pushing a `v*` tag packages the VSIX and attaches it to a GitHub release.
