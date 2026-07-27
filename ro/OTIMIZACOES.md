# Relatório de Operações — otimizações

Base: `henrique1970-blip/agroverde`, branch `main`, pasta `ro` (conferida contra o
repositório: os 16 arquivos batem com o backup local).

---

## Como publicar

### 1. Arquivos do site (pasta `ro/` do repositório)

**Substituir:** `index.html`, `style.css`, `script.js`, `service-worker.js`,
`manifest.json`, `favicon.ico`, `appsScript.js`

**Adicionar:** `logo-fav.webp`, `logo-fav.png`, `apple-touch-icon.png`

**Apagar:** `logoFAVbase64.css` — foi substituído pelo `logo-fav.webp`. Nada mais
o referencia.

Os demais arquivos do repositório (`anotacoes.txt`, `campos_repetidos.png`,
`relop.js`, `relatorio.html`, `relatorio_teste.html`, ícones) não foram tocados.
Vale notar que `relop.js` é uma versão antiga do Apps Script, com IDs de template
por preencher; não é usada por nada.

### 2. Apps Script

Cole o novo `appsScript.js` no projeto do Apps Script **de Relatórios** e
reimplante (Implantar > Gerenciar implantações > editar > Nova versão).

**Passo que vale os 30 segundos:** no editor do Apps Script, menu lateral
**Serviços (+) > Google Docs API > Adicionar** (o identificador precisa ficar
`Docs`). É o que ativa a geração de PDF em lote.

Sem esse passo o sistema continua funcionando normalmente — o código detecta a
ausência e volta ao método antigo, só mais lento.

### 3. Primeira abertura

O service worker novo assume o controle sozinho e limpa os caches antigos. Se
algum aparelho ficar exibindo a versão velha, basta fechar e reabrir o app.

---

## 1. Carregamento

| | antes | depois |
|---|---|---|
| Peso da primeira abertura (gzip) | 102 KB | **47 KB** (−54%) |
| Sem compressão | 348 KB | **115 KB** (−233 KB) |
| Requisições bloqueando a renderização | 2 encadeadas | **1** |
| Lista de OS na 2ª visita | ~430 ms (medido com 400 ms de latência) | **9 ms** |

O que mudou:

- **A logo saiu de um CSS de 92 KB em base64 para um WebP de 20 KB.** Ela era
  carregada por um `@import` dentro do `style.css`, o que criava uma cascata: o
  navegador só descobria que precisava dos 92 KB depois de baixar e ler o CSS.
  Agora é um arquivo de imagem comum, com `preload` no `<head>` e PNG de reserva.
- **`favicon.ico` de 195 KB → 5,7 KB.** Era uma imagem de 185×256 embutida num
  `.ico`; virou um ícone multi-resolução normal (16/32/48).
- **`preconnect` para `script.google.com` e `script.googleusercontent.com`.** As
  conexões TLS passam a abrir durante a leitura do HTML, e não só no primeiro
  `fetch`. Numa rede móvel de lavoura isso costuma valer algumas centenas de ms.
- **Cache das Ordens de Serviço (stale-while-revalidate).** A tela abre com a
  lista da última visita e se atualiza sozinha em segundo plano. Antes toda troca
  de atividade era uma espera em branco.
- **Timeout e cancelamento nas requisições.** Um `fetch` sem resposta travava a
  tela indefinidamente; agora há limite de 25 s (consultas) e 3 min (envio).
- **Corrigido:** cada troca de atividade acrescentava mais um `addEventListener`
  ao mesmo container de OS. Na quinta atividade aberta, um clique disparava cinco
  buscas idênticas. O listener agora é registrado uma única vez.

## 2. Geração de PDF

A causa dos 15–30 s era o laço que chamava `body.replaceText()` uma vez por
placeholder — cerca de **70 idas e voltas ao servidor do Docs, em série**, para
gerar um documento só.

Agora as substituições vão todas num único `Docs.Documents.batchUpdate()`.
Confirmado no teste automatizado: **1 chamada em lote no lugar de 63**.

Outras reduções no mesmo caminho:

- `makeCopy(nome, pasta)` já nomeia o arquivo na cópia (era cópia + `setName()`);
- as URLs do PDF e da pasta são montadas a partir do ID, sem consultar o Drive;
- o `DocumentApp` só é aberto nas atividades que realmente têm tabela de
  abastecimentos (Tratamento de Sementes, por exemplo, não abre mais);
- `LockService` impede que dois envios simultâneos criem colunas de
  abastecimento um por cima do outro e desalinhem a linha.

Ganho colateral: o `replaceAllText` do Docs alcança **cabeçalho e rodapé** do
documento, coisa que o `body.replaceText()` não fazia.

### Dois defeitos corrigidos de quebra

- **Datas trocando de mês.** `parseDateForSheet("12/08/2025")` passava a string
  direto por `new Date()`, que lê no formato americano — 12 de agosto era gravado
  como **8 de dezembro**. O padrão dd/MM/yyyy agora é testado antes.
- **Placeholder cru no PDF.** Quando o relatório não tinha nenhum abastecimento,
  a linha-modelo da tabela não era removida e o PDF saía impresso com
  `{{HorimetroAbastecimento}}`.

## 3. Funcionamento offline

**O service worker nunca chegava a ser registrado.** Não havia nenhuma chamada a
`navigator.serviceWorker.register()` no projeto — o arquivo existia, mas o
navegador jamais o carregava. Nada funcionava offline.

