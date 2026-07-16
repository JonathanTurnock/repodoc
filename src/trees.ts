import * as vscode from 'vscode';
import { RepoDocStore } from './store';
import { BoardRef, DecisionRecord, DocNode } from './types';

export class BoardsTreeProvider implements vscode.TreeDataProvider<BoardRef> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  constructor(private readonly store: RepoDocStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(ref: BoardRef): vscode.TreeItem {
    const item = new vscode.TreeItem(ref.name, vscode.TreeItemCollapsibleState.None);
    item.description = String(ref.cardCount);
    item.iconPath = new vscode.ThemeIcon('project');
    item.contextValue = 'repodoc.board';
    item.command = {
      command: 'repodoc.openBoard',
      title: 'Open Board',
      arguments: [ref.id],
    };
    return item;
  }

  getChildren(element?: BoardRef): BoardRef[] {
    if (element) {
      return [];
    }
    return this.store.listBoards();
  }
}

export class DecisionsTreeProvider implements vscode.TreeDataProvider<DecisionRecord> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  constructor(private readonly store: RepoDocStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(record: DecisionRecord): vscode.TreeItem {
    const item = new vscode.TreeItem(record.title, vscode.TreeItemCollapsibleState.None);
    item.description = record.num;
    item.tooltip = record.file;
    item.contextValue = 'repodoc.decision';
    item.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(statusColor(record.status)));
    item.command = {
      command: 'repodoc.openDecision',
      title: 'Open Decision',
      arguments: [record.id],
    };
    return item;
  }

  getChildren(element?: DecisionRecord): DecisionRecord[] {
    if (element) {
      return [];
    }
    return this.store.listDecisions();
  }
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'accepted':
      return 'charts.green';
    case 'proposed':
      return 'charts.yellow';
    case 'superseded':
      return 'charts.lines';
    default:
      return 'charts.lines';
  }
}

export class DocsTreeProvider implements vscode.TreeDataProvider<DocNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

  constructor(private readonly store: RepoDocStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(node: DocNode): vscode.TreeItem {
    if (node.type === 'dir') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.tooltip = node.relPath;
      item.contextValue = 'repodoc.docDir';
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    }
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.tooltip = node.relPath;
    item.contextValue = 'repodoc.docFile';
    item.iconPath = new vscode.ThemeIcon('markdown');
    item.command = {
      command: 'repodoc.openDoc',
      title: 'Open Doc',
      arguments: [node.relPath],
    };
    return item;
  }

  getChildren(element?: DocNode): DocNode[] {
    if (!element) {
      return this.store.getDocsTree();
    }
    if (element.type === 'dir' && element.children) {
      return element.children;
    }
    return [];
  }
}
