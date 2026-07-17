import * as path from 'path';

/**
 * Resolve `relPath` against `root`, returning the absolute path only if it
 * stays inside `root` (root itself counts as inside). Returns `undefined` when
 * the path escapes the root. Pure — no filesystem access. Mirrors the
 * containment rule used by the Node filesystem adapter (defense in depth).
 */
export function resolveInsideRoot(root: string, relPath: string): string | undefined {
  const abs = path.resolve(root, relPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    return undefined;
  }
  return abs;
}
