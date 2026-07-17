import { ClockPort, Disposable, FileSystemPort } from './ports';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter';
import { numPrefix, pad, slugify, stripNumPrefix, titleCase } from './naming';
import {
  AgentDef,
  BoardData,
  BoardRef,
  Card,
  ChecklistItem,
  Column,
  DecisionRecord,
  DocNode,
  LabelDef,
  Priority,
  RepoDocConfig,
} from './types';

/** A configured column as stored in `.config.json` (no derived card list). */
interface ConfigColumn {
  id: string;
  name: string;
  color: string;
  wip?: number;
}

interface BoardConfig {
  name: string;
  columns: ConfigColumn[];
  labels: Record<string, LabelDef>;
  agents: Record<string, AgentDef>;
}

/** One card file parsed from disk, with the metadata needed to order/bucket it. */
interface CardEntry {
  fileName: string;
  slug: string;
  num: number | undefined;
  column: string;
  card: Card;
}

const DEFAULT_LABELS: Record<string, LabelDef> = {
  backend: { name: 'backend', color: '#3fb27f' },
  frontend: { name: 'frontend', color: '#4c8bf5' },
  bug: { name: 'bug', color: '#e5534b' },
  infra: { name: 'infra', color: '#d99a30' },
  docs: { name: 'docs', color: '#9a7bd6' },
  perf: { name: 'perf', color: '#c9a227' },
};

const DEFAULT_AGENTS: Record<string, AgentDef> = {
  claude: { name: 'Claude', color: '#d97757', initials: 'CL' },
  cursor: { name: 'Cursor', color: '#4c8bf5', initials: 'CU' },
  copilot: { name: 'Copilot', color: '#a371f7', initials: 'CP' },
};

/** The 5 default board columns, matching the design mock. */
function defaultColumns(): ConfigColumn[] {
  return [
    { id: 'backlog', name: 'Backlog', color: '#7d828b' },
    { id: 'todo', name: 'To Do', color: '#4c8bf5' },
    { id: 'doing', name: 'In Progress', color: '#5cd68a', wip: 3 },
    { id: 'review', name: 'In Review', color: '#d99a30' },
    { id: 'done', name: 'Done', color: '#3fb27f' },
  ];
}

/**
 * RepoDoc's data store, built on the new on-disk layout. It talks to the
 * filesystem and the clock only through ports, so it never imports 'vscode'
 * and stays unit-testable against an in-memory adapter.
 */
export class RepoDocStore {
  /** Absolute workspace path — metadata only (e.g. for the host's openFile). */
  readonly root: string | undefined;

  private readonly listeners: Array<() => void> = [];

  constructor(
    private readonly fs: FileSystemPort,
    private readonly clock: ClockPort,
    root?: string,
  ) {
    this.root = root;
  }

  // ---- change notification ----

  onDidChange(listener: () => void): Disposable {
    this.listeners.push(listener);
    return {
      dispose: (): void => {
        const i = this.listeners.indexOf(listener);
        if (i >= 0) {
          this.listeners.splice(i, 1);
        }
      },
    };
  }

  /** Re-fires listeners; called by the host's file watchers on external edits. */
  notifyExternalChange(): void {
    this.fire();
  }

