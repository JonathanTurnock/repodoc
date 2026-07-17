---
column: backlog
labels: [core]
priority: low
updatedAt: 2026-07-17T12:12:00.000Z
---
# Multi-workspace support

RepoDoc currently binds to a single workspace root. Support multi-root
workspaces by resolving boards, decisions, and docs per folder and letting the
tree views group content by workspace folder. The core store is already
root-relative, so most of the work is in the adapters and the tree providers.
