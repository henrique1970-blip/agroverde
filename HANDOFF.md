# HANDOFF: Ordem de Serviço + Relatório de Operações (Fazenda Agro Verde)

**Estado em 08/10/2026.** Ler primeiro este topo e depois `ATUALIZACAO_out2026.md`, que traz o
detalhe das duas rodadas de outubro e os passos de publicação. A seção "Histórico (julho/2026)"
mais abaixo continua válida para os fatos técnicos.

## Situação em uma linha

A **1ª rodada** de outubro está no ar. A **2ª rodada** está pronta e testada no **PR #4**, ainda
**não integrado**, e depende de o usuário publicar os dois Apps Scripts e executar
`instalarAcionadores` em cada um.

## Onde as coisas estão

| | |
|---|---|
| Pasta de trabalho | `D:\projetos\lavoura`, clone git do repositório. A pasta antiga `D:\grupo bijsterveld\...\lavoura` ficou só como histórico e não foi alterada |
| Repositório | `github.com/henrique1970-blip/agroverde`: OS na raiz, RO em `ro/` |
| Sites publicados | `https://henrique1970-blip.github.io/agroverde/` e `.../agroverde/ro/` |
| Branch atual | `pdf-fila-arquivo-safra`, que é o PR #4 |
| Apps Script OS | `/exec` `AKfycbyS8G4Yar6...`, planilha `1vWqfkjNYD71...`, pasta de PDFs `13lV62jPEHN7...` |
| Apps Script RO | `/exec` `AKfycbznEdqNDvPH...`, planilha `1b8LMyDTfkqI...`, pasta de PDFs `1YeUqLtTnClJ...` |
| GitHub CLI | instalado e autenticado na conta `henrique1970-blip` (admin). **Fora do PATH das sessões antigas:** chamar como `"C:\Program Files\GitHub CLI\gh.exe"` e sempre com `--repo henrique1970-blip/agroverde` |
| Git | toda chamada precisa de `git -c safe.directory=*` (disco sem registro de dono). O push funciona com a credencial salva no Windows |

## 1ª rodada: publicada (merge `c9210eb`, 07/10/2026)

- **Site:** no ar, conferido.
- **Apps Scripts:** o usuário informou que publicou os dois. Conferi o da OS pela consulta em lote.
- **Template de Pulverização:** a função `atualizarTemplatePulverizacao` **não** foi executada. O
  script cria a coluna nova em cada PDF, então isso só custa um pouco de velocidade.
- **Conteúdo:**
  - dose por tanque por produto (dosagem × capacidade ÷ vazão), em coluna da tabela do PDF;
  - tela "Confira antes de enviar";
  - página e Service Worker não enviam mais a mesma OS ao mesmo tempo (trava Web Locks);
  - no RO, as colunas de controle saíram da grade e o ID do relatório é gerado no aparelho
    (reenvio não duplica);
  - consulta em lote `detalhes=1`.

## 2ª rodada: PR #4 aberto, NÃO integrado

**Conteúdo:**
- PDF gerado em segundo plano nos dois apps, numa fila na aba oculta `_fila_pdf`, processada por
  acionador.
- Pulverização com a tabela `Produto | Dose/ha | Dose/tanque`, na OS e no RO. A Dose/ha por
  produto é opcional.
- Campo **Safra** na OS.
- No RO: pré-carga das 6 atividades e lista sem as OS que já têm relatório (`pendentes=1`,
  exceto Colheita).
- Caixa **"Confirmado RT"** na planilha de relatórios. Ao marcar, o relatório e depois a OS vão
  para `Ordens emitidas/Safra AAAA-AA` e para a planilha `Arquivo - Safra AAAA-AA`.

**Decisões do usuário (08/10):**
- a coluna "Dosagem" vira "Dose/ha";
- a Safra é um campo na OS;
- o RT confirma pela caixa na planilha;
- a OS é arquivada junto com o relatório, quando o RT confirma, e não no envio do relatório.

**Pendente do usuário, nesta ordem:**
1. Colar `appsScript.js` no Apps Script da OS, publicar uma Nova versão e executar
   `instalarAcionadores`.
2. Colar `ro/appsScript.js` no Apps Script de Relatórios, publicar uma Nova versão e executar
   `instalarAcionadores`.
3. Pedir o merge do PR #4. Com o `gh` dá para fazer daqui:
   `gh.exe pr merge 4 --repo henrique1970-blip/agroverde --merge`.

Não verifiquei se os passos 1 e 2 já foram feitos.

