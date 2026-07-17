import { parseFrontmatter } from './frontmatter';
import { markdownTitle, numPrefix, slugFromFileName } from './naming';
import {
  Card,
  ChecklistItem,
  CustomFieldDef,
  CustomFieldValue,
  GateEvidence,
  Priority,
} from './types';

/** One card file parsed from disk, with the metadata needed to order/bucket it. */
export interface CardEntry {
  fileName: string;
  slug: string;
  num: number | undefined;
  column: string;
  card: Card;
}

/**
 * Parse a `NN-slug.md` card file into a CardEntry. Pure; tolerant of malformed
 * input. `fields` are the board's custom-field defs used to coerce and adopt
 * frontmatter values into {@link Card.custom}.
 */
export function parseCard(
  fileName: string,
  content: string,
  fields: CustomFieldDef[],
): CardEntry {
  const { data, body } = parseFrontmatter(content);
  const slug = slugFromFileName(fileName);
  const title = markdownTitle(body, slug);

  const card: Card = { id: slug, title };

  const desc = extractDescription(body);
  if (desc) {
    card.desc = desc;
  }
  const { items } = findChecklist(body);
  if (items.length) {
    card.checklist = items;
  }
  const gates = findGates(body).items;
  if (gates.length) {
    card.gates = gates;
  }
  const labels = asStringArray(data.labels);
  if (labels && labels.length) {
    card.labels = labels;
  }
  const priority = asPriority(data.priority);
  if (priority) {
    card.priority = priority;
  }
  const agent = asString(data.agent);
  if (agent) {
    card.agent = agent;
  }
  if (data.live === true) {
    card.live = true;
  }
  const status = asString(data.status);
  if (status) {
    card.status = status;
  }
  const progress = asNumber(data.progress);
  if (progress !== undefined) {
    card.progress = progress;
  }
  const comments = asNumber(data.comments);
  if (comments !== undefined) {
    card.comments = comments;
  }
  const updatedAt = asString(data.updatedAt);
  if (updatedAt) {
    card.updatedAt = updatedAt;
  }

  const custom: Record<string, CustomFieldValue> = {};
  for (const def of fields) {
    const value = coerceCustomValue(def.type, data[def.id]);
    if (value !== undefined) {
      custom[def.id] = value;
    }
  }
  if (Object.keys(custom).length) {
    card.custom = custom;
  }

  return {
    fileName,
    slug,
    num: numPrefix(fileName),
    column: asString(data.column) ?? '',
    card,
  };
}

/**
 * Body text between the title heading and the first `## Checklist` / `## Gates`
 * heading (whichever comes first) — both terminate the description.
 */
function extractDescription(body: string): string {
  const lines = body.split('\n');
  const headingIdx = lines.findIndex((l) => /^#\s+/.test(l));
  const start = headingIdx === -1 ? 0 : headingIdx + 1;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+(checklist|gates)\s*$/i.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/** One `- [ ]` / `- [x]` task-list line, with its raw text and body index. */
interface TaskLine {
  text: string;
  done: boolean;
  index: number;
}

/**
 * Task-list lines under the first heading matching `headingRe`, up to the next
 * heading. Shared by {@link findChecklist} and {@link findGates}.
 */
function collectTaskLines(body: string, headingRe: RegExp): TaskLine[] {
  const lines = body.split('\n');
  const out: TaskLine[] = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headingRe.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,6}\s+/.test(line)) {
      break; // next heading ends the section
    }
    if (inSection) {
      const m = /^\s*-\s+\[([ xX])\]\s+(.*)$/.exec(line);
      if (m) {
        out.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x', index: i });
      }
    }
  }
  return out;
}

/** Task-list items under `## Checklist`, with their body line indices. */
export function findChecklist(body: string): { items: ChecklistItem[]; indices: number[] } {
  const lines = collectTaskLines(body, /^##\s+checklist\s*$/i);
  return {
    items: lines.map((l) => ({ text: l.text, done: l.done })),
    indices: lines.map((l) => l.index),
  };
}

/**
 * Evidence lines under `## Gates`. Each line is `<gateId>` or
 * `<gateId> — <note>`; the gate id is the text up to the first ` — ` separator
 * and the note is the trimmed remainder (absent when there is no separator).
 */
export function findGates(body: string): { items: GateEvidence[]; indices: number[] } {
  const lines = collectTaskLines(body, /^##\s+gates\s*$/i);
  const items: GateEvidence[] = [];
  const indices: number[] = [];
  for (const line of lines) {
    const sep = line.text.indexOf(' — ');
    const gateId = sep === -1 ? line.text : line.text.slice(0, sep).trim();
    if (!gateId) {
      continue;
    }
    const note = sep === -1 ? '' : line.text.slice(sep + 3).trim();
    const evidence: GateEvidence = { gateId, done: line.done };
    if (note) {
      evidence.note = note;
    }
    items.push(evidence);
    indices.push(line.index);
  }
  return { items, indices };
}

/**
 * Coerces a raw frontmatter value to a card custom value of the given type.
 * Returns `undefined` when the value is missing or the wrong shape. `select`
 * keeps values that are not among the defined options — the UI warns instead
 * of destroying user data; `multiselect` accepts a lone string as a one-item
 * array.
 */
function coerceCustomValue(type: CustomFieldDef['type'], v: unknown): CustomFieldValue | undefined {
  switch (type) {
    case 'text':
    case 'date':
    case 'select':
      return typeof v === 'string' ? v : undefined;
    case 'number':
      return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    case 'boolean':
      return typeof v === 'boolean' ? v : undefined;
    case 'multiselect':
      if (typeof v === 'string') {
        return [v];
      }
      if (Array.isArray(v)) {
        return v.filter((x): x is string => typeof x === 'string');
      }
      return undefined;
    default:
      return undefined;
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string');
  }
  return undefined;
}

function asPriority(v: unknown): Priority | undefined {
  return v === 'high' || v === 'med' || v === 'low' ? v : undefined;
}