E, mesmo se fosse registrado, não teria instalado: a lista de precache usava
caminhos absolutos (`/index.html`, `/style.css`) enquanto o app é servido em
`/agroverde/ro/`. Como `cache.addAll()` é tudo-ou-nada, um 404 abortava a
instalação inteira.

Corrigido e ampliado:

- registro do service worker, com caminhos relativos;
- **o envio da fila passou a acontecer dentro do service worker**, lendo o
  IndexedDB direto. Antes ele apenas mandava um `postMessage` para as abas
  abertas — e ninguém escutava essa mensagem no `script.js`. Quando o sinal
  voltava com o app fechado (o caso normal), o relatório ficava preso no
  aparelho para sempre;
- `await tx.done` não existe na API nativa do IndexedDB: a promessa resolvia
  imediatamente e o "salvo com sucesso" aparecia antes da gravação. Agora as
  transações são aguardadas de verdade;
- faixa de aviso mostrando **"sem conexão"** e **"N relatórios aguardando envio"**,
  com botão *Enviar agora*;
- reenvio automático no evento `online`, na abertura do app e via Background Sync;
- estando offline, o app **nem tenta** o envio: salva na hora e libera o operador,
  em vez de deixá-lo esperando um `fetch` condenado;
- as OS ficam em cache, então dá para **preencher um relatório inteiro sem sinal**.
  Antes, sem rede a lista de OS falhava e o fluxo morria ali;
- estratégia por tipo de arquivo: HTML pela rede primeiro (com o cache de
  reserva) e estáticos pelo cache com revalidação. O "cache primeiro para tudo"
  anterior congelaria o app numa versão antiga.

### Convivência com o app de Ordem de Serviço (raiz do site)

O Cache Storage é compartilhado por **origem**, não por escopo: este service
worker (`/agroverde/ro/`) e o do app de Ordem de Serviço (`/agroverde/`)
enxergam exatamente os mesmos caches.

O `activate` daqui limpa versões antigas filtrando pelo prefixo `agro-relop-`.
Se apagasse "tudo que não é meu" — como fazia o rascunho inicial — derrubaria o
`agro-os-v6`, que é o cache offline do app de Ordem de Serviço.

**Pendência do outro lado, fora do escopo desta entrega:** o
`service-worker.js` da **raiz** do repositório ainda faz a limpeza sem filtro:

```javascript
const names = await caches.keys();
await Promise.all(names.map(name => (name !== CACHE_NAME ? caches.delete(name) : null)));
```

Toda vez que aquele service worker for atualizado, ele apaga o `agro-relop-v4`
e o app de Relatório deixa de abrir offline até ser aberto uma vez com sinal.
**Nenhum relatório é perdido** — a fila de envios pendentes fica no IndexedDB,
que não é tocado. A correção é de uma linha:

```javascript
const CACHE_PREFIX = 'agro-os-';
await Promise.all(names.map(name =>
  (name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME) ? caches.delete(name) : null));
```

Não apliquei porque esse arquivo está na raiz, fora da pasta `ro`.

## 4. Edição de Relatório de Operações

Na tela inicial há agora um seletor **Nova operação / Consultar · Editar**. No
modo consulta, escolher a atividade lista os relatórios já enviados (mais
recentes primeiro), com link para o PDF e botão *Editar*.

O formulário de edição é o mesmo do envio, pré-preenchido: a grade de
confirmação já vem com "Não" marcado e o campo liberado nos itens em que o
realizado divergiu do planejado, e os horímetros, paradas e a tabela de
abastecimentos voltam com os valores gravados.

Ao salvar:

- a **linha existente é atualizada** na planilha (não gera duplicata);
- um **novo PDF é gerado** e o anterior vai para a lixeira do Drive;
- ficam registrados *Ultima Edicao* e *Editado Por*; o autor original é preservado.

Cinco colunas de controle são acrescentadas **à direita** de cada aba na primeira
gravação — `ID do Relatorio`, `ID do PDF`, `URL do PDF`, `Ultima Edicao`,
`Editado Por`. Nenhuma coluna existente é movida ou renomeada.

Relatórios gravados **antes** desta versão não têm `ID do Relatorio`; eles
continuam editáveis — o sistema os localiza pela posição da linha e preenche o ID
na primeira edição.

Uma restrição: editar exige conexão. Não faz sentido enfileirar a correção de um
relatório sem poder confirmar que a linha ainda existe. O app avisa em vez de
salvar em silêncio.

---

## Testes

Dois conjuntos automatizados foram executados antes da entrega:

- **Backend** (47 verificações): os serviços do Google foram simulados e o
  `appsScript.js` rodou de ponta a ponta — envio, listagem, carga para edição,
  gravação da edição, colheita com equipamento, registro legado sem ID e o
  caminho de reserva sem a Docs API.
- **Front-end** (56 verificações): o `index.html` e o `script.js` reais rodaram
  em DOM de verdade (jsdom) — fluxo novo, cache, envio, queda de conexão,
  reenvio automático da fila, consulta, edição e regravação.

Também foi verificado que todos os 34 campos de OS fecham o ciclo
planilha → tela → planilha sem perder nem trocar rótulo, em todas as seis
atividades.

O que **não** foi testado por não haver acesso: a execução real dentro do Google
Apps Script (tempo efetivo do `batchUpdate` com os templates de produção) e o
comportamento do service worker num navegador real. Recomendo um envio de teste
por atividade antes de liberar para o pessoal de campo.
