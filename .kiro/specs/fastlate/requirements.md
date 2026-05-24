# Requirements Document

## Introduction

A extensão VSCode **Fastlate** automatiza o processo de importação de termos de tradução para o servidor Weblate. O usuário seleciona uma planilha (Excel ou CSV) contendo termos e suas traduções, e a extensão envia requisições HTTP ao servidor Weblate para criar cada termo e, em seguida, editá-lo com o conteúdo traduzido. O objetivo é eliminar o trabalho manual repetitivo de cadastrar termos de tradução um a um na interface do Weblate.

## Glossary

- **Extension**: A extensão VSCode Fastlate
- **Spreadsheet**: Arquivo de planilha no formato Excel (.xlsx, .xls) ou CSV (.csv) contendo termos de tradução
- **Term**: Um par chave-valor representando um termo de tradução (ex.: chave `button.save`, valor `Salvar`)
- **Weblate**: Servidor de gerenciamento de traduções acessado via API REST
- **Weblate_API**: A API REST do servidor Weblate utilizada para criar e editar termos
- **Import_Job**: O processo completo de leitura da planilha e envio dos termos ao Weblate
- **Term_Status**: Classificação de cada Term ao final do Import_Job — pode ser "criado" (chave nova criada e editada com sucesso), "somente editado" (chave já existia, apenas editada) ou "erro" (falha na criação ou edição)
- **Parser**: Componente responsável por ler e interpretar arquivos de planilha
- **HTTP_Client**: Componente responsável por enviar requisições HTTP ao Weblate_API
- **Progress_Indicator**: Elemento de UI do VSCode que exibe o progresso do Import_Job ao usuário
- **Configuration**: Conjunto de parâmetros necessários para conectar ao Weblate (URL, token de autenticação, projeto, componente e idioma padrão). O idioma padrão é obrigatório, é configurado em `fastlate.defaultLanguage`, deve existir como coluna no CSV, serve como idioma fonte das chaves e é o único idioma que realiza criação via `POST`.
- **Language_Header**: As duas primeiras linhas da planilha que definem o idioma — linha 1 contém o nome do idioma (ex.: `Português`) e linha 2 contém o código do idioma (ex.: `pt`)
- **Preview_Panel**: Painel do VSCode que exibe os dados lidos da planilha antes de iniciar o Import_Job, permitindo ao usuário confirmar os valores antes do envio
- **Sidebar_View**: Visualização lateral do VSCode na Activity Bar que mostra o estado da configuração e oferece acesso direto ao fluxo de importação

---

## Requirements

### Requirement 1: Configuração da Conexão com o Weblate

**User Story:** Como desenvolvedor, quero configurar a URL e as credenciais do servidor Weblate nas configurações da extensão, para que a extensão possa se autenticar e enviar termos ao servidor correto.

#### Acceptance Criteria

1. WHEN o Import_Job for iniciado, THE Extension SHALL ler as configurações de conexão não sensíveis (URL base do servidor, nome do projeto, nome do componente e idioma padrão) a partir das configurações do VSCode (`settings.json`) e o token de autenticação a partir do `SecretStorage` do VSCode.
2. IF qualquer configuração obrigatória estiver ausente ou contiver apenas espaços em branco, THEN THE Extension SHALL exibir uma mensagem de erro descritiva indicando qual configuração está faltando e interromper o Import_Job.
3. WHEN o Import_Job for iniciado, THE Extension SHALL validar que a URL base do servidor começa com `http://` ou `https://` e contém um host não vazio.
4. IF a URL base do servidor for inválida, THEN THE Extension SHALL exibir uma mensagem de erro descritiva identificando o valor inválido e interromper o Import_Job.
5. O token deve ser mantido em segurança no `SecretStorage` do VSCode, configurado por comando com input de senha, e nunca exibido ou registrado em logs.
6. WHEN o Import_Job for iniciado, THE Extension SHALL validar que `fastlate.defaultLanguage` contém um código de idioma não vazio, pois somente esse idioma pode realizar criação de chave via `POST`.

---

### Requirement 2: Seleção e Leitura da Planilha

**User Story:** Como desenvolvedor, quero selecionar um arquivo de planilha (CSV) pelo explorador de arquivos do VSCode, para que a extensão possa ler os termos de tradução a serem importados.

#### Acceptance Criteria

