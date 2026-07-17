# Architecture

RepoDoc is built around a vscode-free core wrapped by thin adapters and VS Code
UI. The guiding rule: business logic lives in `src/core/**` and never imports
`vscode` or a node built-in.

## Layout

| Location | Responsibility |
| --- | --- |
| `src/core/**` | The store and all domain logic — boards, cards, decisions, docs. Pure, ports-only. |
| `src/adapters/**` | Implementations of the ports: Node filesystem, in-memory filesystem, system clock. |
| `src/panels/**` | Webview panels — the kanban board and the markdown reading view. |
| `src/trees.ts` | The Boards / Decisions / Docs tree views in the activity bar. |
| `src/extension.ts` | Activation — wires adapters, store, panels, trees, commands, and file watchers. |
| `media/**` | Webview assets (CSS/JS) for the board and reading views. |

## Ports & Adapters

The core talks to the outside world only through two ports in
`src/core/ports.ts`: `FileSystemPort` (`exists`, `readFile`, `writeFile`,
`listDir`, `rename` over workspace-relative paths) and `ClockPort` (`now()`).
`RepoDocStore` in `src/core/store.ts` is constructed with those ports, so in
production it runs on the Node adapter and in tests on the in-memory adapter.
This is what makes the whole store unit-testable without a VS Code host or a real
disk. See [Decision 03](../../decisions/03-ports-and-adapters-around-file-io.md).

The store keeps board logic itself and delegates decisions and docs to focused
stores — `DecisionStore` in `src/core/decisions.ts` and `DocStore` in
`src/core/docs.ts`. Parsing helpers are split out too: `frontmatter.ts`,
`cardParse.ts`, `boardConfig.ts`, `ordering.ts`, and `naming.ts`.

## Where data lives

Nothing is stored in a database. Boards are folders under `boards/`, decisions
are files under `decisions/`, docs are a tree under `docs/`. File watchers in the
extension call `notifyExternalChange()` on the store when those files change on
disk — so an edit made by an agent (or by you in another editor) shows up in the
board and views live. See [Decision 02](../../decisions/02-store-project-data-as-files.md).
