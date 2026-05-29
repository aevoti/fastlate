# Implementation Plan: Fastlate

## Overview

Implementação incremental da extensão VSCode Fastlate em TypeScript. O plano segue o fluxo de dados da arquitetura: configuração → parsing → preview → importação. Cada etapa é validada por testes antes de avançar para a próxima.

## Tasks

- [x] 1. Configurar estrutura do projeto e tipos base
  - [x] 1.1 Inicializar projeto VSCode extension com TypeScript, Jest e fast-check
    - Criar `package.json` completo com dependências: `vscode`, `papaparse`, `node-fetch`, `jest`, `ts-jest`, `fast-check`, `@types/*`
    - Criar `tsconfig.json`, `jest.config.ts` e `.eslintrc`
    - Criar estrutura de diretórios: `src/`, `src/services/`, `src/parser/`, `src/ui/`, `src/http/`, `src/job/`, `src/types/`, `test/`
    - _Requirements: todos_

  - [x] 1.2 Definir interfaces e tipos compartilhados
    - Criar `src/types/index.ts` com: `WeblateConfiguration`, `ConfigurationError`, `Term`, `LanguageHeader`, `ParseResult`, `ParseError`, `TermCreationResult`, `TermEditResult`, `ImportSummary`, `Result<T, E>`
    - Criar `src/types/errors.ts` com a hierarquia de erros `FastlateError`
    - _Requirements: 1.1, 2.2, 4.1, 5.1, 6.3_

  - [x] 1.3 Registrar contribuições da extensão no `package.json`
    - Adicionar `contributes.configuration` com as propriedades não sensíveis (`serverUrl`, `project`, `component`, `defaultLanguage`)
    - Adicionar `contributes.commands` com os comandos `fastlate.importTranslations`, `fastlate.configureToken` e `fastlate.removeToken`
    - _Requirements: 1.1, 1.5_

- [x] 2. Implementar ConfigurationService
  - [x] 2.1 Implementar `ConfigurationService` com leitura e validação
    - Criar `src/services/ConfigurationService.ts`
    - Ler `serverUrl`, `project`, `component` e `defaultLanguage` de `vscode.workspace.getConfiguration('fastlate')`
    - Ler o token via `vscode.ExtensionContext.secrets`
    - Validar presença e não-brancura de todos os campos, incluindo `defaultLanguage`, e do token; retornar `{ kind: 'missing_field', field }` para campos ausentes/brancos; `defaultLanguage` é obrigatório porque é o único idioma que cria chaves via `POST`
    - Validar que `serverUrl` começa com `http://` ou `https://` e tem host não vazio; retornar `{ kind: 'invalid_url', value }` para URL inválida
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x]* 2.2 Escrever testes unitários para `ConfigurationService`
    - Testar configuração válida completa
    - Testar cada campo ausente individualmente
    - Testar campo com apenas espaços em branco
    - Testar URLs inválidas (sem protocolo, protocolo errado, host vazio)
    - _Requirements: 1.2, 1.3, 1.4_

  - [x]* 2.3 Escrever property test para validação de configuração (Property 4)
    - **Property 4: Validação de configuração rejeita entradas inválidas**
    - Gerar configurações com pelo menos um campo ausente, branco ou URL inválida
    - Verificar que `readConfiguration()` sempre retorna erro para entradas inválidas
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [x] 3. Implementar CsvParser
  - [x] 3.1 Implementar `CsvParser` com papaparse
    - Criar `src/parser/CsvParser.ts`
    - Ler arquivo com `fs.readFileSync`, remover BOM (`\uFEFF`) se presente
    - Usar `papaparse.parse()` com `dynamicTyping: false` e `delimiter: ';'`
    - Extrair `LanguageHeader` das linhas 1 e 2; retornar `{ kind: 'missing_language_header' }` se vazias
    - Retornar `{ kind: 'insufficient_columns' }` se menos de 2 colunas
    - Retornar `{ kind: 'empty_spreadsheet' }` se nenhum term após linha 2
    - Processar linhas 3+ como `Term[]`, exigindo uma coluna cujo código corresponda a `defaultLanguage`; usar coluna dedicada de chave quando existir ou a coluna de `defaultLanguage` como chave quando não existir; ignorar linhas com chave vazia ou todos os valores de idioma vazios (com aviso no logger)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 3.1, 3.2, 3.3, 3.4, 8.1, 8.2, 8.3_

  - [x]* 3.2 Escrever testes unitários para `CsvParser`
    - Testar CSV com delimitador ponto-e-vírgula
    - Testar CSV com BOM UTF-8
    - Testar arquivo com Language_Header ausente (linha 1 ou 2 vazia)
    - Testar planilha sem terms (apenas Language_Header)
    - Testar planilha com menos de 2 colunas
    - Testar linhas com chave vazia e com todos os valores de idioma vazios (devem ser ignoradas)
    - Testar CSV sem coluna dedicada onde a chave vem da coluna configurada em `defaultLanguage`
    - Testar erro quando o CSV não contém a coluna configurada em `defaultLanguage`
    - Testar arquivo corrompido/inacessível
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.9, 3.2, 3.3, 3.4, 8.3_

  - [x]* 3.3 Escrever property test de round-trip CSV (Property 1)
    - **Property 1: Round-trip de parsing CSV**
    - Gerar listas arbitrárias de Terms (strings Unicode, espaços, caracteres especiais)
    - Serializar em CSV, fazer parsing e verificar que chaves e valores são idênticos byte a byte
    - **Validates: Requirements 8.1, 8.2, 2.2, 2.3, 3.1**

  - [x]* 3.4 Escrever property test de delimitador ponto-e-vírgula (Property 2)
    - **Property 2: Delimitador ponto-e-vírgula**
    - Gerar Terms sem ponto-e-vírgula nas células
    - Verificar que `parse(serializeSemicolon(t))` preserva os Terms
    - **Validates: Requirements 2.4**

  - [x]* 3.5 Escrever property test de filtragem de linhas inválidas (Property 3)
    - **Property 3: Filtragem de linhas inválidas**
    - Gerar CSVs com mix de linhas válidas e inválidas (chave vazia, todos os valores vazios, ambos)
    - Verificar que `result.terms.length === countValidRows(csv)`
    - **Validates: Requirements 3.3, 3.4, 2.7**