1. WHEN o usuário acionar o comando de importação, THE Extension SHALL abrir um diálogo de seleção de arquivo filtrado para os formatos `.csv`.
2. WHEN o usuário selecionar um arquivo cuja extensão corresponda aos formatos aceitos, THE Parser SHALL ler o arquivo e extrair os termos de tradução.
3. THE Parser SHALL interpretar a linha 1 da planilha como os nomes dos idiomas e a linha 2 como os códigos dos idiomas, sendo que as linhas de dados com os Terms começam a partir da linha 3.
4. THE Extension SHALL usar os códigos de idioma lidos da linha 2 da planilha (`Language_Header.code`) como idiomas alvo nas requisições ao Weblate.
5. WHEN o Parser processar um arquivo CSV, THE Parser SHALL detectar automaticamente o delimitador utilizado (vírgula `,` ou ponto-e-vírgula `;`).
6. IF o arquivo selecionado estiver corrompido ou não puder ser lido, THEN THE Parser SHALL retornar um erro descritivo e interromper o Import_Job.
7. IF o arquivo não contiver nenhum Term após a linha 2 (Language_Header), THEN THE Extension SHALL exibir uma mensagem informando que a planilha está vazia e interromper o Import_Job.
8. THE Parser SHALL produzir uma lista de Terms com chave e valor não nulos para todos os arquivos de planilha válidos.
9. IF o usuário fechar o diálogo de seleção de arquivo sem escolher um arquivo, THEN THE Extension SHALL cancelar silenciosamente o Import_Job sem exibir mensagem de erro.
10. IF a linha 1 ou a linha 2 da planilha estiver vazia, THEN THE Parser SHALL retornar um erro descritivo indicando que o Language_Header está ausente e interromper o Import_Job.

---

### Requirement 3: Mapeamento de Colunas da Planilha

**User Story:** Como desenvolvedor, quero que a extensão identifique automaticamente as colunas de chave e valor da planilha com base na estrutura padrão definida, para que não seja necessário configurar o mapeamento manualmente.

#### Acceptance Criteria

1. THE Parser SHALL suportar CSVs com coluna dedicada de chave na coluna A e colunas de idioma a partir da coluna B.
2. THE Parser SHALL suportar CSVs sem coluna dedicada de chave, onde todas as colunas a partir da coluna A são colunas de idioma.
3. WHEN a planilha não tiver coluna dedicada de chave, THE Extension SHALL identificar a chave de cada linha usando o valor da coluna cujo `Language_Header.code` corresponde a `fastlate.defaultLanguage`.
4. IF a planilha não contiver uma coluna cujo código corresponda a `fastlate.defaultLanguage`, THEN THE Extension SHALL exibir o erro "Coluna com idioma padrão não encontrada" e interromper o Import_Job antes de qualquer chamada ao Weblate.
5. WHEN uma linha da planilha (a partir da linha 3) possuir a chave vazia, THE Extension SHALL ignorar essa linha, registrar um aviso no canal de saída "Fastlate" incluindo o número da linha, e prosseguir para a próxima linha.
6. WHEN uma linha da planilha (a partir da linha 3) possuir todos os valores de idioma vazios, THE Extension SHALL ignorar essa linha, registrar um aviso no canal de saída "Fastlate" incluindo o número da linha, e prosseguir para a próxima linha.

---

### Requirement 9: Preview dos Dados Lidos da Planilha

**User Story:** Como desenvolvedor, quero visualizar os dados que foram lidos da planilha antes de iniciar a importação, para que eu possa confirmar que os valores estão corretos antes de enviá-los ao Weblate.

#### Acceptance Criteria

1. WHEN o Parser concluir a leitura de uma planilha válida, THE Extension SHALL exibir um Preview_Panel mostrando os idiomas declarados, a lista de Terms extraídos e a chave calculada para cada linha.
2. THE Preview_Panel SHALL exibir os Terms em formato de tabela com a coluna "Chave" e uma coluna de valor para cada idioma declarado.
3. THE Preview_Panel SHALL exibir o total de Terms lidos acima da tabela.
4. WHEN o Preview_Panel estiver visível, THE Extension SHALL apresentar dois botões de ação: "Importar" para iniciar o Import_Job e "Cancelar" para descartar a importação.
5. IF o usuário clicar em "Cancelar" no Preview_Panel, THEN THE Extension SHALL fechar o Preview_Panel e não iniciar o Import_Job.
6. IF o usuário clicar em "Importar" no Preview_Panel, THEN THE Extension SHALL fechar o Preview_Panel e iniciar o Import_Job com os Terms exibidos.
7. THE Preview_Panel SHALL ser somente leitura — o usuário não pode editar os valores exibidos.

