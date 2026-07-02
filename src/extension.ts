import * as vscode from 'vscode';
import { ConfigurationService } from './services/ConfigurationService';
import { CsvParser } from './parser/CsvParser';
import { PreviewPanel } from './ui/PreviewPanel';
import { FastlateSidebarProvider } from './ui/FastlateSidebarProvider';
import { ImportJob } from './job/ImportJob';
import { WeblateHttpClient } from './http/WeblateHttpClient';
import { FastlateLogger } from './services/FastlateLogger';
import { TokenStorageService } from './services/TokenStorageService';
import { AuthenticationError } from './types/errors';
import { t } from './i18n';
import type { ImportSummary, LanguageHeader, Term, WeblateConfiguration } from './types/index';

// ---------------------------------------------------------------------------
// Module-level singletons (created once per activation, disposed on deactivate)
// ---------------------------------------------------------------------------

let logger: FastlateLogger | undefined;

function normalizeLanguageCode(languageCode: string): string {
  return languageCode.trim().toLowerCase().replace('-', '_');
}

function isDefaultLanguageCode(languageCode: string, defaultLanguage: string): boolean {
  return normalizeLanguageCode(languageCode) === normalizeLanguageCode(defaultLanguage);
}

function termsForLanguage(
  terms: Term[],
  language: LanguageHeader,
  languageIndex: number,
): Term[] {
  const languageTerms: Term[] = [];

  for (const term of terms) {
    const value = term.values?.[languageIndex]?.value ?? (languageIndex === 0 ? term.value : '');

    if (value) {
      languageTerms.push({
        key: term.key,
        value,
        values: [{ language, value }],
        sourceRow: term.sourceRow,
      });
    }
  }

  return languageTerms;
}

function recordFailedKey(summary: ImportSummary, key: string): void {
  if (!summary.failedKeys.includes(key)) {
    summary.failedKeys.push(key);
  }
}

export function buildSummaryMessage(summary: ImportSummary, ignoredColumns?: string[]): string {
  const failedKeys =
    summary.failedKeys.length === 0
      ? ''
      : ` | ${t('summary.failedKeys')}: ${summary.failedKeys.join(', ')}`;

  let message = t('summary.done', {
    total: summary.total,
    created: summary.created,
    onlyEdited: summary.onlyEdited,
    errors: summary.errors,
    failedKeys,
  });

  if (ignoredColumns && ignoredColumns.length > 0) {
    message += '\n' + t('summary.ignoredColumns') + ': ' + ignoredColumns.join(', ');
  }

  return message;
}

async function createPrimaryKeys(options: {
  config: WeblateConfiguration;
  language: LanguageHeader;
  terms: Term[];
  logger: FastlateLogger;
  summary: ImportSummary;
}): Promise<void> {
  const { config, language, terms, logger, summary } = options;
  const client = new WeblateHttpClient(config, language.code);
  const seenKeys = new Set<string>();

  for (const term of terms) {
    if (seenKeys.has(term.key)) {
      continue;
    }
    seenKeys.add(term.key);

    const creationResult = await client.createKey(term.key, term.value);

    if (creationResult.kind === 'created') {
      summary.created++;
    } else if (creationResult.kind === 'already_exists') {
      logger.warn(
        `[row ${term.sourceRow}] key="${term.key}": key already exists - ${creationResult.message ?? 'continuing with exact lookup and patch'}`
      );
      continue;
    } else if (creationResult.kind === 'auth_error') {
      throw new AuthenticationError(401);
    } else {
      logger.error(
        `[row ${term.sourceRow}] key="${term.key}": key creation failed (HTTP ${creationResult.statusCode}) — ${creationResult.message}`
      );
      summary.errors++;
      recordFailedKey(summary, term.key);
    }
  }
}

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

/**
 * Called by VSCode when the extension is activated.
 *
 * Registers the `fastlate.importTranslations` command, the sidebar view, and wires up all
 * services needed to orchestrate the full import flow.
 *
 * Requirements: 1.1, 1.2, 2.1, 2.8, 6.3, 6.4, 9.4, 9.5, 9.6, 10.1, 10.2, 10.5
 */
