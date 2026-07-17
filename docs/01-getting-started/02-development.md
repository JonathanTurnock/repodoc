# Development

RepoDoc is a standard esbuild-bundled VS Code extension. You need Node 20+ and
VS Code 1.100 or newer.

## Set up and run

```sh
npm install
```

Press `F5` in VS Code to launch an Extension Development Host with RepoDoc
loaded. Open any folder in that window, click the RepoDoc icon in the activity
bar, and hit **Initialize RepoDoc** to seed a starter board, a first decision
record, and a docs page.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run compile` | Type-checks (`check-types`), lints, and bundles to `dist/extension.js` |
| `npm run watch` | Runs the esbuild and `tsc` watchers together for iterating |
| `npm run check-types` | `tsc --noEmit` — type-check only |
| `npm run lint` | ESLint over `src` |
| `npm test` | Runs the unit suite (in-memory filesystem) and the e2e suite (real host) |
| `npm run package` | Production bundle, used by `vsce package` |

## Testing

Unit tests live under `src/test/unit` and run the vscode-free core against the
in-memory filesystem adapter — fast and deterministic, no editor host required.
End-to-end tests under `src/test/e2e` drive the activated extension through the
VS Code test runner. `npm test` runs both; CI runs them under `xvfb-run` on
Linux.

When adding a feature, prefer pushing logic into `src/core/**` so it can be
covered by a unit test on the virtual filesystem, and keep the e2e suite for
wiring that genuinely needs the host.
