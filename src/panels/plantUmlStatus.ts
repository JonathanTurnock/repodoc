import * as vscode from 'vscode';
import { MarkdownPanel } from './markdownPanel';

/**
 * A status-bar indicator for the managed PlantUML Docker renderer. Shown only
 * while `repodoc.plantUmlRenderer` is `docker`; clicking it opens a small
 * management menu (start / stop / restart / settings) with the live state.
 */
export class PlantUmlStatus implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'repodoc.plantuml',
      vscode.StatusBarAlignment.Right,
      90,
    );
    this.item.name = 'RepoDoc PlantUML';
    this.item.command = 'repodoc.plantUmlMenu';
  }

  /** Re-evaluates visibility and state; called on activation, config changes,
   * after lifecycle actions, and every 15s while visible. */
  async refresh(): Promise<void> {
    const config = vscode.workspace.getConfiguration('repodoc');
    if (config.get<string>('plantUmlRenderer') !== 'docker') {
      this.item.hide();
      this.stopTimer();
      return;
    }
    const docker = MarkdownPanel.plantUmlDocker();
    if (!(await docker.dockerAvailable())) {
      this.item.text = '$(error) PlantUML';
      this.item.tooltip = 'RepoDoc: Docker is not available — the PlantUML renderer cannot run.';
    } else if (await docker.isRunning()) {
      this.item.text = '$(pass-filled) PlantUML';
      this.item.tooltip = `RepoDoc: PlantUML renderer running at ${docker.localUrl()} — click to manage.`;
    } else {
      this.item.text = '$(circle-slash) PlantUML';
      this.item.tooltip = 'RepoDoc: PlantUML renderer stopped — click to manage.';
    }
    this.item.show();
    this.startTimer();
  }

  /** The click menu: state line + the actions valid for the current state. */
  async menu(): Promise<void> {
    const docker = MarkdownPanel.plantUmlDocker();
    const available = await docker.dockerAvailable();
    const running = available && (await docker.isRunning());

    type Item = vscode.QuickPickItem & { action: 'start' | 'stop' | 'restart' | 'settings' };
    const items: Item[] = [];
    if (available && !running) {
      items.push({ label: '$(play) Start', description: 'launch the local renderer', action: 'start' });
    }
    if (running) {
      items.push({ label: '$(refresh) Restart', description: 'reload the container', action: 'restart' });
      items.push({ label: '$(debug-stop) Stop', description: 'stop and remove the container', action: 'stop' });
    }
    items.push({ label: '$(gear) PlantUML settings', description: 'renderer, image, port', action: 'settings' });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: !available
        ? 'Docker is not available'
        : running
          ? `Running at ${docker.localUrl()}`
          : 'Stopped',
      title: 'RepoDoc PlantUML renderer',
    });
    if (!picked) {
      return;
    }
    if (picked.action === 'settings') {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'repodoc.plantUml');
      return;
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `PlantUML: ${picked.action}…` },
      async () => {
        if (picked.action === 'stop' || picked.action === 'restart') {
          await docker.stop();
        }
        if (picked.action === 'start' || picked.action === 'restart') {
          await docker.ensureStarted();
        }
      },
    );
    MarkdownPanel.refreshAll();
    await this.refresh();
  }

  private startTimer(): void {
    this.timer ??= setInterval(() => {
      void this.refresh();
    }, 15000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.stopTimer();
    this.item.dispose();
  }
}
