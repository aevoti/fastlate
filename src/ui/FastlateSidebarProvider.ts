import * as vscode from 'vscode';
import { ConfigurationService } from '../services/ConfigurationService';
import { TokenStorageService } from '../services/TokenStorageService';
import { currentHtmlLang, t } from '../i18n';

type SidebarMessage = {
  command?: string;
};

type ConfigurationStatus = {
  ready: boolean;
  serverUrl: boolean;
  authToken: boolean;
  project: boolean;
  component: boolean;
  defaultLanguage: boolean;
};

function isPresent(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Sidebar webview that makes Fastlate discoverable from the VSCode Activity Bar.
 */
export class FastlateSidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  constructor(private readonly tokenStorage: TokenStorageService) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    void this.refresh();

    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      void this.handleMessage(message);
    });
  }

  async refresh(): Promise<void> {
    if (this.view) {
      this.view.webview.html = await this.buildHtml();
    }
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    if (message.command === 'import') {
      await vscode.commands.executeCommand('fastlate.importTranslations');
      return;
    }

    if (message.command === 'settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'fastlate');
      return;
    }

    if (message.command === 'configure-token') {
      await vscode.commands.executeCommand('fastlate.configureToken');
      return;
    }

    if (message.command === 'remove-token') {
      await vscode.commands.executeCommand('fastlate.removeToken');
    }
  }

  private async getConfigurationStatus(): Promise<ConfigurationStatus> {
    const tokenConfigured = await this.tokenStorage.hasToken();
    const result = new ConfigurationService().readConfiguration(
      tokenConfigured ? 'configured-token' : undefined,
    );

    if (result.ok) {
      return {
        ready: true,
        serverUrl: true,
        authToken: true,
        project: true,
        component: true,
        defaultLanguage: true,
      };
    }

    const scopedConfig = vscode.workspace.getConfiguration('fastlate');
    const rootConfig = vscode.workspace.getConfiguration();
    const hasValue = (field: string): boolean => {
      const scopedValue = scopedConfig.get<string>(field);
      if (isPresent(scopedValue)) {
        return true;
      }

      return isPresent(rootConfig.get<string>(`fastlate.${field}`));
    };

    return {
      ready: false,
      serverUrl: hasValue('serverUrl'),
      authToken: tokenConfigured,
      project: hasValue('project'),
      component: hasValue('component'),
      defaultLanguage: hasValue('defaultLanguage'),
    };
  }

  private async buildHtml(): Promise<string> {
    const status = await this.getConfigurationStatus();
    const nonce = this.createNonce();

    return `<!DOCTYPE html>
<html lang="${currentHtmlLang()}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>Fastlate</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0;
      padding: 14px;
    }

    h1 {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 12px;
    }

    .status {
      border: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 12px;
      background: var(--vscode-sideBarSectionHeader-background);
    }

    .status strong {
      display: block;
      margin-bottom: 4px;
    }

    .muted {
      color: var(--vscode-descriptionForeground);
      margin: 0;
    }

    .fields {
      display: grid;
      gap: 7px;
      margin: 12px 0;
    }

    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .field span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 11px;
      white-space: nowrap;
    }

    .ok {
      color: var(--vscode-testing-iconPassed);
      background: color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent);
    }

    .missing {
      color: var(--vscode-testing-iconFailed);
      background: color-mix(in srgb, var(--vscode-testing-iconFailed) 12%, transparent);
    }

    .actions {
      display: grid;
      gap: 8px;
    }

    button {
      width: 100%;
      min-height: 30px;
      border: 0;
      border-radius: 3px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
    }

    #btn-import, #btn-token {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    #btn-import:hover, #btn-token:hover {
      background: var(--vscode-button-hoverBackground);
    }

    #btn-settings, #btn-remove-token {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }

    #btn-settings:hover, #btn-remove-token:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <h1>Fastlate</h1>
  <section class="status" aria-label="Estado da configuração">
    <strong>${status.ready ? t('sidebar.readyTitle') : t('sidebar.incompleteTitle')}</strong>
    <p class="muted">${status.ready ? t('sidebar.readyDescription') : t('sidebar.incompleteDescription')}</p>
  </section>

  <div class="fields">
    ${this.renderField(t('sidebar.server'), status.serverUrl)}
    ${this.renderField(t('sidebar.secureToken'), status.authToken)}
    ${this.renderField(t('sidebar.project'), status.project)}
    ${this.renderField(t('sidebar.component'), status.component)}
    ${this.renderField(t('sidebar.defaultLanguage'), status.defaultLanguage)}
  </div>

  <div class="actions">
    <button id="btn-import">${t('sidebar.importCsv')}</button>
    <button id="btn-token">${t('sidebar.configureToken')}</button>
    <button id="btn-remove-token">${t('sidebar.removeToken')}</button>
    <button id="btn-settings">${t('sidebar.openSettings')}</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('btn-import').addEventListener('click', function () {
      vscode.postMessage({ command: 'import' });
    });
    document.getElementById('btn-token').addEventListener('click', function () {
      vscode.postMessage({ command: 'configure-token' });
    });
    document.getElementById('btn-remove-token').addEventListener('click', function () {
      vscode.postMessage({ command: 'remove-token' });
    });
    document.getElementById('btn-settings').addEventListener('click', function () {
      vscode.postMessage({ command: 'settings' });
    });
  </script>
</body>
</html>`;
  }

  private renderField(label: string, configured: boolean): string {
    return `<div class="field">
      <span>${label}</span>
      <span class="badge ${configured ? 'ok' : 'missing'}">${configured ? t('sidebar.ok') : t('sidebar.missing')}</span>
    </div>`;
  }

  private createNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';

    for (let i = 0; i < 32; i += 1) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return text;
  }
}
