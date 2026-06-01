import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { activate, deactivate } from './extension';
import { PreviewPanel } from './ui/PreviewPanel';
import { WeblateHttpClient } from './http/WeblateHttpClient';

jest.mock('./ui/PreviewPanel');
jest.mock('./http/WeblateHttpClient');

const mockPreviewShow = jest.fn();
const mockPreviewShowImporting = jest.fn();
const mockPreviewShowResult = jest.fn();
const mockPreviewShowError = jest.fn();
const mockCreateKey = jest.fn();
const mockFindTermId = jest.fn();
const mockListTermIdsByLanguage = new Map<string, Map<string, number>>();
const mockEditTerm = jest.fn();
const mockOutputAppendLine = jest.fn();
const mockCreateKeyLanguages: string[] = [];

(PreviewPanel as jest.Mock).mockImplementation(() => ({
  show: mockPreviewShow,
  showImporting: mockPreviewShowImporting,
  showResult: mockPreviewShowResult,
  showError: mockPreviewShowError,
}));

(WeblateHttpClient as jest.Mock).mockImplementation((_config, languageCode: string) => {
  return {
    createKey: (...args: [string, string]) => {
      mockCreateKeyLanguages.push(languageCode);
      return mockCreateKey(...args);
    },
    findTermId: (key: string) => {
      const idsByKey = mockListTermIdsByLanguage.get(languageCode);
      if (idsByKey !== undefined) {
        return Promise.resolve(idsByKey.get(key) ?? null);
      }
      return mockFindTermId(key);
    },
    listTermIds: jest.fn(() =>
      Promise.resolve(mockListTermIdsByLanguage.get(languageCode) ?? new Map([
        ['button.save', 100],
        ['button.cancel', 100],
      ])),
    ),
    editTerm: mockEditTerm,
  };
});

const mockWindow = vscode.window as unknown as {
  createOutputChannel: jest.Mock;
  registerWebviewViewProvider: jest.Mock;
  showErrorMessage: jest.Mock;
  showInformationMessage: jest.Mock;
  showInputBox: jest.Mock;
  showOpenDialog: jest.Mock;
  showWarningMessage: jest.Mock;
  withProgress: jest.Mock;
};

const mockWorkspace = vscode.workspace as unknown as {
  getConfiguration: jest.Mock;
  onDidChangeConfiguration: jest.Mock;
};

const mockCommands = vscode.commands as unknown as {
  registerCommand: jest.Mock;
};

const mockSecrets = {
  get: jest.fn(),
  store: jest.fn(),
  delete: jest.fn(),
};

