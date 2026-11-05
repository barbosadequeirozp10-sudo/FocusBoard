# FocusBoard 2.0 — Gerenciador de tarefas

Aplicação web responsiva para organizar atividades em um quadro **Kanban**, visualizar uma lista e acompanhar indicadores de produtividade.

> Projeto educacional feito com auxílio de IA. Seu objetivo é permitir estudo, testes e evolução do código. Não é um serviço hospedado com contas de usuários.

## Abrir agora (sem instalar nada)

1. Abra `index.html` no Chrome, Edge ou Firefox.
2. Clique em **＋ Nova tarefa** para criar uma atividade.
3. Use o menu de status no cartão ou arraste entre as colunas.
4. Clique em **Dashboard** para visualizar estatísticas.

**Alternativa:** use o arquivo avulso `FocusBoard_2.0_UM_ARQUIVO.html` do pacote. Ele contém HTML, CSS e JS juntos e também funciona offline.

## Recursos

- Criar, editar e excluir tarefas, com confirmação para exclusão.
- Quadro Kanban com arrastar e soltar no desktop e seleção de status no celular.
- Prioridade, descrição, categoria e data de vencimento.
- Busca por título, descrição ou categoria; filtros por prioridade e prazo.
- Tarefas atrasadas e indicadores gerais.
- Visualização em lista ordenada por prazo e dashboard com gráficos de barras.
- Backup em **JSON**: exportar e **importar/restaurar** (a importação substitui os dados atuais após confirmação).
- Tema escuro e claro, design responsivo e navegação acessível por teclado.
- Dados salvos automaticamente via `localStorage`.
- Botão **Carregar exemplo** para adicionar 4 tarefas demonstrativas, sem cadastrar dados de teste automaticamente.

## Tecnologias

- **HTML5:** estrutura semântica, formulários e modais.
- **CSS3:** cores, responsividade, gráficos e temas.
- **JavaScript puro:** eventos, lógica, filtros, drag-and-drop e armazenamento.
- **localStorage:** persistência local, sem dependências externas.

## Estrutura

```text
FocusBoard_2.0/
├── index.html         Interface
├── styles.css         Aparência e responsividade
├── app.js             Regras e interações
├── README.md          Documentação
├── .gitignore         Exclusões do Git
└── tests/
    └── core.test.cjs  Testes opcionais para lógica JavaScript
```

## Testes (opcionais)

Com Node.js 18+ instalado, rode na pasta do projeto:

```bash
node --test tests/core.test.cjs
```

O teste automático cobre funções independentes da interface, como validação de tarefas, filtros, data local, backup e indicadores. Testes visuais e de interação no navegador devem ser feitos separadamente.

## Publicar no GitHub Pages

Envie `index.html`, `styles.css` e `app.js` na raiz do repositório. Depois, em **Settings → Pages**, escolha **Deploy from a branch → main → / (root)**. O site é estático, sem servidor.

## Limitações importantes

- Os dados ficam **somente no navegador/dispositivo atual**. Sem login, sincronização ou banco em nuvem.
- Apagar o armazenamento do navegador pode remover as tarefas. Use **Exportar** para guardar backups e **Importar backup** para restaurar.
- `localStorage` em arquivos `file://` pode ter comportamento diferente conforme o navegador. Se ele bloquear, o aplicativo avisa e permite uso temporário sem garantia de persistência. Hospedagem estática via GitHub Pages costuma oferecer uma origem estável.
- Não use este aplicativo para armazenar senhas ou outros dados sensíveis.

## Ideias para versões futuras

Autenticação, banco de dados remoto, sincronização, testes de interface e histórico de produtividade.

**Transparência:** código elaborado com assistência de IA, adequado para aprender a ler, testar, modificar e explicar os componentes de um projeto web.