  private fire(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  // ---- lifecycle ----

  isInitialized(): boolean {
    return this.fs.exists('boards') || this.fs.exists('decisions');
  }

  init(): void {
    const boardConfig = 'boards/project-backlog/.config.json';
    if (!this.fs.exists(boardConfig)) {
      this.fs.writeFile(boardConfig, jsonStringify(seedBoardConfig()));
      const stamp = this.now();
      for (const seed of seedCards(stamp)) {
        this.fs.writeFile(`boards/project-backlog/${seed.name}`, seed.content);
      }
    }

    const adr = 'decisions/01-record-architecture-decisions.md';
    if (!this.fs.exists(adr)) {
      this.fs.writeFile(adr, seedDecision(this.today()));
    }

    if (!this.fs.exists('docs')) {
      this.fs.writeFile('docs/getting-started/01-introduction.md', seedIntroDoc());
    }

    this.fire();
  }

  // ---- config ----

  getBoardConfig(boardId: string): RepoDocConfig {
    const config = this.readConfig(boardId);
    return { labels: config.labels, agents: config.agents };
  }

  displayPath(boardId: string): string {
    return `boards/${boardId}/`;
  }

  private readConfig(boardId: string): BoardConfig {
    const fallback: BoardConfig = {
      name: titleCase(boardId),
      columns: [],
      labels: {},
      agents: {},
    };
    const raw = this.fs.readFile(`boards/${boardId}/.config.json`);
    if (raw === undefined) {
      return fallback;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<BoardConfig>;
      if (!parsed || typeof parsed !== 'object') {
        return fallback;
      }
      return {
        name:
          typeof parsed.name === 'string' && parsed.name.trim()
            ? parsed.name
            : titleCase(boardId),
        columns: Array.isArray(parsed.columns)
          ? (parsed.columns as unknown[])
              .filter(
                (c): c is ConfigColumn =>
                  !!c &&
                  typeof c === 'object' &&
                  typeof (c as ConfigColumn).id === 'string' &&
                  (c as ConfigColumn).id.length > 0,
              )
          : [],
        labels:
          parsed.labels && typeof parsed.labels === 'object' ? parsed.labels : {},
        agents:
          parsed.agents && typeof parsed.agents === 'object' ? parsed.agents : {},
      };
    } catch {
      return fallback;
    }
  }

  // ---- boards ----

  listBoards(): BoardRef[] {
    const refs: BoardRef[] = [];
    for (const entry of this.fs.listDir('boards')) {
      if (entry.kind !== 'dir' || entry.name.startsWith('.')) {
        continue;
      }
      const config = this.readConfig(entry.name);
      refs.push({
        id: entry.name,
        name: config.name,
        cardCount: this.cardFileNames(entry.name).length,
      });
    }
    refs.sort((a, b) => a.name.localeCompare(b.name));
    return refs;
  }

  getBoard(id: string): BoardData | undefined {
    if (!this.fs.exists(`boards/${id}`)) {
      return undefined;
    }
    const config = this.readConfig(id);
    const columns: Column[] = config.columns.map((c) => ({
      id: c.id,
      name: c.name || titleCase(c.id),
      color: c.color || '#7d828b',
      wip: c.wip,
      cardIds: [],
    }));
    const byId = new Map(columns.map((c) => [c.id, c]));

    const cards: Record<string, Card> = {};
    for (const entry of this.readBoardCards(id)) {
      cards[entry.slug] = entry.card;
      // Unknown/missing column falls back to the first column so cards are
      // never invisible.
      const col = byId.get(entry.column) ?? (columns.length > 0 ? columns[0] : undefined);
      if (col) {
        col.cardIds.push(entry.slug);
      }
    }

    return { name: config.name, columns, cards };
  }

  createBoard(name: string): string {
    const id = slugify(name);
    const config: BoardConfig = {
      name: name.trim() || titleCase(id),
      columns: defaultColumns(),
      labels: { ...DEFAULT_LABELS },
      agents: { ...DEFAULT_AGENTS },
    };
    this.fs.writeFile(`boards/${id}/.config.json`, jsonStringify(config));
    this.fire();
    return id;
  }

  addCard(boardId: string, columnId: string, title: string): void {
    const config = this.readConfig(boardId);
    if (!config.columns.some((c) => c.id === columnId)) {
      return;
    }
    const entries = this.readBoardCards(boardId);
    const taken = new Set(entries.map((e) => e.slug));
    const base = slugify(title, 'card');
    let slug = base;
    let suffix = 2;
    while (taken.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix++;
    }
    const maxNum = entries.reduce((max, e) => Math.max(max, e.num ?? 0), 0);
    const num = maxNum + 1;
    const width = Math.max(2, String(num).length);
    const fileName = `${pad(num, width)}-${slug}.md`;

    const data: Record<string, unknown> = { column: columnId, updatedAt: this.now() };
    const body = `# ${title.trim()}\n`;
    this.fs.writeFile(`boards/${boardId}/${fileName}`, serializeFrontmatter(data, body));
    this.fire();
  }

  addColumn(boardId: string, name: string): void {
    const config = this.readConfig(boardId);
    const id = slugify(name);
    config.columns.push({ id, name: name.trim() || titleCase(id), color: '#7d828b' });
    this.fs.writeFile(`boards/${boardId}/.config.json`, jsonStringify(config));
    this.fire();
  }

  moveCard(boardId: string, cardId: string, toColumnId: string, index: number): void {
    const entries = this.readBoardCards(boardId);
    const moved = entries.find((e) => e.slug === cardId);
    if (!moved) {
      return; // unknown card — never delete
    }
    // Slugs are card identities. Externally-authored files can collide (two
    // NN-foo.md files); renumbering would then rename one file over the other
    // and destroy it, so refuse to reorder until the collision is resolved.
    const seen = new Set<string>();
    for (const e of entries) {
      if (seen.has(e.slug)) {
        return;
      }
      seen.add(e.slug);
    }
    const config = this.readConfig(boardId);
    if (!config.columns.some((c) => c.id === toColumnId)) {
      return; // unknown column
    }

    // Set the card's column + updatedAt in its frontmatter (same file name).
    const path = `boards/${boardId}/${moved.fileName}`;
    const content = this.fs.readFile(path);
    if (content === undefined) {
      return;
    }
    const { data, body } = parseFrontmatter(content);
    data.column = toColumnId;
    data.updatedAt = this.now();
    this.fs.writeFile(path, serializeFrontmatter(data, body));

    // Compute the new global card order.
    const globalOrder = entries.map((e) => e.slug);
    const targetOrder = entries
      .filter((e) => e.column === toColumnId && e.slug !== cardId)
      .map((e) => e.slug);
    const without = globalOrder.filter((s) => s !== cardId);

    let insertPos: number;
    if (targetOrder.length === 0) {
      insertPos = without.length; // empty column — append at global end
    } else {
      const clamped = Math.max(0, Math.min(index, targetOrder.length));
      if (clamped >= targetOrder.length) {
        // Past the end — right after the target column's last card.
        insertPos = without.indexOf(targetOrder[targetOrder.length - 1]) + 1;
      } else {
        // Immediately before the card currently at `index` in the column.
        insertPos = without.indexOf(targetOrder[clamped]);
      }
    }
    const newOrder = without.slice();
    newOrder.splice(insertPos, 0, cardId);

    const slugToFile = new Map(entries.map((e) => [e.slug, e.fileName]));
    this.renumber(
      boardId,
      newOrder.map((slug) => ({ slug, currentFile: slugToFile.get(slug) as string })),
    );
    this.fire();
  }

  toggleChecklistItem(boardId: string, cardId: string, itemIndex: number): void {
    const fileName = this.cardFileNames(boardId).find(
      (name) => stripNumPrefix(name.replace(/\.md$/i, '')) === cardId,
    );
    if (!fileName) {
      return;
    }
    const path = `boards/${boardId}/${fileName}`;
    const content = this.fs.readFile(path);
    if (content === undefined) {
      return;
    }
    const { data, body } = parseFrontmatter(content);
    const { indices } = findChecklist(body);
    if (itemIndex < 0 || itemIndex >= indices.length) {
      return;
    }
    const bodyLines = body.split('\n');
    const li = indices[itemIndex];
    bodyLines[li] = bodyLines[li].replace(/\[([ xX])\]/, (_m, c: string) =>
      c.toLowerCase() === 'x' ? '[ ]' : '[x]',
    );
    data.updatedAt = this.now();
    this.fs.writeFile(path, serializeFrontmatter(data, bodyLines.join('\n')));
    this.fire();
  }

  // ---- card file helpers ----

  private cardFileNames(boardId: string): string[] {
    return this.fs
      .listDir(`boards/${boardId}`)
      .filter((e) => e.kind === 'file' && !e.name.startsWith('.') && /\.md$/i.test(e.name))
      .map((e) => e.name);
  }

  private readBoardCards(boardId: string): CardEntry[] {
    const entries: CardEntry[] = [];
    for (const fileName of this.cardFileNames(boardId)) {
      const content = this.fs.readFile(`boards/${boardId}/${fileName}`);
      if (content === undefined) {
        continue; // unreadable — skip
      }
      const entry = parseCard(fileName, content);
      if (entry) {
        entries.push(entry);
      }
    }
    entries.sort((a, b) => {
      const an = a.num ?? Number.MAX_SAFE_INTEGER;
      const bn = b.num ?? Number.MAX_SAFE_INTEGER;
      if (an !== bn) {
        return an - bn;
      }
      return a.fileName.localeCompare(b.fileName);
    });
    return entries;
  }

  /** Renames every card file to a contiguous `NN-slug.md`, changed files only. */
  private renumber(boardId: string, ordered: Array<{ slug: string; currentFile: string }>): void {
    const width = Math.max(2, String(ordered.length).length);
    const dir = `boards/${boardId}`;
    const ops: Array<{ from: string; to: string }> = [];
    ordered.forEach((entry, i) => {
      const newName = `${pad(i + 1, width)}-${entry.slug}.md`;
      if (newName !== entry.currentFile) {
        ops.push({ from: `${dir}/${entry.currentFile}`, to: `${dir}/${newName}` });
      }
    });
    if (ops.length === 0) {
      return;
    }
    // Two-phase via temp names so number swaps never clobber a sibling.
    const staged = ops.map((op, i) => ({
      from: op.from,
      tmp: `${dir}/.renumber-${i}.tmp`,
      to: op.to,
    }));
    for (const s of staged) {
      this.fs.rename(s.from, s.tmp);
    }
    for (const s of staged) {
      this.fs.rename(s.tmp, s.to);
    }
  }

  // ---- decisions ----

  listDecisions(): DecisionRecord[] {
    const records: DecisionRecord[] = [];
    for (const entry of this.fs.listDir('decisions')) {
      if (entry.kind !== 'file' || entry.name.startsWith('.') || !/\.md$/i.test(entry.name)) {
        continue;
      }
      const record = this.parseDecision(entry.name);
      if (record) {
        records.push(record);
      }
    }
    records.sort((a, b) => {
      const an = parseInt(a.num, 10) || 0;
      const bn = parseInt(b.num, 10) || 0;
      if (an !== bn) {
        return an - bn;
      }
      return a.file.localeCompare(b.file);
    });
    return records;
  }

  getDecision(id: string): DecisionRecord | undefined {
    return this.listDecisions().find((d) => d.id === id);
  }

  private parseDecision(file: string): DecisionRecord | undefined {
    const content = this.fs.readFile(`decisions/${file}`);
    if (content === undefined) {
      return undefined;
    }
    const id = file.replace(/\.md$/i, '');
    const numMatch = /^(\d+)/.exec(file);
    const num = numMatch ? numMatch[1] : '0000';

    const headingMatch = /^#\s+(.+)$/m.exec(content);
    let title = headingMatch ? headingMatch[1].trim() : titleCase(stripNumPrefix(id));
    title = title.replace(/^(?:Decision\s+\d+|ADR-?\d+)\s*[—–-]\s*/i, '').trim();

    const statusMatch = /\*\*Status:\*\*\s*([A-Za-z]+)/.exec(content);
    const status = statusMatch ? statusMatch[1] : 'Proposed';

    return { id, num, file, title, status, body: content };
  }

  createDecision(title: string): string {
    const existing = this.listDecisions();
    const maxNum = existing.reduce((max, d) => Math.max(max, parseInt(d.num, 10) || 0), 0);
    const num = pad(maxNum + 1, 2);
    const cleanTitle = title.trim() || 'Untitled decision';
    const id = `${num}-${slugify(cleanTitle)}`;
    const file = `${id}.md`;
    const body =
      `# Decision ${num} — ${cleanTitle}\n\n` +
      `**Status:** Proposed &nbsp;·&nbsp; **Date:** ${this.today()}\n\n` +
      `## Context\n\n` +
      `_What is the issue that motivates this decision?_\n\n` +
      `## Decision\n\n` +
      `_What is the change that we're proposing or doing?_\n\n` +
      `## Consequences\n\n` +
      `_What becomes easier or harder because of this change?_\n`;
    this.fs.writeFile(`decisions/${file}`, body);
    this.fire();
    return id;
  }

  // ---- docs ----

  getDocsTree(): DocNode[] {
    if (!this.fs.exists('docs')) {
      return [];
    }
    return this.walkDocs('docs');
  }

  private walkDocs(relDir: string): DocNode[] {
    const nodes: DocNode[] = [];
    for (const entry of this.fs.listDir(relDir)) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const relPath = `${relDir}/${entry.name}`;
      if (entry.kind === 'dir') {
        nodes.push({
          type: 'dir',
          name: entry.name,
          label: titleCase(stripNumPrefix(entry.name)),
          relPath,
          children: this.walkDocs(relPath),
        });
      } else if (/\.md$/i.test(entry.name)) {
        nodes.push({
          type: 'file',
          name: entry.name,
          label: this.docLabel(relPath, entry.name),
          relPath,
        });
      }
    }
    nodes.sort(docCompare);
    return nodes;
  }

