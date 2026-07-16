import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  RepoDocConfig,
  BoardData,
  BoardRef,
  Column,
  Card,
  DecisionRecord,
  DocNode,
} from './types';

/** Built-in configuration used when `.repodoc/config.json` is missing or invalid. */
const DEFAULT_CONFIG: RepoDocConfig = {
  labels: {
    backend: { name: 'backend', color: '#3fb27f' },
    frontend: { name: 'frontend', color: '#4c8bf5' },
    bug: { name: 'bug', color: '#e5534b' },
    infra: { name: 'infra', color: '#d99a30' },
    docs: { name: 'docs', color: '#9a7bd6' },
    perf: { name: 'perf', color: '#c9a227' },
  },
  agents: {
    claude: { name: 'Claude', color: '#d97757', initials: 'CL' },
    cursor: { name: 'Cursor', color: '#4c8bf5', initials: 'CU' },
    copilot: { name: 'Copilot', color: '#a371f7', initials: 'CP' },
  },
};

/** The 5 default board columns, matching the design mock. */
function defaultColumns(): Column[] {
  return [
    { id: 'backlog', name: 'Backlog', color: '#7d828b', cardIds: [] },
    { id: 'todo', name: 'To Do', color: '#4c8bf5', cardIds: [] },
    { id: 'doing', name: 'In Progress', color: '#5cd68a', wip: 3, cardIds: [] },
    { id: 'review', name: 'In Review', color: '#d99a30', cardIds: [] },
    { id: 'done', name: 'Done', color: '#3fb27f', cardIds: [] },
  ];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

function titleCase(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function nowIso(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function newCardId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export class RepoDocStore implements vscode.Disposable {
  readonly root: string | undefined;
  readonly dataDirName = '.repodoc';

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(_context: vscode.ExtensionContext) {
    const folders = vscode.workspace.workspaceFolders;
    this.root = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;

    if (this.root) {
      const patterns = ['**/.repodoc/**', 'docs/**'];
      for (const pattern of patterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(this.root, pattern),
        );
        watcher.onDidChange(() => this.scheduleChange());
        watcher.onDidCreate(() => this.scheduleChange());
        watcher.onDidDelete(() => this.scheduleChange());
        this.watchers.push(watcher);
      }
    }
  }

  private scheduleChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this._onDidChange.fire();
    }, 150);
  }

  private fire(): void {
    this._onDidChange.fire();
  }

  // ---- path helpers ----

  private dataDir(): string | undefined {
    return this.root ? path.join(this.root, this.dataDirName) : undefined;
  }

  private boardsDir(): string | undefined {
    const d = this.dataDir();
    return d ? path.join(d, 'boards') : undefined;
  }

  private decisionsDir(): string | undefined {
    const d = this.dataDir();
    return d ? path.join(d, 'decisions') : undefined;
  }

  private docsDir(): string | undefined {
    return this.root ? path.join(this.root, 'docs') : undefined;
  }

  private configPath(): string | undefined {
    const d = this.dataDir();
    return d ? path.join(d, 'config.json') : undefined;
  }

  private boardPath(id: string): string | undefined {
    const d = this.boardsDir();
    return d ? path.join(d, `${id}.json`) : undefined;
  }

  private writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  }

  // ---- lifecycle ----

  isInitialized(): boolean {
    const d = this.dataDir();
    return !!d && fs.existsSync(d) && fs.statSync(d).isDirectory();
  }

  async init(): Promise<void> {
    const dataDir = this.dataDir();
    const boardsDir = this.boardsDir();
    const decisionsDir = this.decisionsDir();
    if (!dataDir || !boardsDir || !decisionsDir || !this.root) {
      return;
    }

    fs.mkdirSync(boardsDir, { recursive: true });
    fs.mkdirSync(decisionsDir, { recursive: true });

    const configPath = this.configPath();
    if (configPath && !fs.existsSync(configPath)) {
      this.writeJson(configPath, DEFAULT_CONFIG);
    }

    const boardPath = this.boardPath('project-backlog');
    if (boardPath && !fs.existsSync(boardPath)) {
      this.writeJson(boardPath, seedBoard());
    }

    const adrPath = path.join(decisionsDir, '0001-record-architecture-decisions.md');
    if (!fs.existsSync(adrPath)) {
      fs.writeFileSync(adrPath, seedDecision(), 'utf8');
    }

    const docsDir = this.docsDir();
    if (docsDir && !fs.existsSync(docsDir)) {
      const introPath = path.join(docsDir, 'getting-started', 'introduction.md');
      fs.mkdirSync(path.dirname(introPath), { recursive: true });
      fs.writeFileSync(introPath, seedIntroDoc(), 'utf8');
    }

    this.fire();
  }

  // ---- config ----

  getConfig(): RepoDocConfig {
    const configPath = this.configPath();
    if (configPath && fs.existsSync(configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<RepoDocConfig>;
        if (parsed && typeof parsed === 'object' && parsed.labels && parsed.agents) {
          return { labels: parsed.labels, agents: parsed.agents };
        }
      } catch {
        // fall through to defaults
      }
    }
    return DEFAULT_CONFIG;
  }

  // ---- boards ----

  listBoards(): BoardRef[] {
    const dir = this.boardsDir();
    if (!dir || !fs.existsSync(dir)) {
      return [];
    }
    const refs: BoardRef[] = [];
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.json') || entry.startsWith('.')) {
        continue;
      }
      const id = entry.slice(0, -'.json'.length);
      const board = this.getBoard(id);
      if (board) {
        refs.push({ id, name: board.name, cardCount: Object.keys(board.cards).length });
      }
    }
    refs.sort((a, b) => a.name.localeCompare(b.name));
    return refs;
  }

  getBoard(id: string): BoardData | undefined {
    const p = this.boardPath(id);
    if (!p || !fs.existsSync(p)) {
      return undefined;
    }
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as BoardData;
    } catch {
      return undefined;
    }
  }

  private saveBoard(id: string, board: BoardData): void {
    const p = this.boardPath(id);
    if (!p) {
      return;
    }
    this.writeJson(p, board);
    this.fire();
  }

  createBoard(name: string): string {
    const id = slugify(name);
    const board: BoardData = {
      name: name.trim() || 'Untitled Board',
      columns: defaultColumns(),
      cards: {},
    };
    this.saveBoard(id, board);
    return id;
  }

  addCard(boardId: string, columnId: string, title: string): void {
    const board = this.getBoard(boardId);
    if (!board) {
      return;
    }
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) {
      return;
    }
    const id = newCardId();
    const card: Card = { id, title: title.trim(), updatedAt: nowIso() };
    board.cards[id] = card;
    column.cardIds.push(id);
    this.saveBoard(boardId, board);
  }

  addColumn(boardId: string, name: string): void {
    const board = this.getBoard(boardId);
    if (!board) {
      return;
    }
    const column: Column = {
      id: slugify(name),
      name: name.trim(),
      color: '#7d828b',
      cardIds: [],
    };
    board.columns.push(column);
    this.saveBoard(boardId, board);
  }

  moveCard(boardId: string, cardId: string, toColumnId: string, index: number): void {
    const board = this.getBoard(boardId);
    if (!board || !board.cards[cardId]) {
      return;
    }
    const target = board.columns.find((c) => c.id === toColumnId);
    if (!target) {
      return;
    }
    // Remove the card from wherever it currently lives.
    for (const col of board.columns) {
      const i = col.cardIds.indexOf(cardId);
      if (i > -1) {
        col.cardIds.splice(i, 1);
      }
    }
    // Index counts positions among the target's cards excluding the moved card,
    // which has already been removed above.
    const clamped = Math.max(0, Math.min(index, target.cardIds.length));
    target.cardIds.splice(clamped, 0, cardId);
    board.cards[cardId].updatedAt = nowIso();
    this.saveBoard(boardId, board);
  }

  toggleChecklistItem(boardId: string, cardId: string, itemIndex: number): void {
    const board = this.getBoard(boardId);
    if (!board) {
      return;
    }
    const card = board.cards[cardId];
    if (!card || !card.checklist || itemIndex < 0 || itemIndex >= card.checklist.length) {
      return;
    }
    card.checklist[itemIndex].done = !card.checklist[itemIndex].done;
    if (card.subtasks) {
      const done = card.checklist.filter((c) => c.done).length;
      card.subtasks = { done, total: card.checklist.length };
    }
    card.updatedAt = nowIso();
    this.saveBoard(boardId, board);
  }

  // ---- decisions ----

  listDecisions(): DecisionRecord[] {
    const dir = this.decisionsDir();
    if (!dir || !fs.existsSync(dir)) {
      return [];
    }
    const records: DecisionRecord[] = [];
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.md') || entry.startsWith('.')) {
        continue;
      }
      const record = this.parseDecision(dir, entry);
      if (record) {
        records.push(record);
      }
    }
    records.sort((a, b) => a.num.localeCompare(b.num));
    return records;
  }

  getDecision(id: string): DecisionRecord | undefined {
    return this.listDecisions().find((d) => d.id === id);
  }

  private parseDecision(dir: string, file: string): DecisionRecord | undefined {
    const full = path.join(dir, file);
    let body: string;
    try {
      body = fs.readFileSync(full, 'utf8');
    } catch {
      return undefined;
    }
    const id = file.slice(0, -'.md'.length);
    const numMatch = /^(\d+)/.exec(file);
    const num = numMatch ? numMatch[1] : '0000';

    const headingMatch = /^#\s+(.+)$/m.exec(body);
    let title = headingMatch ? headingMatch[1].trim() : titleCase(id.replace(/^\d+-?/, ''));
    title = title.replace(/^(?:Decision\s+\d+|ADR-?\d+)\s*[—–-]\s*/i, '').trim();

    const statusMatch = /\*\*Status:\*\*\s*([A-Za-z]+)/.exec(body);
    const status = statusMatch ? statusMatch[1] : 'Proposed';

    return { id, num, file, title, status, body };
  }

  createDecision(title: string): string {
    const dir = this.decisionsDir();
    if (!dir) {
      return '';
    }
    fs.mkdirSync(dir, { recursive: true });
    const existing = this.listDecisions();
    const maxNum = existing.reduce((max, d) => Math.max(max, parseInt(d.num, 10) || 0), 0);
    const num = String(maxNum + 1).padStart(4, '0');
    const cleanTitle = title.trim() || 'Untitled decision';
    const id = `${num}-${slugify(cleanTitle)}`;
    const file = `${id}.md`;
    const body =
      `# Decision ${num} — ${cleanTitle}\n\n` +
      `**Status:** Proposed &nbsp;·&nbsp; **Date:** ${today()}\n\n` +
      `## Context\n\n` +
      `_What is the issue that motivates this decision?_\n\n` +
      `## Decision\n\n` +
      `_What is the change that we're proposing or doing?_\n\n` +
      `## Consequences\n\n` +
      `_What becomes easier or harder because of this change?_\n`;
    fs.writeFileSync(path.join(dir, file), body, 'utf8');
    this.fire();
    return id;
  }

  // ---- docs ----

  getDocsTree(): DocNode[] {
    const dir = this.docsDir();
    if (!dir || !fs.existsSync(dir) || !this.root) {
      return [];
    }
    return this.walkDocs(dir);
  }

  private walkDocs(dir: string): DocNode[] {
    const root = this.root;
    if (!root) {
      return [];
    }
    const dirs: DocNode[] = [];
    const files: DocNode[] = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }
      const abs = path.join(dir, entry.name);
      const relPath = path.relative(root, abs).split(path.sep).join('/');

      if (entry.isDirectory()) {
        dirs.push({
          type: 'dir',
          name: entry.name,
          label: titleCase(entry.name),
          relPath,
          children: this.walkDocs(abs),
        });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push({
          type: 'file',
          name: entry.name,
          label: this.docLabel(abs, entry.name),
          relPath,
        });
      }
    }

    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...dirs, ...files];
  }

  private docLabel(abs: string, fileName: string): string {
    try {
      const content = fs.readFileSync(abs, 'utf8');
      const headingMatch = /^#\s+(.+)$/m.exec(content);
      if (headingMatch) {
        return headingMatch[1].trim();
      }
    } catch {
      // fall through to name-based label
    }
    return titleCase(fileName.replace(/\.md$/i, ''));
  }

  readDoc(relPath: string): { title: string; body: string } | undefined {
    if (!this.root) {
      return undefined;
    }
    const abs = path.resolve(this.root, relPath);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (abs !== this.root && !abs.startsWith(rootWithSep)) {
      return undefined;
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return undefined;
    }
    const body = fs.readFileSync(abs, 'utf8');
    const headingMatch = /^#\s+(.+)$/m.exec(body);
    const title = headingMatch
      ? headingMatch[1].trim()
      : titleCase(path.basename(abs).replace(/\.md$/i, ''));
    return { title, body };
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this._onDidChange.dispose();
  }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedBoard(): BoardData {
  const stamp = nowIso();
  const cards: Record<string, Card> = {
    'seed-drag': {
      id: 'seed-drag',
      title: 'Try dragging this card to another column',
      labels: ['docs'],
      priority: 'low',
      desc: 'Cards live as JSON in .repodoc/boards/. Drag one across columns and watch the file update on disk.',
      updatedAt: stamp,
    },
    'seed-add': {
      id: 'seed-add',
      title: 'Add a card with the + button, or let an agent add one',
      labels: ['frontend'],
      priority: 'med',
      desc: 'Every card is plain data. Humans and coding agents edit the same board.',
      updatedAt: stamp,
    },
    'seed-decision': {
      id: 'seed-decision',
      title: 'Write your first decision record',
      labels: ['docs'],
      priority: 'med',
      comments: 2,
      subtasks: { done: 1, total: 3 },
      checklist: [
        { text: 'Open the Decisions view', done: true },
        { text: 'Create decision 0002', done: false },
        { text: 'Fill in Context and Decision', done: false },
      ],
      desc: 'Decision records capture the why behind architectural choices, numbered under .repodoc/decisions/.',
      updatedAt: stamp,
    },
    'seed-agent': {
      id: 'seed-agent',
      title: 'Assign a card to a coding agent',
      labels: ['backend'],
      priority: 'high',
      agent: 'claude',
      files: ['.repodoc/boards/project-backlog.json', 'src/store.ts'],
      comments: 3,
      desc: 'Agents pick up assigned cards, report live status, and update the files they touch.',
      updatedAt: stamp,
    },
    'seed-review': {
      id: 'seed-review',
      title: 'Review changes before moving a card to Done',
      labels: ['perf'],
      priority: 'med',
      desc: 'Cards flow left to right. Keep a review step so work is checked before it lands.',
      updatedAt: stamp,
    },
    'seed-init': {
      id: 'seed-init',
      title: 'Initialize RepoDoc in your repo',
      labels: ['infra'],
      priority: 'low',
      subtasks: { done: 1, total: 1 },
      checklist: [{ text: 'Create the .repodoc folder', done: true }],
      desc: 'Done — this board, a starter decision, and a docs page were seeded for you.',
      updatedAt: stamp,
    },
  };

  const columns = defaultColumns();
  columns[0].cardIds = ['seed-drag', 'seed-add'];
  columns[1].cardIds = ['seed-decision'];
  columns[2].cardIds = ['seed-agent'];
  columns[3].cardIds = ['seed-review'];
  columns[4].cardIds = ['seed-init'];

  return { name: 'Project Backlog', columns, cards };
}

function seedDecision(): string {
  return (
    `# Decision 0001 — Record architecture decisions\n\n` +
    `**Status:** Accepted &nbsp;·&nbsp; **Date:** ${today()}\n\n` +
    `## Context\n\n` +
    `We make architecturally significant decisions on this project regularly, but the ` +
    `reasoning tends to live in scattered chat threads and pull-request comments. New ` +
    `contributors — human and agent alike — have no single place to understand *why* the ` +
    `system is shaped the way it is.\n\n` +
    `## Decision\n\n` +
    `We will keep a collection of **Architecture Decision Records**. An ADR is a short ` +
    `markdown file describing one decision, its context, and its consequences.\n\n` +
    `- Records live in \`.repodoc/decisions/\` and are numbered sequentially.\n` +
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
    `> Add a folder, drop in a \`.md\` file, and it shows up in the sidebar.\n\n` +
    `## How it works\n\n` +
    `- Folders become collapsible sections in the Docs view.\n` +
    `- Each \`.md\` file is a page; its first \`# heading\` becomes the label.\n` +
    `- Pages are plain markdown, so they read just as well in your editor.\n\n` +
    `Edit this file or add your own to make the docs your own.\n`
  );
}
