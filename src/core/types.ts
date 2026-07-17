/**
 * Shared data model for RepoDoc.
 *
 * All data lives inside the repository:
 *  - `boards/<id>/.config.json`   — board name, columns, labels, agents
 *  - `boards/<id>/NN-slug.md`     — one card per file (frontmatter + markdown)
 *  - `decisions/NN-slug.md`       — decision records (markdown)
 *  - `docs/**`                    — documentation tree (plain markdown)
 *
 * The in-memory shapes below (BoardData/Column/Card) are what the webview and
 * panels consume — columns carry derived `cardIds`, cards are keyed by id.
 */

export interface LabelDef {
  name: string;
  color: string;
}

export interface AgentDef {
  name: string;
  color: string;
  initials: string;
}

export type CustomFieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'multiselect';

/** A board-defined card field, declared in `.config.json` `fields`. */
export interface CustomFieldDef {
  /** Frontmatter key. Must not collide with the reserved card keys. */
  id: string;
  /** Display label — falls back to a title-cased id. */
  label?: string;
  type: CustomFieldType;
  /** Choices for select/multiselect. */
  options?: string[];
  /** Show the value as a chip on the card face. */
  showOnCard?: boolean;
}

export type CustomFieldValue = string | number | boolean | string[];

export type GateKind = 'checklist' | 'command' | 'approval' | 'field';

/** A named condition on a column transition, declared per column in config. */
export interface GateDef {
  id: string;
  kind: GateKind;
  /** Human label — falls back to the id. */
  label?: string;
  /** command: the check to run (evidence-based in v1). */
  run?: string;
  /** approval: identities allowed to approve. */
  by?: string[];
  /** field: the custom-field (or reserved-field) id the gate inspects. */
  field?: string;
  /** field: satisfied when the field has any value. */
  nonEmpty?: boolean;
  /** field: satisfied when the field equals this value. */
  equals?: string;
}

/** One line of the card's `## Gates` section: `- [x] <gateId> — <note>`. */
export interface GateEvidence {
  gateId: string;
  done: boolean;
  note?: string;
}

/** The evaluation of one gate for a proposed transition. */
export interface GateResult {
  gate: GateDef;
  satisfied: boolean;
  /** Human-readable reason, e.g. "checklist 3/5" or "no approval by jonathan". */
  reason: string;
}

export interface RepoDocConfig {
  labels: Record<string, LabelDef>;
  agents: Record<string, AgentDef>;
  /** Board-defined card fields, in display order. */
  fields: CustomFieldDef[];
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export type Priority = 'high' | 'med' | 'low';

export interface Card {
  id: string;
  title: string;
  labels?: string[];
  priority?: Priority;
  /** Key into RepoDocConfig.agents — the agent assigned to this card. */
  agent?: string;
  /** True while an agent is actively working the card. */
  live?: boolean;
  /** Live status line, e.g. "editing src/payments/stripe.ts". */
  status?: string;
  /** Live progress 0-100. */
  progress?: number;
  comments?: number;
  desc?: string;
  checklist?: ChecklistItem[];
  /** Values of board-defined custom fields, keyed by field id, typed per def. */
  custom?: Record<string, CustomFieldValue>;
  /** Parsed `## Gates` section lines (evidence for command/approval gates). */
  gates?: GateEvidence[];
  /** ISO timestamp of the last change. */
  updatedAt?: string;
}

export interface Column {
  id: string;
  name: string;
  /** Header dot color, e.g. "#4c8bf5". */
  color: string;
  /** Optional WIP limit. */
  wip?: number;
  /** Gates a card must satisfy to move INTO this column. */
  enter?: GateDef[];
  /** Gates a card must satisfy to move OUT of this column. */
  exit?: GateDef[];
  /** Ordered card ids. */
  cardIds: string[];
}

export interface BoardData {
  name: string;
  columns: Column[];
  cards: Record<string, Card>;
}

export interface BoardRef {
  id: string;
  name: string;
  cardCount: number;
}

export interface DecisionRecord {
  /** Stable id — the file name without extension. */
  id: string;
  /** Number as written in the file name, e.g. "01". */
  num: string;
  /** File name, e.g. "01-record-decisions.md". */
  file: string;
  title: string;
  /** "Accepted" | "Proposed" | "Superseded" (free-form, from the markdown). */
  status: string;
  /** Decision date (frontmatter `date:`), verbatim. */
  date?: string;
  /** Full markdown body. */
  body: string;
}

export interface DocNode {
  type: 'dir' | 'file';
  /** File-system name. */
  name: string;
  /** Display label — first `# ` heading for files, title-cased name for dirs. */
  label: string;
  /** Path relative to the workspace root, e.g. "docs/guides/agents.md". */
  relPath: string;
  children?: DocNode[];
}
