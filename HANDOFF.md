# HANDOFF — Ordem de Serviço (Fazenda Agro Verde)

Estado em 27/07/2026. Leia junto com `LEIA-ME_otimizacao.md` (detalhe técnico) e
`anotacoes.txt` (histórico do dono do projeto).

---

## Situação em uma linha

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
