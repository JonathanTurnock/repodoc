---
column: review
labels: [core]
priority: high
agent: claude
release: v0.2.0
effort: M
updatedAt: 2026-07-17T13:00:00.000Z
---
# Agent skill manager

Manage reusable agent skills from inside RepoDoc so coding agents share a common
set of conventions and prompts. Store the skill content as files in the repo,
expose them through the core store, and let contributors add or edit skills the
same way they edit cards and decisions.

## Checklist

- [x] Draft the skill content model
- [x] Add the skill manager to the core store
- [ ] Surface skills in the extension UI
- [ ] Cover the skill manager with unit tests

## Gates

- [x] tests-passing — npm test green, 130 unit + 9 e2e (claude, 2026-07-17T02:30:00Z)
