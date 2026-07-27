# Ordem de Serviço — otimização (25/07/2026)

Atende aos três pedidos de `otimizar.md`: carregamento/PDF, funcionamento offline e edição de OS.

> **Importante:** são duas implantações. O site (GitHub) **e** o Apps Script da planilha.
> Publicar só o site faz a edição de OS não funcionar (o app avisa e continua registrando normalmente).

---

## 1. Carregamento e geração de PDF

**O que estava pesando**

| Item | Antes | Agora |
|---|---|---|
| Logo | `style.css` fazia `@import` de `logoFAVbase64.css` (92 KB em base64) — o navegador só começava a baixar a logo depois de baixar e ler o CSS | `logo-fav.png`, 18 KB, como `<img>` (não bloqueia a tela) |
| Peso da primeira abertura | ~124 KB, em cascata | ~76 KB, em paralelo |
| Conexão com o Google | aberta só na hora do envio | `preconnect` já no `<head>` (DNS + TLS prontos antes) |
| Tela durante o envio | travada num aviso "Enviando dados…" até o PDF ficar pronto | volta na hora para a lista de atividades; o PDF é gerado em segundo plano e avisa quando termina |
| Envio travado | ficava girando para sempre | 90 s de limite, reenvio automático com espera crescente |

**No servidor (`appsScript.js`)**

- As ~40 substituições de texto no modelo do Google Docs viravam ~40 chamadas de serviço. Agora vão em **uma única chamada** da API do Docs (`Docs.Documents.batchUpdate`). Se a API não estiver habilitada, o script usa sozinho o caminho antigo — não quebra.
- `formatDateColumnsInSheet` reformatava 3 colunas × 1000 linhas **a cada OS registrada**. Agora só roda quando a aba é criada.
- A busca da OS lê apenas a coluna de ID, não a planilha inteira.

## 2. Funcionamento offline

**A causa raiz:** o `index.html` registrava `'/service-worker.js'`, ou seja
`https://henrique1970-blip.github.io/service-worker.js` — que dá **404**, porque o app fica em
`/agroverde/`. O Service Worker nunca chegou a ser instalado; o app só parecia funcionar offline
enquanto a página estava aberta. A lista de arquivos do cache tinha o mesmo problema
(`'/index.html'`, `'/style.css'`…).

Correções:

- Registro e cache com **caminhos relativos**; o `manifest.json` também (`start_url`, `scope`).
- HTML pela rede com queda para o cache; demais arquivos pelo cache com atualização em segundo plano — versão nova chega sozinha, com aviso "Nova versão disponível".
- Página `offline.html` para quando o aparelho abre o app sem sinal e sem cache.
- **Gravação antes do envio:** ao tocar em "Registrar", a OS vai primeiro para o banco do aparelho. Só depois é enviada. Se a bateria acabar, o app fechar ou o sinal cair no meio, nada se perde.
- A sincronização em segundo plano agora acontece **dentro do Service Worker**, lendo a fila. Antes ele só avisava as abas abertas — com o app fechado, nada era enviado.
- Contador de pendências no topo da tela (toque nele para tentar enviar na hora).
- **Sem OS duplicada:** o servidor grava por ID da OS (`upsert`). Se o celular reenviar algo que já chegou (caso clássico: a OS foi gravada mas a resposta se perdeu), a linha é atualizada em vez de duplicar.
- A fila antiga (`pendingOSData`) é migrada automaticamente para a nova estrutura na primeira abertura.

## 3. Edição de ordem de serviço

- Botão **"✏️ Editar Ordem de Serviço"** na tela inicial.
- Lista as OS da planilha (mais recentes primeiro), com busca por ID, local ou atividade.
- Ao escolher uma, o formulário abre **preenchido** — inclusive talhões marcados, área total, produtos/insumos e caminhões/motoristas.
- Ao salvar: **o ID é mantido**, a linha da planilha é atualizada, um PDF novo é gerado e o PDF antigo vai para a lixeira (a pasta não acumula versões).
- Offline: dá para editar as OS que ainda estão na fila e as que já foram abertas no aparelho; a alteração vai junto na próxima sincronização.

---

## Como publicar

**a) Site (GitHub)** — enviar para `https://github.com/henrique1970-blip/agroverde` (raiz):

```
index.html   script.js   service-worker.js   style.css
manifest.json   offline.html   logo-fav.png
```

O arquivo `logoFAVbase64.css` deixou de ser usado por este app (o de Relatório de Operações
continua usando o dele). `app.js` na raiz do repositório é uma página do GitHub salva por engano
(280 KB de HTML) — não é usado por nada e pode ser apagado.

**b) Apps Script (planilha "FAV - Ordem de Serviço")**

1. Abrir a planilha → **Extensões → Apps Script**.
2. Substituir todo o conteúdo pelo `appsScript.js` deste repositório.
3. Menu **Serviços (+) → "Google Docs API"**, identificador `Docs`. *(É o que acelera o PDF. Sem isso o script funciona igual, só mais devagar.)*
4. **Implantar → Gerenciar implantações → editar a implantação atual → Nova versão.**
   A URL `/exec` continua a mesma — o app de Relatório de Operações depende dela.

As colunas **PDF ID**, **PDF URL** e **Atualizado em** são criadas sozinhas nas abas existentes,
no fim da linha de cabeçalho. Nenhuma coluna atual é movida ou apagada.

## Compatibilidade

- O `?activity=` e o `?activity=&osId=` usados pelo app de **Relatório de Operações** continuam
  respondendo exatamente como antes (testado).
- O Service Worker ignora tudo que estiver em `/ro/`.

## O que conferir depois de publicar

1. Abrir o app, F12 → *Application → Service Workers*: deve aparecer **activated** (antes não aparecia nada).
2. Registrar uma OS: a tela volta na hora e o aviso do PDF chega em seguida.
3. Ativar o modo avião, registrar outra: aparece "salva no aparelho" e o contador de pendências.
   Fechar o app, voltar o sinal, reabrir: a OS sobe sozinha.
4. Editar uma OS existente, mudar um campo e salvar: a planilha muda na mesma linha e o PDF é refeito.