function createCsvFile(content = 'label;Português\ncode;pt\nbutton.save;Salvar\nbutton.cancel;Cancelar'): string {
  const filePath = path.join(
    os.tmpdir(),
    `fastlate-integration-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
  );
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore test cleanup failures
  }
}

function configureValidSettings(defaultLanguage = 'pt'): void {
  const values: Record<string, string> = {
    serverUrl: 'https://weblate.example.com',
    authToken: '',
    project: 'project-slug',
    component: 'component-slug',
    defaultLanguage,
  };

  mockWorkspace.getConfiguration.mockReturnValue({
    get: jest.fn((field: string) => values[field]),
  });
}

function createContext(): vscode.ExtensionContext {
  return {
    extensionPath: 'C:\\GitHub_Repos\\fastlate\\packages\\fastlate',
    secrets: mockSecrets,
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function registeredImportCommand(): () => Promise<void> {
  activate(createContext());

  const registration = mockCommands.registerCommand.mock.calls.find(
    ([command]) => command === 'fastlate.importTranslations',
  );

  if (!registration) {
    throw new Error('fastlate.importTranslations was not registered');
  }

  return registration[1];
}

function registeredCommand(commandName: string): () => Promise<void> {
  activate(createContext());

  const registration = mockCommands.registerCommand.mock.calls.find(
    ([command]) => command === commandName,
  );

  if (!registration) {
    throw new Error(`${commandName} was not registered`);
  }

  return registration[1];
}

describe('Fastlate extension integration flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateKeyLanguages.length = 0;
    mockListTermIdsByLanguage.clear();
    configureValidSettings();
    mockSecrets.get.mockResolvedValue('secret-token');
    mockSecrets.store.mockResolvedValue(undefined);
    mockSecrets.delete.mockResolvedValue(undefined);

    mockCommands.registerCommand.mockReturnValue({ dispose: jest.fn() });
    mockWindow.registerWebviewViewProvider.mockReturnValue({ dispose: jest.fn() });
    mockWorkspace.onDidChangeConfiguration.mockReturnValue({ dispose: jest.fn() });
    mockWindow.createOutputChannel.mockReturnValue({
      appendLine: mockOutputAppendLine,
      show: jest.fn(),
      dispose: jest.fn(),
    });
    mockWindow.withProgress.mockImplementation(async (_options, task) =>
      task({ report: jest.fn() }, { isCancellationRequested: false }),
    );
    mockPreviewShow.mockResolvedValue('import');
    mockCreateKey.mockResolvedValue({ kind: 'created' });
    mockEditTerm.mockResolvedValue({ kind: 'success' });
    mockFindTermId.mockResolvedValue(100);
  });

  afterEach(() => {
    deactivate();
  });

  it('runs the complete import flow with a real CSV file and mocked Weblate client', async () => {
    const csvPath = createCsvFile();
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);

    try {
      await registeredImportCommand()();

      expect(mockPreviewShow).toHaveBeenCalledWith(
        expect.objectContaining({
          parseResult: expect.objectContaining({
            languageHeader: { name: 'Português', code: 'pt' },
            languageHeaders: [{ name: 'Português', code: 'pt' }],
            terms: [
              expect.objectContaining({ key: 'button.save', value: 'Salvar', sourceRow: 3 }),
              expect.objectContaining({ key: 'button.cancel', value: 'Cancelar', sourceRow: 4 }),
            ],
          }),
        }),
      );
      expect(mockPreviewShowImporting).toHaveBeenCalledTimes(1);
      expect(mockCreateKey).toHaveBeenCalledTimes(2);
      expect(mockCreateKey).toHaveBeenNthCalledWith(1, 'button.save', 'Salvar');
      expect(mockCreateKey).toHaveBeenNthCalledWith(2, 'button.cancel', 'Cancelar');
      expect(mockFindTermId).toHaveBeenCalledTimes(2);
      expect(mockFindTermId).toHaveBeenNthCalledWith(1, 'button.save');
      expect(mockFindTermId).toHaveBeenNthCalledWith(2, 'button.cancel');
      expect(mockEditTerm).toHaveBeenCalledTimes(2);
      expect(WeblateHttpClient).toHaveBeenCalledWith(
        {
          serverUrl: 'https://weblate.example.com',
          authToken: 'secret-token',
          project: 'project-slug',
          component: 'component-slug',
          defaultLanguage: 'pt',
        },
        'pt',
      );
      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Total: 2 | Criados: 2 | Somente editados: 2 | Erros: 0'),
      );
      expect(mockPreviewShowResult).toHaveBeenCalledWith(
        expect.stringContaining('Total: 2 | Criados: 2 | Somente editados: 2 | Erros: 0'),
      );
    } finally {
      removeFile(csvPath);
    }
  });

  it('registers the Fastlate sidebar view provider on activation', () => {
    activate(createContext());

    expect(mockCommands.registerCommand).toHaveBeenCalledWith(
      'fastlate.importTranslations',
      expect.any(Function),
    );
    expect(mockCommands.registerCommand).toHaveBeenCalledWith(
      'fastlate.configureToken',
      expect.any(Function),
    );
    expect(mockCommands.registerCommand).toHaveBeenCalledWith(
      'fastlate.removeToken',
      expect.any(Function),
    );
    expect(mockWindow.registerWebviewViewProvider).toHaveBeenCalledWith(
      'fastlate.sidebar',
      expect.any(Object),
    );
    expect(mockWorkspace.onDidChangeConfiguration).toHaveBeenCalledTimes(1);
  });

  it('stores the token through the configure token command', async () => {
    mockWindow.showInputBox.mockResolvedValue(' new-secret-token ');

    await registeredCommand('fastlate.configureToken')();

    expect(mockWindow.showInputBox).toHaveBeenCalledWith(expect.objectContaining({
      password: true,
    }));
    expect(mockSecrets.store).toHaveBeenCalledWith('fastlate.authToken', 'new-secret-token');
    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      'Fastlate: token salvo.',
    );
  });

  it('removes the token through the remove token command', async () => {
    await registeredCommand('fastlate.removeToken')();

    expect(mockSecrets.delete).toHaveBeenCalledWith('fastlate.authToken');
    expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('token removido'),
    );
  });

  it('returns silently when the file dialog is cancelled', async () => {
    mockWindow.showOpenDialog.mockResolvedValue(undefined);

    await registeredImportCommand()();

    expect(mockPreviewShow).not.toHaveBeenCalled();
    expect(mockWindow.withProgress).not.toHaveBeenCalled();
    expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
  });

  it('returns silently when the preview is cancelled', async () => {
    const csvPath = createCsvFile();
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    mockPreviewShow.mockResolvedValue('cancel');

    try {
      await registeredImportCommand()();

      expect(mockPreviewShow).toHaveBeenCalledTimes(1);
      expect(mockWindow.withProgress).not.toHaveBeenCalled();
      expect(mockWindow.showInformationMessage).not.toHaveBeenCalled();
    } finally {
      removeFile(csvPath);
    }
  });

  it('shows the final summary with correct edited and error counts', async () => {
    const csvPath = createCsvFile();
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    mockCreateKey.mockResolvedValue({
      kind: 'already_exists',
      message: 'value already exist in Weblate',
    });
    mockListTermIdsByLanguage.set('pt', new Map([
      ['button.save', 202],
    ]));
    mockEditTerm.mockResolvedValue({ kind: 'success' });

    try {
      await registeredImportCommand()();

      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Total: 2 | Criados: 0 | Somente editados: 1 | Erros: 1'),
      );
      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Chaves com erro: button.cancel'),
      );
      expect(mockOutputAppendLine).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] [row 3] key="button.save": key already exists - value already exist in Weblate'),
      );
    } finally {
      removeFile(csvPath);
    }
  });

  it('creates primary keys without values, then searches and patches every language', async () => {
    const csvPath = createCsvFile(
      'label;Português;English\ncode;pt;en\nbutton.save;Salvar;Save\nbutton.cancel;Cancelar;Cancel',
    );
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    mockCreateKey
      .mockResolvedValueOnce({ kind: 'created' })
      .mockResolvedValueOnce({ kind: 'created' });
    mockFindTermId
      .mockReset()
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(102)
      .mockResolvedValueOnce(201)
      .mockResolvedValueOnce(202);
    mockEditTerm.mockResolvedValue({ kind: 'success' });

    try {
      await registeredImportCommand()();

      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'pt');
      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'en');
      expect(mockCreateKey).toHaveBeenCalledTimes(2);
      expect(mockCreateKey).toHaveBeenNthCalledWith(1, 'button.save', 'Salvar');
      expect(mockCreateKey).toHaveBeenNthCalledWith(2, 'button.cancel', 'Cancelar');
      expect(mockFindTermId).toHaveBeenCalledTimes(4);
      expect(mockFindTermId).toHaveBeenNthCalledWith(1, 'button.save');
      expect(mockFindTermId).toHaveBeenNthCalledWith(2, 'button.cancel');
      expect(mockFindTermId).toHaveBeenNthCalledWith(3, 'button.save');
      expect(mockFindTermId).toHaveBeenNthCalledWith(4, 'button.cancel');
      expect(mockEditTerm).toHaveBeenCalledTimes(4);
      expect(mockEditTerm).toHaveBeenNthCalledWith(1, 101, 'Salvar');
      expect(mockEditTerm).toHaveBeenNthCalledWith(2, 102, 'Cancelar');
      expect(mockEditTerm).toHaveBeenNthCalledWith(3, 201, 'Save');
      expect(mockEditTerm).toHaveBeenNthCalledWith(4, 202, 'Cancel');
      expect(mockCreateKey.mock.invocationCallOrder[1]).toBeLessThan(
        mockFindTermId.mock.invocationCallOrder[0],
      );
      for (let i = 0; i < 4; i++) {
        expect(mockFindTermId.mock.invocationCallOrder[i]).toBeLessThan(
          mockEditTerm.mock.invocationCallOrder[i],
        );
      }
      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Total: 4 | Criados: 2 | Somente editados: 4 | Erros: 0'),
      );
    } finally {
      removeFile(csvPath);
    }
  });

  it('creates keys from Portuguese when Portuguese is not the first language column', async () => {
    configureValidSettings('pt_BR');
    const csvPath = createCsvFile(
      'label;English;Português\ncode;en;pt_BR\nbutton.save;Save;Salvar\nbutton.cancel;Cancel;Cancelar',
    );
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    mockCreateKey
      .mockResolvedValueOnce({ kind: 'created' })
      .mockResolvedValueOnce({ kind: 'created' });
    mockListTermIdsByLanguage.set('en', new Map([
      ['button.save', 201],
      ['button.cancel', 202],
    ]));
    mockListTermIdsByLanguage.set('pt_BR', new Map([
      ['button.save', 101],
      ['button.cancel', 102],
    ]));
    mockEditTerm.mockResolvedValue({ kind: 'success' });

    try {
      await registeredImportCommand()();

      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'pt_BR');
      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'en');
      expect(mockCreateKey).toHaveBeenCalledTimes(2);
      expect(mockCreateKey).toHaveBeenNthCalledWith(1, 'button.save', 'Salvar');
      expect(mockCreateKey).toHaveBeenNthCalledWith(2, 'button.cancel', 'Cancelar');
      expect(mockEditTerm).toHaveBeenCalledTimes(4);
    } finally {
      removeFile(csvPath);
    }
  });

  it('shows an error when the CSV has no default language column', async () => {
    const csvPath = createCsvFile(
      'label;English;Español\ncode;en;es\nbutton.save;Save;Guardar\nbutton.cancel;Cancel;Cancelar',
    );
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    try {
      await registeredImportCommand()();

      expect(mockPreviewShow).not.toHaveBeenCalled();
      expect(WeblateHttpClient).not.toHaveBeenCalled();
      expect(mockCreateKey).not.toHaveBeenCalled();
      expect(mockFindTermId).not.toHaveBeenCalled();
      expect(mockEditTerm).not.toHaveBeenCalled();
      expect(mockWindow.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('coluna com idioma padrão não encontrada'),
      );
    } finally {
      removeFile(csvPath);
    }
  });

  it('creates keys only through pt_BR when languages start at column A', async () => {
    configureValidSettings('pt_BR');
    const csvPath = createCsvFile(
      'Português;Inglês;Espanhol;Francês\npt_BR;en;es;fr\nbola;ball;pelota;balle',
    );
    mockWindow.showOpenDialog.mockResolvedValue([{ fsPath: csvPath }]);
    mockCreateKey.mockResolvedValueOnce({ kind: 'created' });
    mockListTermIdsByLanguage.set('pt_BR', new Map([['bola', 101]]));
    mockListTermIdsByLanguage.set('en', new Map([['bola', 201]]));
    mockListTermIdsByLanguage.set('es', new Map([['bola', 301]]));
    mockListTermIdsByLanguage.set('fr', new Map([['bola', 401]]));
    mockEditTerm.mockResolvedValue({ kind: 'success' });

    try {
      await registeredImportCommand()();

      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'pt_BR');
      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'en');
      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'es');
      expect(WeblateHttpClient).toHaveBeenCalledWith(expect.any(Object), 'fr');
      expect(mockCreateKey).toHaveBeenCalledTimes(1);
      expect(mockCreateKey).toHaveBeenCalledWith('bola', 'bola');
      expect(mockCreateKeyLanguages).toEqual(['pt_BR']);
      expect(mockEditTerm).toHaveBeenNthCalledWith(1, 101, 'bola');
      expect(mockEditTerm).toHaveBeenNthCalledWith(2, 201, 'ball');
      expect(mockEditTerm).toHaveBeenNthCalledWith(3, 301, 'pelota');
      expect(mockEditTerm).toHaveBeenNthCalledWith(4, 401, 'balle');
      expect(mockWindow.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Total: 4 | Criados: 1 | Somente editados: 4 | Erros: 0'),
      );
    } finally {
      removeFile(csvPath);
    }
  });
});
