# Atualização de outubro/2026: Ordem de Serviço + Relatório de Operações

Pasta de trabalho: `D:\projetos\lavoura`, um clone de `github.com/henrique1970-blip/agroverde`.
O app de OS fica na raiz e o de Relatório de Operações em `ro/`.

> **Nada foi publicado.** As alterações estão só nesta pasta. A publicação tem três passos,
> descritos no fim deste documento.

---

## 1. Ordem de Serviço

### Dose por tanque (Pulverização)

**A fórmula pedida foi corrigida.** A dose por tanque é a dosagem **multiplicada** pela área
que um tanque cobre, e não dividida:

```
área por tanque (ha) = capacidade do tanque (L) ÷ vazão (L/ha)
dose por tanque      = dosagem (por ha) × área por tanque (ha)
```

Exemplo com a OS real `P-AGROV-657c-`: 3000 L ÷ 100 L/ha = **30 ha por tanque**.
Roundup a 3 L/ha dá **90 L por tanque**. Pela divisão sairia 3 ÷ 30 = 0,1 L, o que não fecha
com as unidades: (L/ha) ÷ ha resulta em L/ha², e não em litros.

O que mudou:

- **Formulário.** O campo único "Dose/tanque" saiu. Cada produto mostra a própria dose por
  tanque enquanto é digitado, e abaixo da vazão aparece a "Área por tanque".
- **PDF.** A tabela "Produtos Utilizados" ganhou a 3ª coluna **Dose/tanque**, e a linha
  "Dose/tanque: …" que ficava abaixo da tabela foi retirada. Se o template ainda tiver só
  2 colunas, o script cria a coluna na cópia de cada PDF, sem mexer no template.
- **Planilha.** A coluna "Dose/tanque" passa a guardar a lista por produto, por exemplo
  `Roundup: 90 l; Óleo: 15 l; Adjuvante: 4,5 l;`.
- A unidade digitada na dosagem é mantida: `3 l/ha` vira `90 l` e `200 ml/ha` vira `6000 ml`.
  Quando a dosagem não é por hectare (como `200 ml/100 L`), a dose por tanque fica em branco,
  para não sair um número errado no PDF.
- Quem calcula o valor gravado é o servidor (`appsScript.js`). A tela só mostra o mesmo
  cálculo. Com isso, OS que ficaram na fila de um celular com a versão antiga também saem
  certas.

### Edição

- **(a) Antes do envio:** ao tocar em "Registrar", aparece a tela **"Confira antes de
  enviar"** com o resumo da OS e a tabela de produtos. O botão **Corrigir** volta ao
  formulário preenchido. **Confirmar** grava e envia. Enquanto estiver na fila do aparelho
  (sem sinal), a OS continua editável em "Editar Ordem de Serviço".
- **(b) Depois do envio:** já existia desde julho e está funcionando em produção (conferido
  no `/exec` em 07/10/2026). A OS é atualizada na mesma linha da planilha, o PDF é refeito e
  o anterior vai para a lixeira.

### Offline e velocidade

- **PDF em dobro corrigido.** Logo depois de "Registrar", a página e o Service Worker
  enviavam a mesma OS ao mesmo tempo. Eram duas execuções no Apps Script e, às vezes, dois
  PDFs na pasta. Agora os dois usam uma trava comum (Web Locks) e só um envia. Isso também
  alivia o servidor.
- **Correção durante o envio.** Antes, se a OS fosse corrigida enquanto subia, a fila
  apagava a correção. Uma falha de envio também podia regravar a versão antiga por cima. As
  duas situações foram corrigidas.
- O cache do app subiu para `agro-os-v7`, e o aparelho recebe a versão nova sozinho com o
  aviso "Nova versão disponível".
- No servidor foi incluído `?activity=X&detalhes=1`, que devolve todas as OS de uma aba numa
  resposta só (veja o RO abaixo). O contrato antigo continua igual.

## 2. Relatório de Operações (`ro/`)

- **Colunas que não eram dados da OS.** Desde a edição de OS, a planilha tem "PDF ID", "PDF
  URL" e "Atualizado em", e o RO mostrava os três como itens a confirmar. Agora eles não
  aparecem nem vão no envio.
- **Dose/tanque** chega como lista por produto e é tratada como texto na tela, na planilha e
  no PDF. OS antigas, que têm um número nesse campo, continuam formatadas como número.
