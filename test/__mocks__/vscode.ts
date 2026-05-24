/**
 * Mock for the `vscode` module used in Jest tests.
 * The real `vscode` module is only available inside the extension host at runtime.
 */

const workspace = {
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn(),
  }),
  onDidChangeConfiguration: jest.fn(),
};

const env = {
  language: 'pt-br',
};

const window = {
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  }),
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showOpenDialog: jest.fn(),
  withProgress: jest.fn(),
  createWebviewPanel: jest.fn(),
  registerWebviewViewProvider: jest.fn(),
};

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path })),
  parse: jest.fn((uri: string) => ({ toString: () => uri })),
};

const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
};

const ProgressLocation = {
  Notification: 15,
  SourceControl: 1,
  Window: 10,
};

const CancellationTokenSource = jest.fn().mockImplementation(() => ({
  token: {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(),
  },
  cancel: jest.fn(),
  dispose: jest.fn(),
}));

const EventEmitter = jest.fn().mockImplementation(() => ({
  event: jest.fn(),
  fire: jest.fn(),
  dispose: jest.fn(),
}));

const createSecretStorage = () => ({
  get: jest.fn(),
  store: jest.fn(),
  delete: jest.fn(),
  onDidChange: jest.fn(),
});

export {
  workspace,
  window,
  commands,
  Uri,
  ViewColumn,
  ProgressLocation,
  CancellationTokenSource,
  EventEmitter,
  createSecretStorage,
  env,
};
