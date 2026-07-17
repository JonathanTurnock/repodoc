import * as vscode from 'vscode';
import { RepoDocStore } from './core/store';
import { NodeFileSystemAdapter } from './adapters/nodeFileSystem';
import { MemFileSystemAdapter } from './adapters/memFileSystem';
import { SystemClock } from './adapters/systemClock';
import { BoardsTreeProvider, DecisionsTreeProvider, DocsTreeProvider } from './trees';
import { BoardPanel } from './panels/boardPanel';
import { MarkdownPanel } from './panels/markdownPanel';

/** Public surface returned by {@link activate}, used by e2e tests. */
export interface RepoDocApi {
  store: RepoDocStore;
}

export function activate(context: vscode.ExtensionContext): RepoDocApi {
  const folders = vscode.workspace.workspaceFolders;
  const root = folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
  const fileSystem = root ? new NodeFileSystemAdapter(root) : new MemFileSystemAdapter();
  const store = new RepoDocStore(fileSystem, new SystemClock(), root);

  if (root) {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const scheduleChange = (): void => {
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(() => {
        debounce = undefined;
        store.notifyExternalChange();
      }, 150);
    };
    for (const pattern of ['**/boards/**', '**/decisions/**', '**/docs/**']) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(root, pattern),
      );
      watcher.onDidChange(scheduleChange);
      watcher.onDidCreate(scheduleChange);
      watcher.onDidDelete(scheduleChange);
      context.subscriptions.push(watcher);
    }
    context.subscriptions.push({
      dispose: () => {
        if (debounce) {
          clearTimeout(debounce);
        }
      },
    });
  }

  const boardsTree = new BoardsTreeProvider(store);
  const decisionsTree = new DecisionsTreeProvider(store);
  const docsTree = new DocsTreeProvider(store);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('repodoc.boards', boardsTree),
    vscode.window.registerTreeDataProvider('repodoc.decisions', decisionsTree),
    vscode.window.registerTreeDataProvider('repodoc.docs', docsTree),
  );

  const updateInitializedContext = (): void => {
    void vscode.commands.executeCommand('setContext', 'repodoc.initialized', store.isInitialized());
  };
  updateInitializedContext();

  const refreshTrees = (): void => {
    boardsTree.refresh();
    decisionsTree.refresh();
    docsTree.refresh();
  };

  context.subscriptions.push(
    store.onDidChange(() => {
      updateInitializedContext();
      refreshTrees();
      BoardPanel.refreshAll();
      MarkdownPanel.refreshAll();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('repodoc.init', () => {
      if (!root) {
        void vscode.window.showWarningMessage(
          'RepoDoc: open a folder first — there is no workspace to initialize.',
        );
        return;
      }
      store.init();
      updateInitializedContext();
      refreshTrees();
      void vscode.window.showInformationMessage('RepoDoc initialized in this workspace.');
    }),

    vscode.commands.registerCommand('repodoc.refresh', () => {
      refreshTrees();
    }),

    vscode.commands.registerCommand('repodoc.openBoard', (boardId: string) => {
      BoardPanel.createOrShow(context.extensionUri, store, boardId);
    }),

    // Internal (not contributed to the palette): open a card's detail modal in
    // an already-open board panel. Used by automation and the demo driver.
    vscode.commands.registerCommand(
      'repodoc.openCard',
      (boardId: unknown, cardId: unknown): boolean => {
        if (typeof boardId !== 'string' || typeof cardId !== 'string') {
          return false;
        }
        return BoardPanel.postOpenCard(boardId, cardId);
      },
    ),

    vscode.commands.registerCommand('repodoc.openDecision', (id: string) => {
      MarkdownPanel.showDecision(context.extensionUri, store, id);
    }),

    vscode.commands.registerCommand('repodoc.openDoc', (relPath: unknown) => {
      if (typeof relPath === 'string' && relPath.length > 0) {
        MarkdownPanel.showDoc(context.extensionUri, store, relPath);
      }
    }),

    vscode.commands.registerCommand('repodoc.newBoard', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Board name',
        placeHolder: 'e.g. Sprint 24',
      });
      if (!name || !name.trim()) {
        return;
      }
      const id = store.createBoard(name.trim());
      BoardPanel.createOrShow(context.extensionUri, store, id);
    }),

    vscode.commands.registerCommand('repodoc.newDecision', async () => {
      const title = await vscode.window.showInputBox({
        prompt: 'Decision title',
        placeHolder: 'e.g. Use PostgreSQL as the primary datastore',
      });
      if (!title || !title.trim()) {
        return;
      }
      const id = store.createDecision(title.trim());
      if (id) {
        MarkdownPanel.showDecision(context.extensionUri, store, id);
      }
    }),
  );

  return { store };
}

export function deactivate(): void {}