- **Relatório sem duplicata.** Cada relatório novo recebe um ID gerado no aparelho
  (`REL-XXXXXXXX`). Se o envio chegar ao servidor mas a resposta se perder (timeout de 3 min
  em rede ruim), o reenvio da fila é reconhecido e não cria outra linha nem outro PDF. Página
  e Service Worker usam a mesma trava, como na OS. Relatórios que já estão na fila de algum
  aparelho, sem ID, continuam sendo aceitos.
- **Offline automático.** Com sinal, se as OS baixadas tiverem mais de 12 h, o app as baixa
  de novo em segundo plano, 4 s depois de abrir. O botão "Baixar Ordens de Serviço" continua
  disponível.
- **Mais rápido.** Com o `detalhes=1` publicado no Apps Script da OS, o "Baixar OS para uso
  offline" passa de uma requisição por OS para uma por atividade: 6 no total, contra 89
  hoje, já que a planilha tem 89 OS.
- Cache `agro-relop-v5`.

## 3. Testes

São 11 conjuntos e 308 verificações, todos passando em 07/10/2026. Nenhum deles toca a
planilha ou o Drive de verdade.

```
npm install                       # uma vez, na raiz D:\projetos\lavoura (jsdom + fake-indexeddb)

node testes/test_app.mjs          # OS: fluxo normal + edição
node testes/test_app2.mjs         # OS: migração da fila antiga, falhas de rede
node testes/test_app3.mjs         # OS: dose/tanque ao vivo, revisão, trava, edição durante envio   (novo)
node testes/test_appsscript.mjs   # OS: servidor
node testes/test_pulverizacao.mjs # OS: tabela de 3 colunas no PDF, template, detalhes=1           (novo)
node testes/test_sw.mjs           # OS: sincronização do Service Worker                            (novo)

cd ro/testes
node run_tests.js                 # RO: servidor
node run_frontend.js              # RO: tela
node run_offline.js [--lote]      # RO: cenário offline
node run_out2026.js               # RO: colunas de controle, Dose/tanque texto, ID do aparelho     (novo)
```

O `test_pulverizacao.mjs` roda o `appsScript.js` sobre um Google Docs simulado com a
estrutura real do template de Pulverização (baixado do Docs em 07/10/2026). Ele confere a
tabela que sai no PDF, linha por linha.

**O que não foi testado:** a execução dentro do Google (Apps Script de verdade e
`appendTableCell` no template real) e o Service Worker num celular. Depois de publicar, faça
uma OS de Pulverização de teste.

---

## Como publicar

**a) GitHub**: enviar os arquivos alterados:

| Raiz (app de OS) | `ro/` (Relatório de Operações) |
|---|---|
| `script.js`, `service-worker.js`, `style.css`, `appsScript.js` | `script.js`, `service-worker.js`, `appsScript.js` |

Não subir `testes/`, `ro/testes/`, `node_modules/`, `package.json` nem `_preview.html`. O
`.gitignore` já exclui esses itens.

**b) Apps Script da planilha "FAV - Ordem de Serviço"**: colar o `appsScript.js` da raiz e
ir em Implantar → Gerenciar implantações → editar → **Nova versão**. A URL `/exec` não muda.

- *Opcional, recomendado:* no editor, escolher a função **`atualizarTemplatePulverizacao`** e
  clicar em **Executar** uma vez. Ela grava a 3ª coluna no próprio template, o PDF fica um
  pouco mais rápido e o visual da coluna pode ser ajustado à mão no Google Docs. Rodar de
  novo não faz nada.

**c) Apps Script de Relatórios**: colar o `ro/appsScript.js` e publicar uma **Nova versão**
da mesma forma.

A ordem recomendada é b → c → a, servidores antes do site. Se o site for publicado antes, o
RO continua funcionando: o ID do aparelho é ignorado pelo servidor antigo, e só se perde a
proteção contra duplicata até o passo c.

**Conferir depois de publicar:**

1. Abrir o app de OS e aceitar "Nova versão disponível". Em Pulverização com 3000 L e
   100 L/ha, um produto a 3 L/ha deve mostrar 90 l.
2. Registrar e conferir que a tela de revisão aparece. Testar o "Corrigir".
3. No PDF, conferir a tabela com 3 colunas e a ausência da linha "Dose/tanque" embaixo. A
   pasta deve ter um PDF só por OS.
4. No RO, abrir essa OS. A grade não deve listar PDF ID, PDF URL nem Atualizado em, e
   Dose/tanque deve aparecer como lista.

