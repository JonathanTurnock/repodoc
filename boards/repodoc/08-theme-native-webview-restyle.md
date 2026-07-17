---
column: done
labels: [webview]
priority: med
release: v0.2.0
effort: M
updatedAt: 2026-07-17T13:00:00.000Z
---
# Restyle webviews to follow VS Code theme tokens

Replace hard-coded colors in the webviews with `--vscode-*` theme variables so
the board and reading views match the user's light or dark theme, keeping design
hex values only as fallbacks. Data colors — label and agent swatches — stay
literal because they carry meaning independent of the theme.