**Riscos e limitações conhecidos (já avisados ao usuário):**
- Os dois Apps Scripts precisam ser da mesma conta, porque um lê a planilha do outro.
- Depois de arquivados, a OS e o relatório não podem mais ser editados pelos apps.
- Na Colheita, a OS só é arquivada depois da data de término prevista.
- Irrigação fica fora do arquivamento.
- Rollback: `PDF_EM_SEGUNDO_PLANO = false` em cada `appsScript.js`.
- Não testado no Google real: acionadores, `insertTable`, `moveTo` e as permissões entre projetos.
  Depois de publicar, vale fazer um teste de ponta a ponta: OS de Pulverização → relatório →
  marcar Confirmado RT → conferir a pasta da safra.

## Testes

São 12 conjuntos e **384 verificações, todas passando** em 08/10. Ficam fora do git. Para
rodar, primeiro `npm install` na raiz, depois:

```
node testes/test_app.mjs | test_app2 | test_app3 | test_appsscript | test_pulverizacao | test_sw | test_fila_arquivo
cd ro/testes && node run_tests.js | run_frontend.js | run_offline.js [--lote] | run_out2026.js
```

- `test_fila_arquivo.mjs` roda **os dois Apps Scripts juntos** sobre o Google simulado em
  `testes/mundo_google.mjs`.
- Os testes antigos de backend forçam `PDF_EM_SEGUNDO_PLANO = false`, porque conferem o
  conteúdo do PDF.

## Fatos que custaram tempo (não redescobrir)

- **Heredoc com `\n` ou `\/` dentro de Python via Bash** corrompe o texto (vira quebra de linha
  ou dá aviso de escape). Para editar JS com regex, use a ferramenta Edit ou um `.py` gravado
  com Write.
- **PowerShell 5 quebra aspas dentro de `--body`** do `gh`. Use `--body-file`.
- **Chrome headless não reduz a largura abaixo de cerca de 500 px.** A captura de tela a 390 px
  parece cortada sem estar. Meça com `--dump-dom` antes de concluir que há overflow.
- `appsScript.js` da raiz e `ro/appsScript.js` usam **CRLF**. Os scripts de patch preservam
  isso; editar com LF infla o diff.
- **Login do `gh` não funciona via `!`**, porque não é interativo. Abra uma janela própria com
  `Start-Process powershell ... gh auth login --web`.

## Pendências fora do escopo

- **Anotações de 22/08/2025:** decimais com vírgula gravados como número na planilha e no PDF.
  Nunca foi feito.
- **Sugestões oferecidas, sem resposta do usuário:**
  - e-mail diário ao RT com os relatórios aguardando confirmação;
  - retirar o campo solto "Dose/ha". Já foi feito na 2ª rodada.

## Preferências do usuário

- Escreve em português e espera respostas em português.
- Prefere receber as entregas como pull request e pedir o merge depois.
- Pediu antes para não usar subagentes nem workflows sem pedir.

---

# Histórico (julho/2026)

Estado em 27/07/2026. Leia junto com `LEIA-ME_otimizacao.md` (detalhe técnico) e
`anotacoes.txt` (histórico do dono do projeto).

## Situação em uma linha (julho)

O pedido de `otimizar.md` (carregamento/PDF, offline, edição de OS) está **implementado e
testado**, mas **nada foi publicado ainda**. Falta o passo de implantação, que é do usuário.

## Onde as coisas estão

| | |
|---|---|
| Pasta de trabalho | `D:\grupo bijsterveld\outros\fluxos e processos\lavoura\ordem_servico\funcionando_github` |
| Repositório | `github.com/henrique1970-blip/agroverde` (branch `main`) |
| App publicado | `https://henrique1970-blip.github.io/agroverde/` |
| Apps Script (produção) | `AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA` |
| Planilha | `1vWqfkjNYD71bsea_mCY_WmmjUKZJzQaPzIThVyisp34` |
| Pasta de PDFs (Drive) | `13lV62jPEHN76jMl_rEr0IEzy12YwK754` |

**Não é um repositório git local** — a pasta é uma cópia solta; o versionamento acontece
direto no GitHub. Confira o remoto antes de assumir que o local está em dia (já esteve atrás:
faltava o local *Vanderleia* e o cache `v5`).

## PENDENTE — implantação (o usuário precisa fazer)

**a) GitHub, na raiz do repositório**

Subir: `index.html`, `script.js`, `service-worker.js`, `style.css`, `manifest.json`,
`offline.html`, `logo-fav.png`.