---

# 2ª rodada (07/10/2026): PDF em segundo plano, Safra, confirmação do RT e arquivo

## O que muda para quem usa

| | Antes | Agora |
|---|---|---|
| Enviar OS ou relatório | esperava o PDF, de 10 s a 3 min | responde em 1 a 2 s; o PDF fica pronto cerca de 1 min depois |
| Link do PDF | aparecia na hora | aparece em "Ordens emitidas" e em "Consultar / Editar" do RO, marcado "PDF em preparação" até ficar pronto |
| Tabela de produtos da Pulverização (OS e RO) | Produto \| Dosagem \| Dose/tanque, com Dose/ha e Dose/tanque soltos embaixo | **Produto \| Dose/ha \| Dose/tanque**. Dose/ha por produto é opcional; sem ela, a Dose/tanque daquele produto fica em branco |
| PDF do relatório de Pulverização | "Produtos e quantidades: …" em texto corrido | a mesma tabela, com a Dose/tanque refeita pela capacidade e vazão **realizadas** |
| Formulário da OS | — | campo **Safra**, sugerido pela data ("Safra 2026/27") e editável (ex.: "Safrinha 2027") |
| Lista de OS no RO | todas as OS | só as que ainda não têm relatório (a Colheita mostra todas, porque recebe vários relatórios) |
| Trocar de atividade no RO | buscava na hora | as listas das 6 atividades são carregadas ao abrir o app |
| Planilha de relatórios | — | colunas **Safra**, **Status PDF** e **Confirmado RT** (caixa de seleção) |

## Fluxo de arquivamento

```
OS enviada ──► relatório enviado ──► RT marca "Confirmado RT" ──► relatório arquivado ──► OS arquivada
              (a OS sai da lista       (na planilha de           (na hora)                (na rotina horária)
               do celular)              relatórios)
```

- Os arquivos ficam em **Ordens emitidas / Safra 2026-27 /**: os PDFs da OS e do relatório, mais a
  planilha **"Arquivo - Safra 2026-27"**, com as abas `OS - <atividade>` e `RO - <atividade>`.
- A OS só sai quando **todos** os relatórios dela foram confirmados. Na **Colheita**, além disso,
  a OS espera passar a data de término prevista, para que caminhão e trator ainda possam reportar.
- Relatório confirmado com o PDF ainda em geração espera o PDF ficar pronto.
- Sem safra informada (OS antigas), a safra é deduzida pela data de início, de julho a junho.
- Depois de arquivados, a OS e o relatório não podem mais ser editados pelos apps. Isso é de
  propósito: o RT já confirmou.
- **Irrigação** fica fora do arquivamento, porque não tem OS.

## Como publicar (ordem)

1. **Apps Script da OS**: colar `appsScript.js` e publicar uma **Nova versão**. Depois, no editor,
   escolher **`instalarAcionadores`** e clicar em **Executar**. O Google vai pedir autorização nova
   (acionadores, Drive e a planilha de relatórios): aceite.
2. **Apps Script de Relatórios**: colar `ro/appsScript.js`, publicar uma **Nova versão** e executar
   **`instalarAcionadores`** do mesmo jeito. Essa função também cria a coluna "Confirmado RT" com
   as caixas de seleção.
3. **Site**: integrar o pull request.

Se `instalarAcionadores` não for executada, nada trava: o PDF volta a ser gerado no próprio envio,
como antes, só que mais lento. O arquivamento, porém, só funciona depois dela.

**Voltar atrás:** em cada `appsScript.js`, trocar `PDF_EM_SEGUNDO_PLANO = true` por `false`
devolve o PDF na hora. O arquivamento só acontece quando alguém marca "Confirmado RT".

## Testes desta rodada

`node testes/test_fila_arquivo.mjs` roda **os dois Apps Scripts juntos** sobre um Google simulado
(`testes/mundo_google.mjs`): fila de PDF, edição durante a geração, falha do Docs (5 tentativas),
lista do RO, tabela de produtos nos dois PDFs, confirmação do RT, pasta e planilha da safra,
Colheita e script publicado sem acionadores. No total são 12 conjuntos e 384 verificações, todas
passando.

**Não testado, porque depende do Google de verdade:** os acionadores reais, o
`insertTable`/`moveTo` no Drive real e as permissões entre os dois projetos. Os dois scripts
precisam ser do mesmo dono (a conta que publica) para que um leia a planilha do outro.
