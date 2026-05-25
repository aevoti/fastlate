import * as vscode from 'vscode';
import { FastlateSidebarProvider } from './FastlateSidebarProvider';
import type { TokenStorageService } from '../services/TokenStorageService';

type SidebarHtmlBuilder = {
  buildHtml(): Promise<string>;
};

type SidebarMessageHandler = {
  handleMessage(message: { command: string }): Promise<void>;
};

const mockWorkspace = vscode.workspace as unknown as {
  getConfiguration: jest.Mock;
};

const mockCommands = vscode.commands as unknown as {
  executeCommand: jest.Mock;
};

function configure(values: Record<string, string>): void {
  mockWorkspace.getConfiguration.mockReturnValue({
    get: jest.fn((field: string) => values[field]),
  });
}

function createTokenStorage(hasToken: boolean): TokenStorageService {
  return {
    hasToken: jest.fn().mockResolvedValue(hasToken),
  } as unknown as TokenStorageService;
}

async function buildSidebarHtml(hasToken: boolean): Promise<string> {
  const provider = new FastlateSidebarProvider(createTokenStorage(hasToken));
  const buildHtml = (provider as unknown as SidebarHtmlBuilder).buildHtml.bind(provider);
  return buildHtml();
}

describe('FastlateSidebarProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders ready configuration status without exposing the auth token value', async () => {
    configure({
      serverUrl: 'https://weblate.example.com',
      authToken: 'super-secret-token',
      project: 'project-slug',
      component: 'component-slug',
      defaultLanguage: 'pt_BR',
    });

    const html = await buildSidebarHtml(true);

    expect(html).toContain('Configuração pronta');
    expect(html).toContain('Importar CSV');
    expect(html).toContain('Configurar token');
    expect(html).toContain('Remover token');
    expect(html).toContain('Abrir configurações');
    expect(html).toContain('Idioma padrão');
    expect(html).not.toContain('super-secret-token');
  });

  it('renders incomplete configuration status with missing field badges', async () => {
    configure({
      serverUrl: 'https://weblate.example.com',
      authToken: '',
      project: '',
      component: 'component-slug',
      defaultLanguage: '',
    });

    const html = await buildSidebarHtml(false);

    expect(html).toContain('Configuração incompleta');
    expect(html).toContain('<span>Token seguro</span>');
    expect(html).toContain('<span>Projeto</span>');
    expect(html).toContain('<span>Idioma padrão</span>');
    expect(html).toContain('Ausente');
  });

  it('opens the general settings view without a search query for fork compatibility', async () => {
    const provider = new FastlateSidebarProvider(createTokenStorage(true));
    const handleMessage = (provider as unknown as SidebarMessageHandler).handleMessage.bind(provider);

    await handleMessage({ command: 'settings' });

    expect(mockCommands.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings');
  });
});
