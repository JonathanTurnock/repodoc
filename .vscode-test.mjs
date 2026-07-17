import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

// The e2e suite drives the real extension inside a persistent fixture workspace.
// It must exist before VS Code launches, and it must NOT live under src/.
const fixtureWorkspace = resolve(here, '.vscode-test/fixtures/workspace');
mkdirSync(fixtureWorkspace, { recursive: true });

export default defineConfig([
  {
    // Pure core logic exercised against the in-memory adapter. These still run
    // inside the extension host, but none of them touch the vscode API.
    label: 'unit',
    files: 'out/test/unit/**/*.test.js',
  },
  {
    // End-to-end: the real extension, real Node FS, in the fixture workspace.
    label: 'e2e',
    files: 'out/test/e2e/**/*.test.js',
    workspaceFolder: fixtureWorkspace,
    mocha: { timeout: 60000 },
  },
]);
