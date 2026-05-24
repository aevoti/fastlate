import * as vscode from 'vscode';

type MessageKey =
  | 'sidebar.readyTitle'
  | 'sidebar.incompleteTitle'
  | 'sidebar.readyDescription'
  | 'sidebar.incompleteDescription'
  | 'sidebar.server'
  | 'sidebar.secureToken'
  | 'sidebar.project'
  | 'sidebar.component'
  | 'sidebar.defaultLanguage'
  | 'sidebar.ok'
  | 'sidebar.missing'
  | 'sidebar.importCsv'
  | 'sidebar.configureToken'
  | 'sidebar.removeToken'
  | 'sidebar.openSettings'
  | 'preview.title'
  | 'preview.languages'
  | 'preview.totalTerms'
  | 'preview.key'
  | 'preview.import'
  | 'preview.cancel'
  | 'preview.close'
  | 'preview.importing'
  | 'preview.importingTerms'
  | 'preview.done'
  | 'preview.error'
  | 'preview.importDone'
  | 'preview.importFailed'
  | 'token.prompt'
  | 'token.title'
  | 'token.empty'
  | 'token.saved'
  | 'token.removed'
  | 'error.missingToken'
  | 'error.missingConfig'
  | 'error.invalidUrl'
  | 'error.fileRead'
  | 'error.missingLanguageHeader'
  | 'error.missingDefaultLanguageColumn'
  | 'error.insufficientColumns'
  | 'error.emptySpreadsheet'
  | 'error.unknownCsv'
  | 'error.auth'
  | 'error.unexpectedImport'
  | 'progress.importing'
  | 'summary.failedKeys'
  | 'summary.done';

type MessageParams = Record<string, string | number>;

const en: Record<MessageKey, string> = {
  'sidebar.readyTitle': 'Configuration ready',
  'sidebar.incompleteTitle': 'Configuration incomplete',
  'sidebar.readyDescription': 'Ready to import translations.',
  'sidebar.incompleteDescription': 'Fill in the required fields to import.',
  'sidebar.server': 'Server',
  'sidebar.secureToken': 'Secure token',
  'sidebar.project': 'Project',
  'sidebar.component': 'Component',
  'sidebar.defaultLanguage': 'Default language',
  'sidebar.ok': 'OK',
  'sidebar.missing': 'Missing',
  'sidebar.importCsv': 'Import CSV',
  'sidebar.configureToken': 'Configure token',
  'sidebar.removeToken': 'Remove token',
  'sidebar.openSettings': 'Open settings',
  'preview.title': 'Import Preview',
  'preview.languages': 'Languages',
  'preview.totalTerms': 'Total terms: {total}',
  'preview.key': 'Key',
  'preview.import': 'Import',
  'preview.cancel': 'Cancel',
  'preview.close': 'Close',
  'preview.importing': 'Importing...',
  'preview.importingTerms': 'Importing terms...',
  'preview.done': 'Done',
  'preview.error': 'Error',
  'preview.importDone': 'Import completed.',
  'preview.importFailed': 'Import finished with errors.',
  'token.prompt': 'Enter your Weblate authentication token.',
  'token.title': 'Fastlate: Configure token',
  'token.empty': 'Fastlate: empty token. Enter a valid token.',
  'token.saved': 'Fastlate: token saved.',
  'token.removed': 'Fastlate: token removed from VSCode SecretStorage.',
  'error.missingToken': 'Fastlate: missing token. Run "Fastlate: Configure token" to save it securely.',
  'error.missingConfig': 'Fastlate: incomplete configuration - field "{field}" is missing or blank. Configure it in Settings > Fastlate.',
  'error.invalidUrl': 'Fastlate: invalid server URL ("{value}"). The URL must start with http:// or https:// and contain a valid host.',
  'error.fileRead': 'Fastlate: could not read the file - {message}',
  'error.missingLanguageHeader': 'Fastlate: the CSV file is missing the language header. Rows 1 and 2 must contain the language name and code.',
  'error.missingDefaultLanguageColumn': 'Fastlate: default language column not found. The CSV must contain a column with code "{languageCode}" in row 2.',
  'error.insufficientColumns': 'Fastlate: invalid spreadsheet structure - the file must have at least two columns (key and value).',
  'error.emptySpreadsheet': 'Fastlate: the spreadsheet does not contain any translation terms (rows 3+ are empty).',
  'error.unknownCsv': 'Fastlate: unknown error while processing the CSV file.',
  'error.auth': 'Fastlate: authentication failed - check the token saved with "Fastlate: Configure token".',
  'error.unexpectedImport': 'Fastlate: unexpected error during import - {message}',
  'progress.importing': 'Fastlate: importing translations...',
  'summary.failedKeys': 'Failed keys',
  'summary.done': 'Fastlate: import completed. Total: {total} | Created: {created} | Edited only: {onlyEdited} | Errors: {errors}{failedKeys}',
};