- [x] 4. Checkpoint — Garantir que todos os testes do parser e configuração passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 5. Implementar PreviewPanel
  - [x] 5.1 Implementar `PreviewPanel` como `vscode.WebviewPanel`
    - Criar `src/ui/PreviewPanel.ts`
    - Implementar `show(options)` que cria o `WebviewPanel`, gera HTML com tabela de Terms (somente leitura), total de terms, nome e código do idioma, e botões "Importar" e "Cancelar"
    - Comunicar ação do usuário via `webview.onDidReceiveMessage` e resolver a Promise com `'import'` ou `'cancel'`
    - Implementar `dispose()` para fechar o painel
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x]* 5.2 Escrever testes unitários para `PreviewPanel`
    - Testar que o HTML gerado contém a tabela com as colunas "Chave" e "Valor"
    - Testar que o HTML contém o total de terms, nome e código do idioma
    - Testar que os botões "Importar" e "Cancelar" estão presentes
    - Testar que nenhum campo é editável (ausência de `<input>`, `<textarea>` editáveis)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [x]* 5.3 Escrever property test de renderização do preview (Property 9)
    - **Property 9: Preview renderiza todos os dados lidos**
    - Gerar ParseResults arbitrários com N Terms
    - Verificar que o HTML gerado contém o nome do idioma, código, total N, e todas as chaves e valores
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 6. Implementar WeblateHttpClient
  - [x] 6.1 Implementar `WeblateHttpClient` com lógica de retry
    - Criar `src/http/WeblateHttpClient.ts`
    - Implementar `createTerm()`: POST para `/api/translations/{project}/{component}/{language}/units/` com `Authorization: Token {token}`; retornar `{ kind: 'created', unitId }` para HTTP 201, `{ kind: 'already_exists', message? }` para HTTP 400 com chave duplicada (incluindo qualquer mensagem do corpo que contenha `"already exist"`), `{ kind: 'auth_error' }` para 401/403, `{ kind: 'error' }` para outros
    - Implementar listagem de IDs: GET para `/api/units/?q=project:="{project}" component:="{component}" language:="{language}"` para montar mapa `key -> id` por idioma
    - Implementar `editTerm()`: PATCH para `/api/units/{id}/` com `Authorization: Token {token}`; retornar `{ kind: 'success' }` para HTTP 200, `{ kind: 'not_found' }` para 404, `{ kind: 'auth_error' }` para 401/403, `{ kind: 'error' }` para outros
    - Implementar lógica de retry: timeout 10s, até 3 tentativas, intervalo 2s, apenas para erros de rede/timeout e HTTP 5xx
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.1, 7.2, 7.3_

  - [x]* 6.2 Escrever testes unitários para `WeblateHttpClient`
    - Testar HTTP 201 → `{ kind: 'created', unitId }`
    - Testar HTTP 400 com chave duplicada → `{ kind: 'already_exists', message? }`
    - Testar HTTP 400 outro motivo → `{ kind: 'error' }`
    - Testar HTTP 401 e 403 → `{ kind: 'auth_error' }`
    - Testar HTTP 404 na edição → `{ kind: 'not_found' }`
    - Testar HTTP 5xx → retry 3x antes de retornar erro
    - Testar timeout → retry 3x antes de retornar erro
    - Verificar que cabeçalho `Authorization: Token {token}` está presente em todas as requisições
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3, 5.4, 5.5, 5.6, 7.1, 7.2_

  - [x]* 6.3 Escrever property test de cabeçalho de autorização (Property 5)
    - **Property 5: Cabeçalho de autorização presente em todas as requisições**
    - Gerar Terms e configurações válidas arbitrárias
    - Verificar que toda requisição HTTP (POST e PATCH) inclui `Authorization: Token {token}`
    - **Validates: Requirements 4.2, 5.2**

  - [x]* 6.4 Escrever property test de retry (Property 8)
    - **Property 8: Comportamento de retry para falhas de rede**
    - Simular requisições que falham por timeout/erro de conexão
    - Verificar que o cliente realiza exatamente 3 tentativas com intervalo de 2 segundos
    - **Validates: Requirements 7.1, 7.2**