  private docLabel(relPath: string, fileName: string): string {
    const content = this.fs.readFile(relPath);
    if (content !== undefined) {
      const headingMatch = /^#\s+(.+)$/m.exec(content);
      if (headingMatch) {
        return headingMatch[1].trim();
      }
    }
    return titleCase(stripNumPrefix(fileName.replace(/\.md$/i, '')));
  }

  readDoc(relPath: string): { title: string; body: string } | undefined {
    if (isAbsolute(relPath) || relPath.split('/').includes('..')) {
      return undefined;
    }
    const body = this.fs.readFile(relPath);
    if (body === undefined) {
      return undefined;
    }
    const headingMatch = /^#\s+(.+)$/m.exec(body);
    const base = relPath.split('/').pop() ?? relPath;
    const title = headingMatch
      ? headingMatch[1].trim()
      : titleCase(stripNumPrefix(base.replace(/\.md$/i, '')));
    return { title, body };
  }

  // ---- clock helpers ----

  private now(): string {
    return this.clock.now().toISOString();
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------------
// Pure parsing helpers
// ---------------------------------------------------------------------------

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

function docCompare(a: DocNode, b: DocNode): number {
  const pa = numPrefix(a.name);
  const pb = numPrefix(b.name);
  const aPrefixed = pa !== undefined;
  const bPrefixed = pb !== undefined;
  if (aPrefixed && bPrefixed) {
    if (pa !== pb) {
      return (pa as number) - (pb as number);
    }
    return a.name.localeCompare(b.name);
  }
  if (aPrefixed) {
    return -1;
  }
  if (bPrefixed) {
    return 1;
  }
  return a.name.localeCompare(b.name);
}

function parseCard(fileName: string, content: string): CardEntry | undefined {
  const { data, body } = parseFrontmatter(content);
  const slug = stripNumPrefix(fileName.replace(/\.md$/i, ''));
  const headingMatch = /^#\s+(.+)$/m.exec(body);
  const title = headingMatch ? headingMatch[1].trim() : titleCase(slug);

  const card: Card = { id: slug, title };

  const desc = extractDescription(body);
  if (desc) {
    card.desc = desc;
  }
  const { items } = findChecklist(body);
  if (items.length) {
    card.checklist = items;
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
  const files = asStringArray(data.files);
  if (files && files.length) {
    card.files = files;
  }
  const comments = asNumber(data.comments);
  if (comments !== undefined) {
    card.comments = comments;
  }
  const updatedAt = asString(data.updatedAt);
  if (updatedAt) {
    card.updatedAt = updatedAt;
  }

  return {
    fileName,
    slug,
    num: numPrefix(fileName),
    column: asString(data.column) ?? '',
    card,
  };
}

/** Body text between the title heading and the `## Checklist` heading. */
function extractDescription(body: string): string {
  const lines = body.split('\n');
  const headingIdx = lines.findIndex((l) => /^#\s+/.test(l));
  const start = headingIdx === -1 ? 0 : headingIdx + 1;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+checklist\s*$/i.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/** Task-list items under `## Checklist`, with their body line indices. */
function findChecklist(body: string): { items: ChecklistItem[]; indices: number[] } {
  const lines = body.split('\n');
  const items: ChecklistItem[] = [];
  const indices: number[] = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+checklist\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,6}\s+/.test(line)) {
      break; // next heading ends the section
    }
    if (inSection) {
      const m = /^\s*-\s+\[([ xX])\]\s+(.*)$/.exec(line);
      if (m) {
        items.push({ text: m[2].trim(), done: m[1].toLowerCase() === 'x' });
        indices.push(i);
      }
    }
  }
  return { items, indices };
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

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedBoardConfig(): BoardConfig {
  return {
    name: 'Project Backlog',
    columns: defaultColumns(),
    labels: { ...DEFAULT_LABELS },
    agents: { ...DEFAULT_AGENTS },
  };
}

function seedCards(stamp: string): Array<{ name: string; content: string }> {
  return [
    {
      name: '01-try-dragging-this-card.md',
      content:
        `---\ncolumn: backlog\nlabels: [docs]\npriority: low\nupdatedAt: ${stamp}\n---\n` +
        `# Try dragging this card to another column\n\n` +
        `Cards live as markdown files under \`boards/project-backlog/\`. Drag one across ` +
        `columns and watch its file get renumbered on disk.\n`,
    },
    {
      name: '02-add-a-card-or-let-an-agent.md',
      content:
        `---\ncolumn: backlog\nlabels: [frontend]\npriority: med\nupdatedAt: ${stamp}\n---\n` +
        `# Add a card with the + button, or let an agent add one\n\n` +
        `Every card is plain markdown with a little frontmatter. Humans and coding agents ` +
        `edit the same board.\n`,
    },
    {
      name: '03-write-your-first-decision.md',
      content:
        `---\ncolumn: todo\nlabels: [docs]\npriority: med\ncomments: 2\nupdatedAt: ${stamp}\n---\n` +
        `# Write your first decision record\n\n` +
        `Decision records capture the *why* behind architectural choices, numbered under ` +
        `\`decisions/\`.\n\n` +
        `## Checklist\n\n` +
        `- [x] Open the Decisions view\n` +
        `- [ ] Create the next decision\n` +
        `- [ ] Fill in Context and Decision\n`,
    },
    {
      name: '04-assign-a-card-to-an-agent.md',
      content:
        `---\ncolumn: doing\nlabels: [backend, infra]\npriority: high\nagent: claude\n` +
        `live: true\nstatus: editing src/core/store.ts\nprogress: 62\n` +
        `files: [src/core/store.ts]\ncomments: 3\nupdatedAt: ${stamp}\n---\n` +
        `# Assign a card to a coding agent\n\n` +
        `Agents pick up assigned cards, report live status, and list the files they touch.\n\n` +
        `## Checklist\n\n` +
        `- [x] Assign the card\n` +
        `- [x] Agent starts working\n` +
        `- [ ] Review the result\n`,
    },
    {
      name: '05-review-before-done.md',
      content:
        `---\ncolumn: review\nlabels: [perf]\npriority: med\nupdatedAt: ${stamp}\n---\n` +
        `# Review changes before moving a card to Done\n\n` +
        `Cards flow left to right. Keep a review step so work is checked before it lands.\n`,
    },
    {
      name: '06-initialize-repodoc.md',
      content:
        `---\ncolumn: done\nlabels: [infra]\npriority: low\nupdatedAt: ${stamp}\n---\n` +
        `# Initialize RepoDoc in your repo\n\n` +
        `Done — this board, a starter decision, and a docs page were seeded for you.\n\n` +
        `## Checklist\n\n` +
        `- [x] Create the boards/ folder\n`,
    },
  ];
}

function seedDecision(date: string): string {
  return (
    `# Decision 0001 — Record architecture decisions\n\n` +
    `**Status:** Accepted &nbsp;·&nbsp; **Date:** ${date}\n\n` +
    `## Context\n\n` +
    `We make architecturally significant decisions on this project regularly, but the ` +
    `reasoning tends to live in scattered chat threads and pull-request comments. New ` +
    `contributors — human and agent alike — have no single place to understand *why* the ` +
    `system is shaped the way it is.\n\n` +
    `## Decision\n\n` +
    `We will keep a collection of **Architecture Decision Records**. An ADR is a short ` +
    `markdown file describing one decision, its context, and its consequences.\n\n` +
    `- Records live in \`decisions/\` and are numbered sequentially.\n` +
    `- Each record is immutable once **Accepted** — we supersede rather than edit.\n` +
    `- Agents are instructed to read relevant decisions before starting related work.\n\n` +
    `## Consequences\n\n` +
    `- The reasoning behind decisions becomes durable and searchable.\n` +
    `- There is a small ongoing cost to writing a record for each significant decision.\n` +
    `- Superseded records stay in history, giving a timeline of how thinking evolved.\n`
  );
}

function seedIntroDoc(): string {
  return (
    `# Introduction\n\n` +
    `Welcome to your project's documentation. This tree is rendered from the markdown ` +
    `files living under \`docs/\`.\n\n` +
    `> Add a folder, drop in a \`NN-slug.md\` file, and it shows up in the sidebar.\n\n` +
    `## How it works\n\n` +
    `- Folders become collapsible sections in the Docs view.\n` +
    `- A leading \`NN-\` number orders pages; the label drops the number.\n` +
    `- Each \`.md\` file is a page; its first \`# heading\` becomes the label.\n\n` +
    `Edit this file or add your own to make the docs your own.\n`
  );
}
