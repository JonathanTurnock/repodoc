/**
 * Board `.config.json` shape, defaults, and normalization. Pure and vscode-free:
 * `normalizeBoardConfig` turns arbitrary parsed JSON (or `undefined`) into a
 * trustworthy {@link BoardConfig} the store can rely on.
 */

import { AgentDef, LabelDef } from './types';
import { titleCase } from './naming';

/** A configured column as stored in `.config.json` (no derived card list). */
export interface ConfigColumn {
  id: string;
  name: string;
  color: string;
  wip?: number;
}

export interface BoardConfig {
  name: string;
  columns: ConfigColumn[];
  labels: Record<string, LabelDef>;
  agents: Record<string, AgentDef>;
}

export const DEFAULT_LABELS: Record<string, LabelDef> = {
  backend: { name: 'backend', color: '#3fb27f' },
  frontend: { name: 'frontend', color: '#4c8bf5' },
  bug: { name: 'bug', color: '#e5534b' },
  infra: { name: 'infra', color: '#d99a30' },
  docs: { name: 'docs', color: '#9a7bd6' },
  perf: { name: 'perf', color: '#c9a227' },
};

export const DEFAULT_AGENTS: Record<string, AgentDef> = {
  claude: { name: 'Claude', color: '#d97757', initials: 'CL' },
  cursor: { name: 'Cursor', color: '#4c8bf5', initials: 'CU' },
  copilot: { name: 'Copilot', color: '#a371f7', initials: 'CP' },
};

/** The 5 default board columns, matching the design mock. */
export function defaultColumns(): ConfigColumn[] {
  return [
    { id: 'backlog', name: 'Backlog', color: '#7d828b' },
    { id: 'todo', name: 'To Do', color: '#4c8bf5' },
    { id: 'doing', name: 'In Progress', color: '#5cd68a', wip: 3 },
    { id: 'review', name: 'In Review', color: '#d99a30' },
    { id: 'done', name: 'Done', color: '#3fb27f' },
  ];
}

/**
 * Coerces arbitrary parsed JSON into a {@link BoardConfig}. Missing or malformed
 * input falls back to a board named after `boardId` with no columns and empty
 * label/agent maps. Column entries without a string `id` are dropped, and
 * label/agent entries that are null, non-objects, or carry no usable string
 * fields are dropped too — so a stray `"agents": { "claude": null }` never
 * reaches the UI.
 */
export function normalizeBoardConfig(parsed: unknown, boardId: string): BoardConfig {
  const fallbackName = titleCase(boardId);
  if (!parsed || typeof parsed !== 'object') {
    return { name: fallbackName, columns: [], labels: {}, agents: {} };
  }
  const p = parsed as Partial<BoardConfig>;
  return {
    name:
      typeof p.name === 'string' && p.name.trim() ? p.name : fallbackName,
    columns: Array.isArray(p.columns)
      ? (p.columns as unknown[]).filter(
          (c): c is ConfigColumn =>
            !!c &&
            typeof c === 'object' &&
            typeof (c as ConfigColumn).id === 'string' &&
            (c as ConfigColumn).id.length > 0,
        )
      : [],
    labels: cleanDefMap<LabelDef>(p.labels),
    agents: cleanDefMap<AgentDef>(p.agents),
  };
}

/**
 * Keeps only map entries whose value is a non-null object carrying at least one
 * usable string field; drops nulls, arrays, primitives, and empty shells.
 */
function cleanDefMap<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      Object.values(entry as Record<string, unknown>).some((v) => typeof v === 'string')
    ) {
      out[key] = entry as T;
    }
  }
  return out;
}