- [x] 7. Checkpoint — Garantir que todos os testes do HTTP client passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 8. Implementar ImportJob e OutputChannel
  - [x] 8.1 Implementar `FastlateLogger` (OutputChannel)
    - Criar `src/services/FastlateLogger.ts`
    - Criar canal de saída `vscode.window.createOutputChannel('Fastlate')`
    - Implementar `info()`, `warn()` e `error()` com timestamp e prefixo de nível
    - _Requirements: 3.3, 3.4, 6.4, 7.2_

  - [x] 8.2 Implementar `ImportJob`
    - Criar `src/job/ImportJob.ts`
    - Implementar `run(options)` que processa cada Term sequencialmente:
      1. POST para criar term no idioma `defaultLanguage`, quando a coluna desse idioma existir → obtém `unitId`
      2. Se HTTP 201 → marca `created`, usa `unitId` retornado
      3. Se HTTP 400 duplicado → continua; antes dos PATCHes do idioma, monta mapa `key -> id` via listagem filtrada
      4. Se HTTP 401/403 → interrompe o job imediatamente
      5. Se outro erro → registra no logger, contabiliza como `error`, avança para próximo Term
      6. PATCH para editar term com o valor de tradução
      7. Atualiza `vscode.Progress` após cada Term
      8. Respeitar `cancellationToken` — verificar antes de cada Term, aguardar requisição em andamento
    - Retornar `ImportSummary` com `total`, `created`, `onlyEdited`, `errors`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.5_

  - [x]* 8.3 Escrever testes unitários para `ImportJob`
    - Testar fluxo feliz: todos os terms criados (201) e editados (200) → `created = N`
    - Testar terms já existentes: POST 400 duplicado + PATCH 200 → `onlyEdited = N`
    - Testar erros de criação (400 outro) → contabilizados em `errors`, job continua
    - Testar erro de autenticação (401/403) → job interrompido imediatamente
    - Testar cancelamento → resumo parcial com terms já processados
    - Testar que `progress.report()` é chamado após cada Term
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.5_

  - [x]* 8.4 Escrever property test de sequência de chamadas de API (Property 6)
    - **Property 6: Sequência correta de chamadas de API por Term**
    - Gerar listas de N Terms onde todas as criações retornam sucesso
    - Verificar que o job realiza uma listagem de unidades por idioma e exatamente N chamadas PATCH
    - **Validates: Requirements 4.1, 5.1**

  - [x]* 8.5 Escrever property test de correção do resumo final (Property 7)
    - **Property 7: Correção do resumo final**
    - Gerar execuções com distribuições arbitrárias de created/onlyEdited/errors
    - Verificar que `created + onlyEdited + errors === total` e cada Term está em exatamente uma categoria
    - **Validates: Requirements 6.3**

