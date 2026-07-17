# Releasing

Releases are cut by pushing a git tag. CI does the rest.

## Cutting a release

1. Update `CHANGELOG.md` with the new version and its notes, and bump `version`
   in `package.json`.
2. Commit those to `main` and let CI go green.
3. Tag the release and push the tag:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

## What CI does

Two workflows live under `.github/workflows/`:

- **`ci.yml`** runs on every push and pull request to `main`. It installs with
  `npm ci`, then runs `check-types`, `lint`, and the full test suite under
  `xvfb-run`, packages the VSIX with `@vscode/vsce`, and uploads it as a build
  artifact.
- **`release.yml`** triggers on tags matching `v*`. It repeats the same checks
  and packaging, then attaches the VSIX to a GitHub release created with
  auto-generated notes.

Watch the release workflow go green and confirm the `.vsix` is attached to the
release. Publishing that VSIX to the VS Code Marketplace is not automated yet —
it is tracked as a To Do card on the board.