---

### Requirement 10: Visualização lateral

**User Story:** Como desenvolvedor, quero acessar a importação pela barra lateral do VSCode, para que a extensão seja descobrível sem depender apenas da Command Palette.

#### Acceptance Criteria

1. THE Extension SHALL contribuir um container na Activity Bar do VSCode para a funcionalidade Fastlate.
2. THE Extension SHALL contribuir uma Sidebar_View dentro desse container.
3. WHEN a Sidebar_View for aberta, THE Extension SHALL exibir um resumo do estado da configuração obrigatória (`serverUrl`, token seguro, `project`, `component`) sem revelar o valor do token.
4. WHEN o usuário acionar a ação de importação na Sidebar_View, THE Extension SHALL executar o mesmo comando `fastlate.importTranslations`.
5. WHEN as configurações `fastlate.*` forem alteradas, THE Sidebar_View SHALL refletir o novo estado da configuração.

---

### Requirement 4: Criação de Termos no Weblate

**User Story:** Como desenvolvedor, quero que a extensão crie cada termo no Weblate via API, para que os termos fiquem disponíveis para tradução no servidor.

#### Acceptance Criteria

1. WHEN o Import_Job for iniciado com uma lista de Terms válida e a planilha contiver a coluna de `fastlate.defaultLanguage`, THE HTTP_Client SHALL enviar uma requisição POST ao endpoint de criação de termos do Weblate_API para cada Term da lista sequencialmente usando esse idioma.
2. THE HTTP_Client SHALL incluir o token de autenticação no cabeçalho `Authorization` de cada requisição.
3. WHEN o Weblate_API retornar status HTTP 201 para uma requisição de criação, THE Extension SHALL considerar o Term como criado com sucesso, marcá-lo como "criado" para o resumo final, e prosseguir para a etapa de edição.
4. IF o Weblate_API retornar status HTTP 400 com qualquer mensagem no corpo da resposta indicando que a chave já existe (ex.: contém "already exist", "Chave já criada" ou "Chave já existe"), THEN THE Extension SHALL registrar um aviso, marcar o Term como "já existente", não contabilizá-lo como erro, e prosseguir diretamente para a etapa de edição do Term.
5. IF o Weblate_API retornar status HTTP 400 por outro motivo que não seja chave já existente, THEN THE Extension SHALL registrar o erro com a chave do Term e o motivo, contabilizá-lo como erro no resumo final, e prosseguir para o próximo Term sem interromper o Import_Job.
6. IF o Weblate_API retornar status HTTP 401 ou 403, THEN THE Extension SHALL interromper o Import_Job imediatamente e exibir uma mensagem de erro de autenticação.
7. IF o Weblate_API retornar status HTTP 5xx para uma requisição de criação, THEN THE HTTP_Client SHALL aplicar a lógica de retentativa definida no Requisito 7 antes de registrar o erro e prosseguir para o próximo Term.
8. IF a planilha não contiver a coluna de `fastlate.defaultLanguage`, THEN THE Extension SHALL interromper a importação antes de enviar qualquer requisição ao Weblate.

---

### Requirement 5: Edição de Termos no Weblate

**User Story:** Como desenvolvedor, quero que a extensão edite cada termo recém-criado no Weblate com o valor de tradução da planilha, para que o conteúdo traduzido seja salvo no servidor.

#### Acceptance Criteria

1. WHEN um Term for marcado como "criado" (HTTP 201) ou "já existente" (HTTP 400 com chave duplicada), THE HTTP_Client SHALL enviar uma requisição PATCH ao endpoint de edição do Term no Weblate_API com o valor de tradução.
2. THE HTTP_Client SHALL incluir o token de autenticação no cabeçalho `Authorization` de cada requisição de edição.
3. WHEN o Weblate_API retornar status HTTP 200 para uma requisição de edição, THE Extension SHALL considerar o Term como importado com sucesso.
4. IF o Weblate_API retornar status HTTP 404 para uma requisição de edição, THEN THE Extension SHALL registrar o erro com a chave do Term, contabilizá-lo como erro no resumo final, e prosseguir para o próximo Term.
5. IF o Weblate_API retornar status HTTP 401 ou 403 durante a edição, THEN THE Extension SHALL interromper o Import_Job imediatamente e exibir uma mensagem de erro de autenticação.
6. IF o Weblate_API retornar status HTTP 400 ou qualquer status não previsto durante a edição, THEN THE Extension SHALL registrar o erro com a chave do Term e o código de status recebido, contabilizá-lo como erro no resumo final, e prosseguir para o próximo Term.