- [x] 9. Implementar entry point da extensão e orquestração
  - [x] 9.1 Implementar `extension.ts` com o comando `fastlate.importTranslations`
    - Criar `src/extension.ts` com `activate()` e `deactivate()`
    - Registrar o comando `fastlate.importTranslations` que orquestra o fluxo completo:
      1. `ConfigurationService.readConfiguration()` → exibir erro e retornar se inválido
      2. `vscode.window.showOpenDialog()` filtrado para `.csv` → retornar silenciosamente se cancelado
      3. `CsvParser.parseFile()` → exibir erro e retornar se falhar
      4. `PreviewPanel.show()` → retornar se usuário cancelar
      5. `vscode.window.withProgress()` executando `ImportJob.run()`
      6. Exibir resumo final via `vscode.window.showInformationMessage()` e no OutputChannel, incluindo chaves com erro quando houver
      7. Manter o PreviewPanel aberto depois que o usuário confirmar a importação
    - _Requirements: 1.1, 1.2, 2.1, 2.8, 6.3, 6.4, 9.4, 9.5, 9.6_

  - [x]* 9.2 Escrever testes de integração do fluxo completo
    - Testar fluxo completo com mock do `WeblateHttpClient` e arquivo CSV real
    - Testar cancelamento no diálogo de arquivo (retorno silencioso)
    - Testar cancelamento no Preview_Panel
    - Testar exibição do resumo final com contagens corretas
    - Testar exibição das chaves com erro no resumo final
    - Testar que o Preview_Panel permanece aberto após o envio
    - _Requirements: 2.8, 6.3, 9.5, 9.6_

- [x] 10. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao usuário se houver dúvidas.

- [x] 11. Implementar visualização lateral
  - [x] 11.1 Atualizar contribuições da extensão no `package.json`
    - Adicionar container Fastlate na Activity Bar
    - Adicionar view `fastlate.sidebar` do tipo webview
    - Ativar a extensão quando a view for aberta
    - _Requirements: 10.1, 10.2_

  - [x] 11.2 Implementar `FastlateSidebarProvider`
    - Criar `src/ui/FastlateSidebarProvider.ts`
    - Exibir resumo de configuração sem revelar o token, incluindo o estado de `defaultLanguage`
    - Adicionar ação para executar `fastlate.importTranslations`
    - Atualizar o HTML quando configurações `fastlate.*` mudarem
    - _Requirements: 10.3, 10.4, 10.5_

  - [x] 11.3 Escrever cobertura de teste para ativação e renderização da Sidebar_View
    - Verificar registro do provider na ativação
    - Verificar HTML de configuração pronta/incompleta
    - Verificar que o valor do token não aparece no HTML
    - _Requirements: 10.1, 10.2, 10.3_

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada tarefa referencia requisitos específicos para rastreabilidade
- Os checkpoints garantem validação incremental a cada fase
- Os property tests validam propriedades universais de corretude
- Os testes unitários validam exemplos específicos e casos de borda
- A biblioteca `fast-check` é usada para todos os property-based tests
- O `WeblateHttpClient` deve ser mockado nos testes do `ImportJob` para evitar chamadas reais à API

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 3, "tasks": ["5.1", "6.1", "8.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["8.2"] },
    { "id": 6, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2"] }
  ]
}
```