export function activate(context: vscode.ExtensionContext): void {
  // Create the shared logger (OutputChannel) once for the lifetime of the extension.
  logger = new FastlateLogger();
  const tokenStorage = new TokenStorageService(context.secrets);
  const sidebarProvider = new FastlateSidebarProvider(tokenStorage);

  const importCommandDisposable = vscode.commands.registerCommand(
    'fastlate.importTranslations',
    () => runImportCommand(context, logger!)
  );
  const configureTokenDisposable = vscode.commands.registerCommand(
    'fastlate.configureToken',
    () => configureToken(tokenStorage, sidebarProvider)
  );
  const removeTokenDisposable = vscode.commands.registerCommand(
    'fastlate.removeToken',
    () => removeToken(tokenStorage, sidebarProvider)
  );
  const sidebarDisposable = vscode.window.registerWebviewViewProvider(
    'fastlate.sidebar',
    sidebarProvider
  );
  const configurationDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('fastlate')) {
      sidebarProvider.refresh();
    }
  });

  context.subscriptions.push(
    importCommandDisposable,
    configureTokenDisposable,
    removeTokenDisposable,
    sidebarDisposable,
    configurationDisposable,
  );
}

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

/**
 * Called by VSCode when the extension is deactivated.
 * Releases the OutputChannel resource.
 */
