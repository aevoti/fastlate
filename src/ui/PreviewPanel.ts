import * as vscode from 'vscode';
import { LanguageHeader, ParseResult, Term } from '../types/index';
import { currentHtmlLang, t } from '../i18n';

type PreviewState =
  | { kind: 'ready' }
  | { kind: 'importing' }
  | { kind: 'result'; message: string }
  | { kind: 'error'; message: string };

/**
 * Options for showing the PreviewPanel.
 */
export interface PreviewOptions {
  /** The parsed result containing language header and terms. */
  parseResult: ParseResult;
  /** The extension URI (used for webview resource access). */
  extensionUri: vscode.Uri;
}

/**
 * Displays a read-only preview of the parsed spreadsheet data in a VSCode WebviewPanel.
 * The user can confirm the import or cancel it.
 */
export class PreviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private languageHeaders: LanguageHeader[] = [];
  private terms: Term[] = [];

  /**
   * Shows the preview panel with the parsed data and waits for the user's action.
   * Resolves with 'import' if the user clicks "Importar", or 'cancel' if the user
   * clicks "Cancelar" or closes the panel.
   */
  show(options: PreviewOptions): Promise<'import' | 'cancel'> {
    return new Promise((resolve) => {
      const { parseResult } = options;
      const { languageHeaders, terms } = parseResult;
      this.languageHeaders = languageHeaders;
      this.terms = terms;

      this.panel = vscode.window.createWebviewPanel(
        'fastlatePreview',
        `Fastlate - ${t('preview.title')}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: false,
        }
      );

      this.panel.webview.html = this._buildHtml(
        languageHeaders,
        terms,
        { kind: 'ready' }
      );

      let resolved = false;

      const resolveOnce = (action: 'import' | 'cancel'): void => {
        if (!resolved) {
          resolved = true;
          resolve(action);
        }
      };

      // Listen for messages from the webview (button clicks)
      this.panel.webview.onDidReceiveMessage((message: { command: string }) => {
        if (message.command === 'import') {
          resolveOnce('import');
        } else if (message.command === 'cancel') {
          resolveOnce('cancel');
          this.dispose();
        }
      });

      // Resolve with 'cancel' if the panel is closed by the user
      this.panel.onDidDispose(() => {
        resolveOnce('cancel');
        this.panel = undefined;
      });
    });
  }

  /**
   * Disposes the webview panel, closing it if it is open.
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
  }

  showImporting(): void {
    this.updateState({ kind: 'importing' });
  }

  showResult(message: string): void {
    this.updateState({ kind: 'result', message });
  }

  showError(message: string): void {
    this.updateState({ kind: 'error', message });
  }

  private updateState(state: PreviewState): void {
    if (!this.panel) {
      return;
    }

    this.panel.webview.html = this._buildHtml(this.languageHeaders, this.terms, state);
  }

  /**
   * Builds the HTML content for the webview panel.
   */
  private _buildHtml(
    languageHeaders: LanguageHeader[],
    terms: Term[],
    state: PreviewState = { kind: 'ready' }
  ): string {
    const totalTerms = terms.length;
    const languageSummary = languageHeaders
      .map((language) => `${language.name} (${language.code})`)
      .join(', ');
    const tableHeaders = languageHeaders
      .map(
        (language) =>
          `<th>${this._escapeHtml(this._formatLanguageLabel(language))}</th>`
      )
      .join('\n        ');

    const tableRows = terms
      .map(
        (term) => {
          const termValues = term.values ?? [
            { language: languageHeaders[0], value: term.value },
          ];
          const valueCells = languageHeaders
            .map(
              (_language, languageIndex) =>
                `<td>${this._escapeHtml(termValues[languageIndex]?.value ?? '')}</td>`
            )
            .join('\n            ');

          return `<tr>
            <td>${this._escapeHtml(term.key)}</td>
            ${valueCells}
          </tr>`;
        }
      )
      .join('\n');
    const importDisabled = state.kind === 'ready' ? '' : ' disabled';
    const cancelDisabled = state.kind === 'importing' ? ' disabled' : '';
    const importButtonText = this._importButtonText(state);
    const cancelButtonText = state.kind === 'ready' || state.kind === 'importing' ? t('preview.cancel') : t('preview.close');
    const statusClass = this._statusClass(state);
    const statusText = this._statusText(state);

    return `<!DOCTYPE html>
<html lang="${currentHtmlLang()}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
  <title>${t('preview.title')}</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }

    h1 {
      font-size: 1.2em;
      margin-bottom: 8px;
    }

    .meta {
      margin-bottom: 12px;
      color: var(--vscode-descriptionForeground, #888);
    }

    .meta span {
      margin-right: 16px;
    }

    .total {
      font-weight: bold;
      margin-bottom: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    th, td {
      text-align: left;
      padding: 6px 10px;
      border: 1px solid var(--vscode-panel-border, #444);
      word-break: break-word;
    }

    th {
      background-color: var(--vscode-editor-lineHighlightBackground, #2a2a2a);
      font-weight: bold;
    }

    tr:nth-child(even) {
      background-color: var(--vscode-list-hoverBackground, #1e1e1e);
    }

    .actions {
      display: flex;
      gap: 12px;
    }

    button {
      padding: 8px 20px;
      font-size: 1em;
      cursor: pointer;
      border: none;
      border-radius: 3px;
    }

    button:disabled {
      cursor: default;
      opacity: 0.72;
    }

    #btn-import {
      background-color: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }

    #btn-import:hover {
      background-color: var(--vscode-button-hoverBackground, #1177bb);
    }

    #btn-cancel {
      background-color: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
    }

    #btn-cancel:hover {
      background-color: var(--vscode-button-secondaryHoverBackground, #45494e);
    }

    .status {
      min-height: 18px;
      margin-top: 10px;
      color: var(--vscode-descriptionForeground, #888);
    }

    .status.done {
      color: var(--vscode-testing-iconPassed, #89d185);
    }

    .status.error {
      color: var(--vscode-testing-iconFailed, #f48771);
    }
  </style>
</head>
<body>
  <h1>${t('preview.title')}</h1>

  <div class="meta">
    <span><strong>${t('preview.languages')}:</strong> ${this._escapeHtml(languageSummary)}</span>
  </div>

  <div class="total">${t('preview.totalTerms', { total: totalTerms })}</div>

  <table>
    <thead>
      <tr>
        <th>${t('preview.key')}</th>
        ${tableHeaders}
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="actions">
    <button id="btn-import"${importDisabled}>${this._escapeHtml(importButtonText)}</button>
    <button id="btn-cancel"${cancelDisabled}>${this._escapeHtml(cancelButtonText)}</button>
  </div>
  <div id="import-status" class="${statusClass}" role="status" aria-live="polite">${this._escapeHtml(statusText)}</div>

  <script>
    const vscode = acquireVsCodeApi();
    const importButton = document.getElementById('btn-import');
    const cancelButton = document.getElementById('btn-cancel');
    const importStatus = document.getElementById('import-status');
    let importSubmitted = false;

    function setImporting() {
      importSubmitted = true;
      importButton.textContent = '${t('preview.importing')}';
      importButton.setAttribute('disabled', 'disabled');
      cancelButton.setAttribute('disabled', 'disabled');
      importStatus.className = 'status';
      importStatus.textContent = '${t('preview.importingTerms')}';
    }

    function setResult(message) {
      importSubmitted = true;
      importButton.textContent = '${t('preview.done')}';
      importButton.setAttribute('disabled', 'disabled');
      cancelButton.textContent = '${t('preview.close')}';
      cancelButton.removeAttribute('disabled');
      importStatus.className = 'status done';
      importStatus.textContent = message || '${t('preview.importDone')}';
    }

    function setError(message) {
      importSubmitted = true;
      importButton.textContent = '${t('preview.error')}';
      importButton.setAttribute('disabled', 'disabled');
      cancelButton.textContent = '${t('preview.close')}';
      cancelButton.removeAttribute('disabled');
      importStatus.className = 'status error';
      importStatus.textContent = message || '${t('preview.importFailed')}';
    }

    importButton.addEventListener('click', function () {
      if (importSubmitted) {
        return;
      }
      setImporting();
      vscode.postMessage({ command: 'import' });
    });

    cancelButton.addEventListener('click', function () {
      vscode.postMessage({ command: 'cancel' });
    });

  </script>
</body>
</html>`;
  }

  /**
   * Escapes HTML special characters to prevent XSS in the webview.
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private _importButtonText(state: PreviewState): string {
    if (state.kind === 'importing') {
      return t('preview.importing');
    }

    if (state.kind === 'result') {
      return t('preview.done');
    }

    if (state.kind === 'error') {
      return t('preview.error');
    }

    return t('preview.import');
  }

  private _statusClass(state: PreviewState): string {
    if (state.kind === 'result') {
      return 'status done';
    }

    if (state.kind === 'error') {
      return 'status error';
    }

    return 'status';
  }

  private _statusText(state: PreviewState): string {
    if (state.kind === 'importing') {
      return t('preview.importingTerms');
    }

    if (state.kind === 'result' || state.kind === 'error') {
      return state.message;
    }

    return '';
  }

  private _formatLanguageLabel(language: LanguageHeader): string {
    return `${language.name} (${language.code})`;
  }
}
