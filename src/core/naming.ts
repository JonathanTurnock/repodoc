/** Small pure helpers for slugs, labels, and numeric ordering prefixes. */

export function slugify(name: string, fallback = 'untitled'): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  );
}

export function titleCase(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Strips a leading `NN-` ordering prefix, e.g. "03-intro" -> "intro". */
export function stripNumPrefix(name: string): string {
  return name.replace(/^\d+-/, '');
}

/** The leading `NN` ordering prefix as a number, or `undefined` when absent. */
export function numPrefix(name: string): number | undefined {
  const m = /^(\d+)-/.exec(name);
  return m ? parseInt(m[1], 10) : undefined;
}

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