export function deactivate(): void {
  logger?.dispose();
  logger = undefined;
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

async function configureToken(
  tokenStorage: TokenStorageService,
  sidebarProvider: FastlateSidebarProvider
): Promise<void> {
  const token = await vscode.window.showInputBox({
    ignoreFocusOut: true,
    password: true,
    prompt: t('token.prompt'),
    title: t('token.title'),
  });

  if (token === undefined) {
    return;
  }

  if (token.trim().length === 0) {
    await vscode.window.showErrorMessage(t('token.empty'));
    return;
  }

  await tokenStorage.storeToken(token);
  await sidebarProvider.refresh();
  await vscode.window.showInformationMessage(t('token.saved'));
}

async function removeToken(
  tokenStorage: TokenStorageService,
  sidebarProvider: FastlateSidebarProvider
): Promise<void> {
  await tokenStorage.deleteToken();
  await sidebarProvider.refresh();
  await vscode.window.showInformationMessage(t('token.removed'));
}

/**
 * Orchestrates the full import flow:
 *
 *  1. Read & validate configuration
 *  2. Show file-open dialog (CSV only)
 *  3. Parse the selected CSV file
 *  4. Show preview panel — user confirms or cancels
 *  5. Run the import job with progress indicator
 *  6. Display the final summary
 *
 * @param context  The extension context (used for webview resource URIs).
 * @param log      The shared FastlateLogger instance.
 */
async function runImportCommand(
  context: vscode.ExtensionContext,
  log: FastlateLogger
): Promise<void> {
  // -------------------------------------------------------------------------
  // Step 1: Read and validate configuration (Requirements 1.1, 1.2, 1.3, 1.4)
  // -------------------------------------------------------------------------
  const tokenStorage = new TokenStorageService(context.secrets);
  const tokenResult = await tokenStorage.getToken();
  const configService = new ConfigurationService();
  const configResult = configService.readConfiguration(tokenResult.token);

  if (!configResult.ok) {
    const { error } = configResult;
    let message: string;

    if (error.kind === 'missing_field') {
      message =
        error.field === 'authToken'
          ? t('error.missingToken')
          : t('error.missingConfig', { field: error.field });
    } else {
      message = t('error.invalidUrl', { value: error.value });
    }

    log.error(message);
    await vscode.window.showErrorMessage(message);
    return;
  }

  const config = configResult.value;

  // -------------------------------------------------------------------------
  // Step 2: Show file-open dialog filtered to .csv (Requirements 2.1, 2.8)
  // -------------------------------------------------------------------------
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: false,
    filters: { 'CSV Files': ['csv'] },
  });

  // Requirement 2.8: cancel silently if the user dismisses the dialog.
  if (!uris || uris.length === 0) {
    return;
  }

  const filePath = uris[0].fsPath;

  // -------------------------------------------------------------------------
  // Step 3: Parse the CSV file (Requirements 2.2–2.7, 2.9, 3.1–3.4)
  // -------------------------------------------------------------------------
  const parser = new CsvParser();
  const parseResult = parser.parseFile(filePath, log, config.defaultLanguage);

  if (!parseResult.ok) {
    const { error } = parseResult;
    let message: string;

    switch (error.kind) {
      case 'file_error':
        message = t('error.fileRead', { message: error.message });
        break;
      case 'missing_language_header':
        message = t('error.missingLanguageHeader');
        break;
      case 'missing_default_language_column':
        message = t('error.missingDefaultLanguageColumn', { languageCode: error.languageCode });
        break;
      case 'insufficient_columns':
        message = t('error.insufficientColumns');
        break;
      case 'empty_spreadsheet':
        message = t('error.emptySpreadsheet');
        break;
      default:
        message = t('error.unknownCsv');
    }

    log.error(message);
    await vscode.window.showErrorMessage(message);
    return;
  }

  // -------------------------------------------------------------------------
  // Step 4: Show preview panel (Requirements 9.1–9.7)
  // -------------------------------------------------------------------------
  const preview = new PreviewPanel();
  const action = await preview.show({
    parseResult: parseResult.value,
    extensionUri: vscode.Uri.file(context.extensionPath),
  });

  // Requirement 9.5: cancel silently if the user clicks "Cancelar" or closes the panel.
  if (action === 'cancel') {
    return;
  }
  preview.showImporting();

  // -------------------------------------------------------------------------
  // Step 5: Run the import job with a progress indicator (Requirements 6.1, 6.2)
  // -------------------------------------------------------------------------
  const { languageHeaders, terms } = parseResult.value;
  const job = new ImportJob();

  let summary;
  try {
    summary = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('progress.importing'),
        cancellable: true,
      },
      async (progress, cancellationToken) => {
        const aggregate: ImportSummary = {
          total: 0,
          created: 0,
          onlyEdited: 0,
          errors: 0,
          failedKeys: [],
        };
        const primaryLanguageIndex = languageHeaders.findIndex((language) =>
          isDefaultLanguageCode(language.code, config.defaultLanguage)
        );

        if (primaryLanguageIndex >= 0) {
          const primaryLanguage = languageHeaders[primaryLanguageIndex];
          const primaryLanguageTerms = termsForLanguage(
            terms,
            primaryLanguage,
            primaryLanguageIndex,
          );

          await createPrimaryKeys({
            config,
            language: primaryLanguage,
            terms: primaryLanguageTerms,
            logger: log,
            summary: aggregate,
          });
        }

        for (const [languageIndex, language] of languageHeaders.entries()) {
          const languageTerms = termsForLanguage(terms, language, languageIndex);

          if (languageTerms.length === 0) {
            continue;
          }

          const languageSummary = await job.run({
            config,
            languageCode: language.code,
            terms: languageTerms,
            cancellationToken,
            progress,
            logger: log,
          });

          aggregate.total += languageSummary.total;
          aggregate.created += languageSummary.created;
          aggregate.onlyEdited += languageSummary.onlyEdited;
          aggregate.errors += languageSummary.errors;
          for (const failedKey of languageSummary.failedKeys) {
            recordFailedKey(aggregate, failedKey);
          }

          if (cancellationToken.isCancellationRequested) {
            break;
          }
        }

        return aggregate;
      }
    );
  } catch (err) {
    if (err instanceof AuthenticationError) {
      const message = t('error.auth');
      log.error(message);
      preview.showError(message);
      await vscode.window.showErrorMessage(message);
    } else {
      const message = t('error.unexpectedImport', {
        message: err instanceof Error ? err.message : String(err),
      });
      log.error(message);
      preview.showError(message);
      await vscode.window.showErrorMessage(message);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Step 6: Display the final summary (Requirements 6.3, 6.4)
  // -------------------------------------------------------------------------
  const summaryMessage = buildSummaryMessage(summary, parseResult.value.ignoredColumns);

  log.info(summaryMessage);
  log.show();
  preview.showResult(summaryMessage);

  await vscode.window.showInformationMessage(summaryMessage);
}
