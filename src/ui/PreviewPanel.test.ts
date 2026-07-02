import * as vscode from 'vscode';
import { PreviewPanel } from './PreviewPanel';
import type { LanguageHeader, Term } from '../types/index';

type PreviewPanelHtmlBuilder = {
  _buildHtml(languageHeaders: LanguageHeader[], terms: Term[]): string;
};

function buildPreviewHtml(terms: Term[] = sampleTerms): string {
  const panel = new PreviewPanel();
  const buildHtml = (panel as unknown as PreviewPanelHtmlBuilder)._buildHtml.bind(panel);
  return buildHtml(sampleLanguages, terms);
}

const sampleLanguages: LanguageHeader[] = [
  { name: 'Português', code: 'pt-BR' },
  { name: 'English', code: 'en' },
];

const sampleTerms: Term[] = [
  {
    key: 'button.save',
    value: 'Salvar',
    values: [
      { language: sampleLanguages[0], value: 'Salvar' },
      { language: sampleLanguages[1], value: 'Save' },
    ],
    sourceRow: 3,
  },
  {
    key: 'button.cancel',
    value: 'Cancelar',
    values: [
      { language: sampleLanguages[0], value: 'Cancelar' },
      { language: sampleLanguages[1], value: 'Cancel' },
    ],
    sourceRow: 4,
  },
];

describe('PreviewPanel', () => {
  describe('HTML generation', () => {
    it('renders a read-only terms table with Chave and language value columns', () => {
      const html = buildPreviewHtml();

      expect(html).toContain('<div class="table-wrap">');
      expect(html).toContain('<table>');
      expect(html).toContain('<th>Chave</th>');
      expect(html).toContain('<th>Português (pt-BR)</th>');
      expect(html).toContain('<th>English (en)</th>');
      expect(html).toContain('<td>button.save</td>');
      expect(html).toContain('<td>Salvar</td>');
      expect(html).toContain('<td>Save</td>');
      expect(html).toContain('<td>button.cancel</td>');
      expect(html).toContain('<td>Cancelar</td>');
      expect(html).toContain('<td>Cancel</td>');
    });

    it('wraps the terms table in a scrollable container for large previews', () => {
      const html = buildPreviewHtml();

      expect(html).toContain('.table-wrap');
      expect(html).toContain('overflow: auto;');
      expect(html).toContain('max-height: min(62vh, 680px);');
      expect(html).toContain('width: max-content;');
      expect(html).toContain('min-width: 100%;');
    });

    it('renders total terms and all language labels', () => {
      const html = buildPreviewHtml();

      expect(html).toContain('<strong>Idiomas:</strong> Português (pt-BR), English (en)');
      expect(html).toContain('Total de terms: 2');
    });

    it('renders Importar and Cancelar action buttons', () => {
      const html = buildPreviewHtml();

      expect(html).toContain('<button id="btn-import">Importar</button>');
      expect(html).toContain('<button id="btn-cancel">Cancelar</button>');
      expect(html).toContain('Importando...');
      expect(html).toContain('Importando termos...');
    });

    it('does not render editable input fields', () => {
      const html = buildPreviewHtml();

      expect(html).not.toMatch(/<input\b/i);
      expect(html).not.toMatch(/<textarea\b/i);
      expect(html).not.toMatch(/contenteditable\s*=/i);
    });
  });

  describe('webview behavior', () => {
    it('keeps the preview panel open after the import action is submitted', async () => {
      let receiveMessage: ((message: { command: string }) => void) | undefined;
      const dispose = jest.fn();

      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue({
        webview: {
          html: '',
          onDidReceiveMessage: jest.fn((handler) => {
            receiveMessage = handler;
          }),
        },
        onDidDispose: jest.fn(),
        dispose,
      });

      const panel = new PreviewPanel();
      const result = panel.show({
        parseResult: {
          languageHeader: sampleLanguages[0],
          languageHeaders: sampleLanguages,
          terms: sampleTerms,
          ignoredColumns: [],
        },
        extensionUri: vscode.Uri.file('C:\\GitHub_Repos\\fastlate\\packages\\fastlate') as never,
      });

      receiveMessage?.({ command: 'import' });

      await expect(result).resolves.toBe('import');
      expect(dispose).not.toHaveBeenCalled();
    });

    it('can tell the open preview panel to show the importing state', () => {
      const webview = {
        html: '',
        onDidReceiveMessage: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue({
        webview,
        onDidDispose: jest.fn(),
        dispose: jest.fn(),
      });

      const panel = new PreviewPanel();
      void panel.show({
        parseResult: {
          languageHeader: sampleLanguages[0],
          languageHeaders: sampleLanguages,
          terms: sampleTerms,
          ignoredColumns: [],
        },
        extensionUri: vscode.Uri.file('C:\\GitHub_Repos\\fastlate\\packages\\fastlate') as never,
      });

      panel.showImporting();

      expect(webview.html).toContain('<button id="btn-import" disabled>Importando...</button>');
      expect(webview.html).toContain('<button id="btn-cancel" disabled>Cancelar</button>');
      expect(webview.html).toContain('Importando termos...');
    });

    it('can tell the open preview panel to show the final result', () => {
      const webview = {
        html: '',
        onDidReceiveMessage: jest.fn(),
      };

      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue({
        webview,
        onDidDispose: jest.fn(),
        dispose: jest.fn(),
      });

      const panel = new PreviewPanel();
      void panel.show({
        parseResult: {
          languageHeader: sampleLanguages[0],
          languageHeaders: sampleLanguages,
          terms: sampleTerms,
          ignoredColumns: [],
        },
        extensionUri: vscode.Uri.file('C:\\GitHub_Repos\\fastlate\\packages\\fastlate') as never,
      });

      panel.showResult('Fastlate: importacao concluida.');

      expect(webview.html).toContain('<button id="btn-import" disabled>Concluído</button>');
      expect(webview.html).toContain('<button id="btn-cancel">Fechar</button>');
      expect(webview.html).toContain('Fastlate: importacao concluida.');

      panel.showError('Fastlate: falha de autenticação.');

      expect(webview.html).toContain('<button id="btn-import" disabled>Erro</button>');
      expect(webview.html).toContain('<button id="btn-cancel">Fechar</button>');
      expect(webview.html).toContain('Fastlate: falha de autenticação.');
    });
  });
});