---

### Requirement 6: Controle de Progresso e Feedback ao Usuário

**User Story:** Como desenvolvedor, quero visualizar o progresso da importação em tempo real no VSCode, para que eu saiba quantos termos foram processados e se houve erros.

#### Acceptance Criteria

1. WHEN o Import_Job for iniciado, THE Progress_Indicator SHALL exibir uma barra de progresso com o total de Terms a serem processados.
2. WHILE o Import_Job estiver em execução, THE Progress_Indicator SHALL atualizar o contador de Terms processados após a conclusão de todas as etapas de API (criação e edição) de cada Term.
3. WHEN o Import_Job for concluído, THE Extension SHALL exibir um resumo em uma notificação do VSCode e no canal de saída "Fastlate" contendo:
   - Total de Terms processados
   - Total de Terms **criados** (chave nova, criada via POST com sucesso + editada via PATCH)
   - Total de Terms **somente editados** (chave já existia, detectada pelo erro de chave duplicada no POST + editada via PATCH com sucesso)
   - Total de Terms com **erro** (falhas que impediram a criação ou edição)
   - Chaves que tiveram erro, quando houver pelo menos uma falha
4. THE Extension SHALL registrar todos os erros e avisos no canal de saída dedicado chamado "Fastlate" no painel Output do VSCode.
5. WHEN o usuário cancelar o Import_Job, THE Extension SHALL aguardar a conclusão das requisições em andamento, interromper o envio de novas requisições, e exibir um resumo parcial dos Terms já processados.
6. WHEN o usuário confirmar a importação no Preview_Panel, THE Extension SHALL manter o painel aberto após iniciar e concluir o envio dos Terms.

---

### Requirement 7: Tratamento de Erros de Rede

**User Story:** Como desenvolvedor, quero que a extensão trate falhas de rede de forma resiliente, para que erros temporários não interrompam toda a importação.

#### Acceptance Criteria

1. IF uma requisição ao Weblate_API falhar por timeout (após 10 segundos sem resposta) ou erro de conexão, THEN THE HTTP_Client SHALL retentar a requisição até 3 vezes com intervalo de 2 segundos entre as tentativas.
2. IF todas as 3 tentativas de uma requisição falharem, THEN THE Extension SHALL registrar no canal "Fastlate" a chave do Term, o motivo do erro e o número de tentativas realizadas, e prosseguir para o próximo Term.
3. IF o servidor Weblate estiver inacessível no início do Import_Job, THEN THE Extension SHALL exibir uma mensagem de erro de conectividade e interromper o Import_Job antes de processar qualquer Term.
4. WHILE o Import_Job estiver em execução, IF o servidor Weblate se tornar inacessível, THEN THE HTTP_Client SHALL continuar processando os Terms restantes aplicando a lógica de retentativa (critério 1) e de registro de falha definitiva (critério 2) deste requisito.

---

### Requirement 8: Parser Round-Trip (Integridade da Leitura)

**User Story:** Como desenvolvedor, quero garantir que os dados lidos da planilha sejam íntegros e não sofram transformações indesejadas, para que os termos importados no Weblate correspondam exatamente ao conteúdo da planilha.

#### Acceptance Criteria

1. THE Parser SHALL preservar o valor exato de cada célula da planilha sem aplicar nenhuma transformação, incluindo espaços em branco, capitalização, caracteres especiais e quebras de linha.
2. THE Parser SHALL garantir que a chave e o valor de cada Term correspondam ao conteúdo byte a byte das células correspondentes na planilha original para todos os arquivos de planilha válidos.
3. WHEN o Parser processar um arquivo CSV, THE Parser SHALL decodificar corretamente arquivos nos encodings UTF-8 e UTF-8 com BOM, removendo o BOM do conteúdo decodificado antes de extrair os valores das células.
4. THE Parser SHALL ler valores de células Excel formatadas como texto como a string exata exibida, como número como a representação em string preservando todos os dígitos significativos, e como data como a string de exibição formatada da célula, para todos os arquivos Excel válidos.
5. WHEN o Parser encontrar uma célula Excel contendo uma fórmula, THE Parser SHALL ler o valor computado da fórmula, não a expressão da fórmula em si.
