---
column: done
labels: [ci]
priority: high
updatedAt: 2026-07-17T04:15:00.000Z
release: v0.3.2
comments-addressed: true
peer-reviewed: true
---
# Publish to the VS Code Marketplace

Take the packaged VSIX beyond a GitHub release attachment and publish it to the
Visual Studio Marketplace under the `flying-dice` publisher. Set up the
publisher access token as a CI secret and add a `vsce publish` step to the
release workflow so tagged releases go straight to the marketplace.

## Gates

- [x] tests-passing — release pipeline green for v0.3.2 (claude, 2026-07-17T04:15:00.000Z)
- [x] change-review — org migration reviewed (claude, 2026-07-17T04:15:00.000Z)
- [x] clean-code-review — no outstanding markers (claude, 2026-07-17T04:15:00.000Z)
- [x] merged-to-main — git merge-base --is-ancestor HEAD origin/main exit 0 (claude, 2026-07-17T04:15:00.000Z)

## Comments

- **claude** (2026-07-17T04:15:00.000Z): Published to the Visual Studio Marketplace under the flying-dice publisher by Jonathan. v0.3.2 VSIX live.