const pt: Record<MessageKey, string> = {
  'sidebar.readyTitle': 'Configuração pronta',
  'sidebar.incompleteTitle': 'Configuração incompleta',
  'sidebar.readyDescription': 'Pronto para importar traduções.',
  'sidebar.incompleteDescription': 'Preencha os campos obrigatórios para importar.',
  'sidebar.server': 'Servidor',
  'sidebar.secureToken': 'Token seguro',
  'sidebar.project': 'Projeto',
  'sidebar.component': 'Componente',
  'sidebar.defaultLanguage': 'Idioma padrão',
  'sidebar.ok': 'OK',
  'sidebar.missing': 'Ausente',
  'sidebar.importCsv': 'Importar CSV',
  'sidebar.configureToken': 'Configurar token',
  'sidebar.removeToken': 'Remover token',
  'sidebar.openSettings': 'Abrir configurações',
  'preview.title': 'Preview de Importação',
  'preview.languages': 'Idiomas',
  'preview.totalTerms': 'Total de terms: {total}',
  'preview.key': 'Chave',
  'preview.import': 'Importar',
  'preview.cancel': 'Cancelar',
  'preview.close': 'Fechar',
  'preview.importing': 'Importando...',
  'preview.importingTerms': 'Importando termos...',
  'preview.done': 'Concluído',
  'preview.error': 'Erro',
  'preview.importDone': 'Importação concluída.',
  'preview.importFailed': 'Importação finalizada com erro.',
  'token.prompt': 'Informe o token de autenticação do Weblate.',
  'token.title': 'Fastlate: Configurar token',
  'token.empty': 'Fastlate: token vazio. Informe um token válido.',
  'token.saved': 'Fastlate: token salvo.',
  'token.removed': 'Fastlate: token removido do SecretStorage do VSCode.',
  'error.missingToken': 'Fastlate: token ausente. Execute o comando "Fastlate: Configurar token" para salvá-lo com segurança.',
  'error.missingConfig': 'Fastlate: configuração incompleta - o campo "{field}" está ausente ou em branco. Configure-o em Configurações > Fastlate.',
  'error.invalidUrl': 'Fastlate: URL do servidor inválida ("{value}"). A URL deve começar com http:// ou https:// e conter um host válido.',
  'error.fileRead': 'Fastlate: não foi possível ler o arquivo - {message}',
  'error.missingLanguageHeader': 'Fastlate: o arquivo CSV não contém o cabeçalho de idioma. As linhas 1 e 2 devem conter o nome e o código do idioma.',
  'error.missingDefaultLanguageColumn': 'Fastlate: coluna com idioma padrão não encontrada. O CSV deve conter uma coluna com o código "{languageCode}" na linha 2.',
  'error.insufficientColumns': 'Fastlate: estrutura de planilha inválida - o arquivo deve ter pelo menos duas colunas (chave e valor).',
  'error.emptySpreadsheet': 'Fastlate: a planilha não contém nenhum term de tradução (linhas 3+ estão vazias).',
  'error.unknownCsv': 'Fastlate: erro desconhecido ao processar o arquivo CSV.',
  'error.auth': 'Fastlate: falha de autenticação - verifique o token salvo com o comando "Fastlate: Configurar token".',
  'error.unexpectedImport': 'Fastlate: erro inesperado durante a importação - {message}',
  'progress.importing': 'Fastlate: importando traduções...',
  'summary.failedKeys': 'Chaves com erro',
  'summary.done': 'Fastlate: importação concluída. Total: {total} | Criados: {created} | Somente editados: {onlyEdited} | Erros: {errors}{failedKeys}',
};

function activeMessages(): Record<MessageKey, string> {
  return vscode.env.language.toLowerCase().startsWith('en') ? en : pt;
}

export function currentHtmlLang(): string {
  return vscode.env.language.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

export function t(key: MessageKey, params: MessageParams = {}): string {
  const template = activeMessages()[key] ?? pt[key];
  return Object.entries(params).reduce(
    (message, [paramKey, value]) => message.split(`{${paramKey}}`).join(String(value)),
    template,
  );
}
