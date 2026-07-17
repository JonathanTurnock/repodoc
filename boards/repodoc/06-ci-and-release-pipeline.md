---
column: done
labels: [ci]
priority: med
release: v0.1.0
effort: M
updatedAt: 2026-07-17T13:00:00.000Z
---
# CI and tag-triggered release pipeline

Run type-check, lint, and the full test suite (under `xvfb-run`) on every push
and pull request to `main`, uploading the packaged VSIX as an artifact. A second
workflow triggers on `v*` tags: it repeats the checks, packages the VSIX, and
attaches it to an auto-generated GitHub release.

## Checklist

- [x] CI workflow: check-types, lint, test, package
- [x] Release workflow gated on `v*` tags
- [x] Attach the VSIX to the GitHub release