Apagar no remoto: `app.js` (280 KB — página do GitHub salva por engano, já apagada localmente)
e `logoFAVbase64.css` (92 KB — este app não usa mais; o app de Relatório de Operações tem a
cópia dele em `/ro/`, então apagar na raiz não o afeta).

**b) Planilha → Extensões → Apps Script**

Colar `appsScript.js` → adicionar o serviço **Google Docs API** (identificador `Docs`) →
Implantar → Gerenciar implantações → editar a atual → **Nova versão**. A URL `/exec` não muda.

Sem esse passo a **edição de OS não funciona** (o app avisa e continua registrando normalmente).
O resto da otimização funciona só com o item (a).

**Conferir depois de publicar:** F12 → Application → Service Workers deve mostrar *activated*
(antes não aparecia nada); registrar uma OS (a tela volta na hora, o aviso do PDF vem depois);
modo avião + registrar + fechar + voltar o sinal (a OS sobe sozinha); editar uma OS existente.

## O que foi feito (resumido)

1. **Carregamento/PDF** — logo saiu de um `@import` de 92 KB em base64 para `logo-fav.png`
   de 18 KB; `preconnect` para o Google; envio não bloqueante com timeout de 90 s e recuo
   exponencial. No servidor: ~40 chamadas ao Docs viraram **uma** `Docs.Documents.batchUpdate`
   (com queda automática para o caminho antigo se a API não estiver habilitada), e a
   reformatação de 3 colunas × 1000 linhas que rodava a cada OS agora só roda na criação da aba.
2. **Offline** — grava no aparelho antes de enviar; sincronização dentro do Service Worker;
   contador de pendências; `offline.html`; migração automática da fila antiga; upsert por ID
   no servidor (reenvio não duplica OS).
3. **Edição** — botão na tela inicial, lista com busca, formulário reaberto preenchido
   (talhões, área, produtos, caminhões), ID preservado, linha atualizada no lugar, PDF refeito
   e o antigo mandado para a lixeira.

## Fatos que custaram tempo para descobrir (não redescubra)

- **Causa raiz do offline nunca ter funcionado:** o registro apontava para `/service-worker.js`
  (raiz do domínio), mas o app fica em `/agroverde/` → **404**, worker jamais instalado. A lista
  de precache tinha o mesmo defeito. Hoje é tudo caminho relativo. *Qualquer caminho absoluto
  que voltar a aparecer quebra o offline de novo.*
- **O `appsScript.js` desta pasta estava desatualizado** (versão antiga, sem geração de PDF).
  A versão que corresponde ao que está implantado é
  `relatorio_atividades/2 - 26jul2025/appsScript.js` — confirmei consultando o `/exec` real.
  Foi dela que parti para reescrever.
- **Os nomes de `/ro` colidem com os desta pasta** (`index.html`, `script.js`, `style.css`,
  `service-worker.js`, `manifest.json`, os dois ícones, `logoFAVbase64.css`). Baixar `/ro`
  direto para cá sobrescreve o app. Use sempre uma subpasta.
- **Dois apps, dois Apps Scripts.** O de Relatório de Operações (`/ro/`, pasta
  `relatorio_atividades/funcionando integralmente`) consome o `/exec` deste. O contrato antigo
  (`?activity=` e `?activity=&osId=`) foi preservado e é testado — **não mexa nele**. O Service
  Worker ignora `/ro/`.
- O `/exec` responde a `GET` sem autenticação: dá para inspecionar o formato real com `curl`
  antes de supor qualquer coisa.

## Testes

`testes/` — 108 asserções, todas passando, sem tocar na planilha ou no Drive de verdade.
Veja `testes/COMO_RODAR.md`. Rodar depois de qualquer mudança em `script.js` ou `appsScript.js`.

## Pendências conhecidas (fora do escopo deste pedido)

- `anotacoes.txt`, item 2 de 22/08/2025: decimais com "ponto" deveriam virar "vírgula" e ser
  gravados como número na planilha e no PDF. **Nunca foi feito** e continua pendente.
- `relatorioOperacoes_backup.zip` (270 KB) é backup dos 16 arquivos de `/ro` baixados em
  27/07/2026 — só arquivo morto, não subir.
- Não subir para o GitHub: `HANDOFF.md`, `LEIA-ME_otimizacao.md`, `anotacoes.txt`,
  `otimizar.md`, `testes/`, `relatorioOperacoes_backup.zip`.

## Preferências observadas do usuário

Escreve em português; espera respostas em português. Trabalha por pastas numeradas com data
(`14 - formulario_22ago2025`, `15 - 13jan2026`) em vez de git. Pediu explicitamente para eu não
usar subagentes/workflows sem que ele peça.
