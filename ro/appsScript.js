/*
* Apps Script da PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
*
* Responsabilidades:
*  1. Receber os dados do formulário (doPost) e gravá-los na planilha.
*  2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
*  3. Criar abas dinamicamente, se necessário.
*  4. Gerar o PDF do relatório a partir do template do Google Docs, para as operações.
*  5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
*  6. Servir as consultas de Irrigação e de Relatórios de Operação (doGet).
*  7. ATUALIZAR um relatório já enviado (edição), regerando o PDF.
*  8. Fornecer dados para a funcionalidade "Consulta Operação" de Irrigação (via doGet).
*
*
* ---------------------------------------------------------------------------
* GERAÇÃO DE PDF — o que mudou
*
* A versão anterior chamava body.replaceText() uma vez por placeholder: eram
* ~70 chamadas em série, cada uma um ida-e-volta com o servidor do Docs. Era
* daí que vinham os 15–30 s de espera.
*
* Agora todas as substituições vão num único Docs.Documents.batchUpdate().
* Ganho adicional: replaceAllText alcança cabeçalho e rodapé do documento,
* coisa que body.replaceText() não fazia.
*
* >>> PARA ATIVAR (leva 30 segundos, feito uma única vez):
*     No editor do Apps Script, menu lateral "Serviços" (+) >
*     "Google Docs API" > Adicionar.  O identificador precisa ficar "Docs".
*
* Sem isso o script continua funcionando: ele detecta que o serviço não está
* disponível e cai automaticamente no método antigo (só mais lento).
* ---------------------------------------------------------------------------
*
* ---------------------------------------------------------------------------
* OUT/2026
*  - PDF em segundo plano: o envio grava a linha e responde em 1-2 s; o PDF é
*    gerado logo depois por um acionador (fila na aba oculta "_fila_pdf").
*    Para voltar ao PDF na hora: PDF_EM_SEGUNDO_PLANO = false.
*  - Pulverização: "Produtos e quantidades" vira tabela Produto | Dose/ha |
*    Dose/tanque no PDF; as linhas soltas Dose/ha e Dose/tanque saem. A
*    Dose/tanque realizada é recalculada com a capacidade e a vazão realizadas.
*  - Colunas novas: "Safra", "Status PDF" e "Confirmado RT" (caixa de seleção).
*  - Arquivamento: marcar "Confirmado RT" move o relatório (linha + PDF) para a
*    pasta da safra e, quando a OS não tem mais relatório por confirmar, pede o
*    arquivamento dela ao projeto de OS (aba "_arquivar_os").
*
*  >>> Depois de publicar, rode UMA VEZ instalarAcionadores() no editor.
* ---------------------------------------------------------------------------
*/

const REPORT_SPREADSHEET_ID = "1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8";
const PDF_REPORT_FOLDER_ID = "1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI";

const REPORT_TEMPLATE_IDS = {
  "PreparodeArea": "1mpWpIZkZ58zV_SojCAG7ibqSoC_OyXHmSTBNm2FcMq0",
  "TratamentodeSementes": "1D-zNji40SaoO-1Smy46kbAZnZIqx5JRpL63tYTqpfgQ",
  "Plantio": "1s3HKETzY1Y-EWD08PV3xwNOJpl1RchiRbv-pJc8nmDI",
  "Pulverizacao": "1CbaCfu6Hm57FHf1ozUBlfb_euDLgg8IoM1Fvz1pTtag",
  "Colheita": {
    "Colhedeira": "1T0QA820ZVrgkSmX08HZm6w-8FMM6Qb7aub508jmR7DA",
    "Caminhao": "1ukAVbuC5NM8TmxZ8LXM6c3_yCbBKTwMypTZmb6Qsmto",
    "Trator": "1JIlAlTUciVKFFX_-_Zpw9Zkux-7T-3-tq3Evgsl42wk"
  },
  "Lancas": "1mvKGzXB5LPAKrk24XEZOGs4JXB_ybBhCkmFch64WmaA",
  "Irrigacao": "1HB7o9eiC3FpOw7VAfBrRdsN3sUOZqIYIGbKyHFi8wKs"
};

const COMMON_OS_HEADERS = [ "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Observacao", "OS Realizado - Observacao" ];
const TDS_COMMON_HEADERS = COMMON_OS_HEADERS.filter(h => !h.includes("Trator") && !h.includes("Implemento"));

const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...COMMON_OS_HEADERS, "OS Planejado - Cultura / Cultivar", "OS Realizado - Cultura / Cultivar", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "TratamentodeSementes": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...TDS_COMMON_HEADERS, "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Qtd Sementes (Kg)", "OS Realizado - Qtd Sementes (Kg)", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Maquina", "OS Realizado - Maquina" ],
  "Plantio": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Quantidade/ha - Máximo", "OS Realizado - Quantidade/ha - Máximo", "OS Planejado - Quantidade/ha - Mínimo", "OS Realizado - Quantidade/ha - Mínimo", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Plantas por metro", "OS Realizado - Plantas por metro", "OS Planejado - Espacamento entre plantas", "OS Realizado - Espacamento entre plantas", "OS Planejado - PMS", "OS Realizado - PMS", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "Pulverizacao": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtos e quantidades", "OS Realizado - Produtos e quantidades", "OS Planejado - Bico", "OS Realizado - Bico", "OS Planejado - Capacidade do tanque", "OS Realizado - Capacidade do tanque", "OS Planejado - Vazão (L/ha)", "OS Realizado - Vazão (L/ha)", "OS Planejado - Pressão", "OS Realizado - Pressão", "OS Planejado - Dose/ha", "OS Realizado - Dose/ha", "OS Planejado - Dose/tanque", "OS Realizado - Dose/tanque", "OS Planejado - Máquina (Pulverizador)", "OS Realizado - Máquina (Pulverizador)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "Colheita": ["Timestamp Relatorio", "ID da OS", "Nome do Usuario", "Relatorio - Equipamento", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtividade estimada", "OS Realizado - Produtividade estimada", "OS Planejado - Colhedeira", "OS Realizado - Colhedeira", "OS Planejado - Operador(es) Colhedeira", "OS Realizado - Operador(es) Colhedeira", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Operador(es) Trator", "OS Realizado - Operador(es) Trator", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Caminhão 1", "OS Realizado - Caminhão 1", "OS Planejado - Motorista 1", "OS Realizado - Motorista 1", "OS Planejado - Caminhão 2", "OS Realizado - Caminhão 2", "OS Planejado - Motorista 2", "OS Realizado - Motorista 2", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Colhedeira Inicio", "Relatorio - Horimetro Colhedeira Fim", "Relatorio - Paradas Colhedeira", "Relatorio - Abastecimentos Colhedeira", "Relatorio - Caminhao ID", "Relatorio - Motorista", "Relatorio - KM Inicio", "Relatorio - KM Fim", "Relatorio - Abastecimentos Caminhao", "Relatorio - Paradas Caminhao", "Relatorio - Horimetro Trator Inicio", "Relatorio - Horimetro Trator Fim", "Relatorio - Paradas Trator", "Relatorio - Abastecimentos Trator" ],
  "Lancas": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...COMMON_OS_HEADERS, "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtos e quantidades", "OS Realizado - Produtos e quantidades","Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos"],
  "Irrigacao": [ "Timestamp Relatorio", "ID da Operacao", "Nome do Usuario", "Local", "Pivo", "Data de Inicio", "Hora de Inicio", "Data de Termino", "Hora de Termino", "Volta", "Intensidade", "Operador", "Numero de Paradas Imprevistas", "Observacao"]
};

// Colunas de controle acrescentadas automaticamente à direita das planilhas
// existentes. Servem para localizar e reescrever a linha na edição.
const CONTROL_HEADERS = ["ID do Relatorio", "ID do PDF", "URL do PDF", "Ultima Edicao", "Editado Por", "Safra", "Status PDF", "Confirmado RT"];

const PDF_EM_SEGUNDO_PLANO = true;
const FILA_PDF_ABA = "_fila_pdf";
const FILA_PDF_CABECALHOS = ["Chave", "Atividade", "Versao", "Status", "Tentativas", "Erro", "Payload"];
const FILA_PDF_MAX_TENTATIVAS = 5;
const FILA_PDF_LIMITE_MS = 4.5 * 60 * 1000;

const COLUNA_CONFIRMACAO = "Confirmado RT";
const FILA_ARQUIVO_OS_ABA = "_arquivar_os";
const FILA_ARQUIVO_OS_CABECALHOS = ["ID da OS", "Atividade", "Safra", "Nao antes de", "Pedido em"];
// Mesma pasta-raiz usada pelo projeto de OS (a pasta das OS emitidas): as
// pastas "Safra ..." são compartilhadas pelos dois projetos.
const ARQUIVO_PASTA_RAIZ_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754";
const ATIVIDADES_ARQUIVAVEIS = ["PreparodeArea", "TratamentodeSementes", "Plantio", "Pulverizacao", "Colheita", "Lancas"];


/*
 * Mapa único usado tanto para GRAVAR quanto para LER de volta um relatório.
 *   [ sufixo da coluna na planilha , chave usada pelo formulário , rótulo na tela , tipo ]
 * O rótulo precisa ser exatamente o texto que o keyMap do script.js converte
 * de volta para a mesma chave — é o que permite reconstruir a tela de edição.
 */
const OS_FIELDS = [
  ["Local",                     "Local",                   "Local",                     "txt"],
  ["Talhoes (Area)",            "TalhoesArea",             "Talhões (Area)",            "txt"],
  ["Área Total (ha)",           "reaTotalha",              "Área Total (ha)",           "num"],
  ["Data de Inicio",            "DatadeInicio",            "Data de Inicio",            "date"],
  ["Data de Termino",           "DatadeTermino",           "Data de Término",           "date"],
  ["Cultura / Cultivar",        "CulturaCultivar",         "Cultura / Cultivar",        "txt"],
  ["Cultura e Cultivar",        "CulturaeCultivar",        "Cultura e Cultivar",        "txt"],
  ["Qtd Sementes (Kg)",         "QtdSementesKg",           "Qtd Sementes (Kg)",         "num"],
  ["Produtos e Dosagens",       "ProdutoseDosagens",       "Produtos e Dosagens",       "txt"],
  ["Produtos e quantidades",    "produtosQuantidade",      "Produtos e quantidades",    "txt"],
  ["Quantidade/ha - Máximo",    "QtdhaMaximo",             "Quantidade/ha - Máximo",    "num"],
  ["Quantidade/ha - Mínimo",    "QtdhaMinimo",             "Quantidade/ha - Mínimo",    "num"],
  ["Plantas por metro",         "Plantaspormetro",         "Plantas por metro",         "num"],
  ["Espacamento entre plantas", "Espacamentoentreplantas", "Espacamento entre plantas", "num"],
  ["PMS",                       "PMS",                     "PMS",                       "num"],
  ["Bico",                      "Bico",                    "Bico",                      "txt"],
  ["Capacidade do tanque",      "Capacidadedotanque",      "Capacidade do tanque",      "num"],
  ["Vazão (L/ha)",              "vazaoLHa",                "Vazão (L/ha)",              "num"],
  ["Pressão",                   "pressao",                 "Pressão",                   "num"],
  ["Dose/ha",                   "Doseha",                  "Dose/ha",                   "num"],
  ["Dose/tanque",               "Dosetanque",              "Dose/tanque",               "txt"],   // lista por produto desde out/2026
  ["Maquina",                   "maquina",                 "Máquina",                   "txt"],
  ["Máquina (Pulverizador)",    "maquina",                 "Máquina (Pulverizador)",    "txt"],
  ["Trator",                    "Trator",                  "Trator",                    "txt"],
  ["Implemento",                "Implemento",              "Implemento",                "txt"],
  ["Operador(es)",              "Operadores",              "Operador(es)",              "txt"],
  ["Produtividade estimada",    "ProdutividadeEstimada",   "Produtividade estimada",    "num"],
  ["Colhedeira",                "Colhedeira",              "Colhedeira",                "txt"],
  ["Operador(es) Colhedeira",   "OperadoresColhedeira",    "Operador(es) Colhedeira",   "txt"],
  ["Operador(es) Trator",       "OperadoresTrator",        "Operador(es) Trator",       "txt"],
  ["Caminhão 1",                "Caminhao1",               "Caminhão 1",                "txt"],
  ["Motorista 1",               "Motorista1",              "Motorista 1",               "txt"],
  ["Caminhão 2",                "Caminhao2",               "Caminhão 2",                "txt"],
  ["Motorista 2",               "Motorista2",              "Motorista 2",               "txt"]
];

const ABASTECIMENTO_CFG = {
  Colhedeira: { formH: 'horimetro_colhe_abast_', formL: 'combustivel_colhedeira_', colH: 'Horimetro Abastecimento Colhedeira ', tplH: '{{horimetro_colhe_abast}}', tplL: '{{combustivel_colhedeira}}' },
  Caminhao:   { formH: 'km_abastecimento_',      formL: 'combustivel_caminhao_',   colH: 'KM Abastecimento Caminhao ',          tplH: '{{km_abastecimento}}',      tplL: '{{combustivel_caminhao}}' },
  Trator:     { formH: 'horimetro_trator_abast_', formL: 'combustivel_trator_',    colH: 'Horimetro Abastecimento Trator ',     tplH: '{{horimetro_trator_abast}}', tplL: '{{combustivel_trator}}' },
  Simples:    { formH: 'abastecimento_horimetro_', formL: 'abastecimento_litros_', colH: 'Horimetro Abastecimento ',            tplH: '{{HorimetroAbastecimento}}', tplL: '{{LitrosAbastecimento}}' }
};

// Atividades cujo template tem a tabela de abastecimentos. Nas demais o
// documento nem chega a ser aberto pelo DocumentApp, poupando ~2 s.
const ATIVIDADES_COM_ABASTECIMENTO = ["PreparodeArea", "Plantio", "Pulverizacao", "Lancas", "Colheita"];


/* =========================================================================
 * Utilitários
 * ========================================================================= */

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/*
 * CORREÇÃO: o padrão dd/MM/yyyy passou a ser testado ANTES de new Date().
 * "12/08/2025" era interpretado pelo motor como 8 de dezembro (formato
 * americano) e gravava a data errada na planilha.
 */
function parseDateForSheet(dateInput) {
  if (!dateInput) return '';
  try {
    if (typeof dateInput === 'string') {
      const br = dateInput.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (br) {
        const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
        if (!isNaN(d.getTime())) return d;
      }
    }
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? dateInput : date;
  } catch (e) {
    return dateInput;
  }
}

function formatDateForPdf(dateInput) {
  if (!dateInput) return ' ';
  try {
    const date = parseDateForSheet(dateInput);
    if (!(date instanceof Date) || isNaN(date.getTime())) return dateInput;
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) { return dateInput; }
}

function formatNumberForPdf(numInput) {
  if (numInput === null || numInput === undefined || numInput.toString().trim() === '') return ' ';
  const num = parseFloat(numInput.toString().replace(',', '.'));
  return isNaN(num) ? numInput : num.toFixed(2).replace('.', ',');
}

/** "Dose/tanque" virou texto ("Roundup: 90 l; Óleo: 15 l") na OS; OS antigas
 *  ainda trazem um número. Formata só o que for número puro. */
function formatNumeroOuTexto(valor, formatador) {
  if (valor === null || valor === undefined) return valor;
  return /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(String(valor)) ? formatador(valor) : String(valor);
}

function formatNumberForSheet(numInput) {
  if (numInput === null || numInput === undefined || numInput.toString().trim() === '') return '';
  return numInput.toString().replace('.', ',');
}

function pdfUrlFromId(fileId) { return 'https://drive.google.com/file/d/' + fileId + '/view'; }
function folderUrl() { return 'https://drive.google.com/drive/folders/' + PDF_REPORT_FOLDER_ID; }

function gerarIdRelatorio() {
  return 'REL-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

/** Garante que todos os cabeçalhos de `desejados` existam, acrescentando à
 *  direita os que faltam. Devolve a lista de cabeçalhos atualizada. */
function garantirColunas(sheet, headers, desejados) {
  const existentes = new Set(headers);
  const novos = desejados.filter(h => h && !existentes.has(h));
  if (novos.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, novos.length).setValues([novos]);
    headers = headers.concat(novos);
    // Coluna do RT recém-criada: caixas de seleção nos relatórios que já existem.
    const col = headers.indexOf(COLUNA_CONFIRMACAO);
    if (novos.indexOf(COLUNA_CONFIRMACAO) !== -1 && sheet.getLastRow() > 1) {
      sheet.getRange(2, col + 1, sheet.getLastRow() - 1, 1).insertCheckboxes();
    }
  }
  return headers;
}

function abrirAbaRelatorio(activity, criarSeNaoExistir) {
  const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(activity);
  const headersConfig = REPORT_HEADERS_CONFIG[activity] || [];

  if (!sheet) {
    if (!criarSeNaoExistir) return null;
    sheet = ss.insertSheet(activity);
    if (headersConfig.length > 0) sheet.appendRow(headersConfig);
  } else if (criarSeNaoExistir && sheet.getLastRow() === 0 && headersConfig.length > 0) {
    // Só o doPost escreve. Antes uma simples consulta podia gravar cabeçalhos
    // numa aba vazia — efeito colateral indesejado num caminho de leitura.
    sheet.appendRow(headersConfig);
  }
  return sheet;
}


/* =========================================================================
 * Geração de PDF — uma única chamada em lote ao Docs API
 * ========================================================================= */

/**
 * @param {string}  templateId    Documento modelo.
 * @param {string}  nomeArquivo   Nome final do PDF.
 * @param {Object}  substituicoes { '{{PLACEHOLDER}}': 'valor' }
 * @param {Object=} abastecimento { cfg, linhas: [{h, l}] } — expande a tabela.
 * @return {{id: string, url: string}}
 */
function gerarPdf(templateId, nomeArquivo, substituicoes, abastecimento, produtos) {
  const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
  // makeCopy(nome, pasta) já nomeia na cópia — evita um setName() depois.
  const tempDocFile = DriveApp.getFileById(templateId).makeCopy(nomeArquivo + ' (tmp)', pdfFolder);
  const docId = tempDocFile.getId();

  const mapa = {};
  Object.keys(substituicoes).forEach(k => {
    const v = substituicoes[k];
    mapa[k] = (v === null || v === undefined || v === '') ? ' ' : String(v);
  });

  // ---- 1. Tabelas (precisam do DocumentApp: cria/apaga linhas)
  const temAbastecimento = !!(abastecimento && abastecimento.cfg);
  if (temAbastecimento || produtos) {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    if (produtos) {
      try { inserirTabelaProdutos(body, produtos, mapa); }
      catch (err) { Logger.log("Tabela de produtos: " + err); }
    }
    const cfg = temAbastecimento ? abastecimento.cfg : null;
    const linhas = temAbastecimento ? (abastecimento.linhas || []) : [];
    const achou = cfg ? body.findText(escapeParaFindText(cfg.tplH)) : null;

    if (achou) {
      try {
        let element = achou.getElement();
        while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) element = element.getParent();
        const templateRow = element.getParent();
        const table = templateRow.getParent();
        const templateRowIndex = table.getChildIndex(templateRow);

        // Cada linha copiada recebe um marcador único, para que a substituição
        // dos valores entre também no lote único do passo 2.
        for (let i = 1; i <= linhas.length; i++) {
          const novaLinha = table.insertTableRow(templateRowIndex + i, templateRow.copy());
          novaLinha.replaceText(escapeParaFindText(cfg.tplH), '{{ABAST_H_' + i + '}}');
          novaLinha.replaceText(escapeParaFindText(cfg.tplL), '{{ABAST_L_' + i + '}}');
          mapa['{{ABAST_H_' + i + '}}'] = formatNumberForPdf(linhas[i - 1].h);
          mapa['{{ABAST_L_' + i + '}}'] = formatNumberForPdf(linhas[i - 1].l);
        }
        // Remove a linha-modelo. Sem isto, quando não havia abastecimento
        // nenhum o PDF saía com "{{HorimetroAbastecimento}}" impresso.
        table.removeRow(templateRowIndex);
      } catch (err) {
        Logger.log("Tabela de abastecimentos: " + err);
      }
    }
    doc.saveAndClose();
  }

  // ---- 2. Todas as substituições de texto numa chamada só
  aplicarSubstituicoes(docId, mapa);

  // ---- 3. Exporta e limpa
  const pdfBlob = DriveApp.getFileById(docId).getAs('application/pdf').setName(nomeArquivo);
  const finalPdfFile = pdfFolder.createFile(pdfBlob);
  tempDocFile.setTrashed(true);

  const id = finalPdfFile.getId();
  return { id: id, url: pdfUrlFromId(id) };
}

/** O findText() do DocumentApp recebe uma regex; as chaves precisam de escape. */
function escapeParaFindText(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aplicarSubstituicoes(docId, mapa) {
  const chaves = Object.keys(mapa);

  // Caminho rápido: uma única requisição HTTP com todas as substituições.
  if (typeof Docs !== 'undefined' && Docs.Documents && Docs.Documents.batchUpdate) {
    try {
      const requests = chaves.map(k => ({
        replaceAllText: { containsText: { text: k, matchCase: true }, replaceText: mapa[k] }
      }));
      // O batchUpdate aceita folgadamente as ~80 requisições deste relatório;
      // o fatiamento é só uma proteção para templates muito maiores.
      for (let i = 0; i < requests.length; i += 200) {
        Docs.Documents.batchUpdate({ requests: requests.slice(i, i + 200) }, docId);
      }
      return;
    } catch (err) {
      Logger.log("Docs API indisponível, usando DocumentApp: " + err);
    }
  }

  // Reserva: método antigo, uma chamada por placeholder.
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  chaves.forEach(k => body.replaceText(escapeParaFindText(k), mapa[k]));
  doc.saveAndClose();
}


/* =========================================================================
 * doPost — grava (ou atualiza) o relatório e gera o PDF
 * ========================================================================= */

function doPost(e) {
  const lock = LockService.getScriptLock();
  let gerarPendentesAoSair = false;
  try {
    // Sem o lock, dois envios simultâneos podiam acrescentar colunas de
    // abastecimento em cima um do outro e desalinhar a linha inteira.
    lock.waitLock(30000);
  } catch (err) {
    return createJsonResponse({ success: false, message: "Servidor ocupado, tente novamente em alguns segundos." });
  }

  try {
    const data = e.parameter;
    const activity = data.activity;

    if (activity === "Irrigacao") return handleIrrigationPost(data);

    const osId = data.osId;
    if (!activity || !osId) {
      return createJsonResponse({ success: false, message: "Erro: Atividade ou ID da OS não especificados." });
    }

    const sheet = abrirAbaRelatorio(activity, true);
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const ehEdicao = String(data.isUpdate) === 'true';

    const equipamento = (activity === "Colheita") ? data.equipmentType : null;
    const cfg = ABASTECIMENTO_CFG[equipamento || 'Simples'];
    const numAbastecimentos = contarAbastecimentos(data, activity, equipamento);

    // Cabeçalhos dinâmicos de abastecimento + colunas de controle
    const desejados = CONTROL_HEADERS.slice();
    for (let i = 1; i <= numAbastecimentos; i++) {
      desejados.push('Relatorio - ' + cfg.colH + i);
      desejados.push('Relatorio - Litros Abastecimento ' + i);
    }
    headers = garantirColunas(sheet, headers, desejados);

    // ---- Localiza a linha quando for edição
    let linhaAlvo = -1;
    let linhaAtual = null;
    if (ehEdicao) {
      linhaAlvo = localizarLinhaRelatorio(sheet, headers, data.reportId, data.rowIndex);
      if (linhaAlvo < 0) {
        return createJsonResponse({ success: false, message: "Relatório não encontrado para edição. Ele pode ter sido removido da planilha." });
      }
      linhaAtual = sheet.getRange(linhaAlvo, 1, 1, headers.length).getValues()[0];
    }

    const agora = new Date();
    const idxTs = headers.indexOf("Timestamp Relatorio");
    const timestampReport = (ehEdicao && linhaAtual && linhaAtual[idxTs]) ? linhaAtual[idxTs] : agora;

    const idxIdRel = headers.indexOf("ID do Relatorio");
    // Relatório novo chega com o ID gerado no aparelho. Se ele já está na
    // planilha, é reenvio (resposta perdida, ou página e service worker
    // mandando a mesma fila): devolve o que já foi gravado, sem duplicar.
    const idDoAparelho = String(data.reportId || '').trim();
    if (!ehEdicao && idDoAparelho) {
      const linhaExistente = localizarLinhaRelatorio(sheet, headers, idDoAparelho, '');
      if (linhaExistente > 0) {
        const urlPdf = sheet.getRange(linhaExistente, headers.indexOf("URL do PDF") + 1).getValue();
        return createJsonResponse({ success: true, duplicate: true, pdfUrl: urlPdf || '', folderUrl: folderUrl(), reportId: idDoAparelho });
      }
    }
    const reportId = (ehEdicao && linhaAtual && linhaAtual[idxIdRel]) ? linhaAtual[idxIdRel]
      : (idDoAparelho || gerarIdRelatorio());

    const rowDataMap = montarLinhaRelatorio(data, activity, timestampReport, osId, numAbastecimentos, cfg);
    rowDataMap["ID do Relatorio"] = reportId;
    if (ehEdicao) {
      rowDataMap["Ultima Edicao"] = agora;
      rowDataMap["Editado Por"] = data.userName;
      rowDataMap["Nome do Usuario"] = linhaAtual[headers.indexOf("Nome do Usuario")] || data.userName;
    }

    // ---- PDF
    let templateId = (activity === 'Colheita')
      ? (REPORT_TEMPLATE_IDS[activity] || {})[equipamento]
      : REPORT_TEMPLATE_IDS[activity];
    const emSegundoPlano = PDF_EM_SEGUNDO_PLANO && !!templateId;

    rowDataMap["Safra"] = data.Safra || (linhaAtual ? linhaAtual[headers.indexOf("Safra")] : '') || '';
    rowDataMap["Status PDF"] = emSegundoPlano ? 'gerando' : (templateId ? 'ok' : '');
    if (linhaAtual) {
      // Na edição o PDF atual vale até o novo ficar pronto; a confirmação do RT
      // (se houver) também não é apagada.
      rowDataMap["ID do PDF"] = linhaAtual[headers.indexOf("ID do PDF")];
      rowDataMap["URL do PDF"] = linhaAtual[headers.indexOf("URL do PDF")];
      rowDataMap[COLUNA_CONFIRMACAO] = linhaAtual[headers.indexOf(COLUNA_CONFIRMACAO)];
    }

    let pdf = null;
    if (templateId && !emSegundoPlano) {
      pdf = gerarPdfRelatorio(data, activity, agora, ehEdicao);
      rowDataMap["ID do PDF"] = pdf.id;
      rowDataMap["URL do PDF"] = pdf.url;

      // Na edição, o PDF antigo vai para a lixeira para não ficarem duas
      // versões do mesmo relatório circulando na pasta.
      if (ehEdicao) {
        const pdfAntigo = linhaAtual[headers.indexOf("ID do PDF")];
        if (pdfAntigo && pdfAntigo !== pdf.id) {
          try { DriveApp.getFileById(pdfAntigo).setTrashed(true); } catch (err) { Logger.log("PDF antigo: " + err); }
        }
      }
    }

    // ---- Grava a linha
    const rowValues = headers.map(h => rowDataMap[h] !== undefined ? rowDataMap[h] : '');
    let linhaGravada = linhaAlvo;
    if (ehEdicao) {
      sheet.getRange(linhaAlvo, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      linhaGravada = sheet.getLastRow();
      const colRt = headers.indexOf(COLUNA_CONFIRMACAO);
      if (colRt !== -1) sheet.getRange(linhaGravada, colRt + 1).insertCheckboxes();
    }

    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
    }
    if (emSegundoPlano) {
      enfileirarPdf(String(reportId), activity, { data: data, agora: agora.toISOString(), ehEdicao: ehEdicao });
      // Sem acionador autorizado: gera ao fim deste envio, como antes.
      if (!agendarFilaPdf()) gerarPendentesAoSair = true;
      return createJsonResponse({ success: true, pdfPending: true, folderUrl: folderUrl(), reportId: reportId });
    }
    return createJsonResponse({ success: true, pdfUrl: pdf.url, folderUrl: folderUrl(), reportId: reportId });
  } catch (error) {
    Logger.log("Erro no servidor: " + error + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error });
  } finally {
    lock.releaseLock();
    if (gerarPendentesAoSair) processarFilaPdf();
  }
}

function contarAbastecimentos(data, activity, equipamento) {
  let n;
  if (activity === "Colheita") {
    if (equipamento === 'Colhedeira') n = data.NUMERO_ABASTECIMENTO_COLHEDEIRA;
    else if (equipamento === 'Caminhao') n = data.NUMERO_ABASTECIMENTO_CAMINHAO;
    else if (equipamento === 'Trator') n = data.NUMERO_ABASTECIMENTO_TRATOR;
  } else {
    n = data.numAbastecimentos;
  }
  return parseInt(n || '0', 10) || 0;
}

function montarLinhaRelatorio(data, activity, timestampReport, osId, numAbastecimentos, cfg) {
  const rowDataMap = {
    "Timestamp Relatorio": timestampReport, "ID da OS": osId, "Nome do Usuario": data.userName,
    "OS Planejado - Local": data.Local, "OS Realizado - Local": data.realizado_Local,
    "OS Planejado - Talhoes (Area)": data.TalhoesArea, "OS Realizado - Talhoes (Area)": data.realizado_TalhoesArea,
    "OS Planejado - Área Total (ha)": formatNumberForSheet(data.reaTotalha), "OS Realizado - Área Total (ha)": formatNumberForSheet(data.realizado_reaTotalha),
    "OS Planejado - Data de Inicio": parseDateForSheet(data.DatadeInicio), "OS Realizado - Data de Inicio": parseDateForSheet(data.realizado_DatadeInicio),
    "OS Planejado - Data de Termino": parseDateForSheet(data.DatadeTermino), "OS Realizado - Data de Termino": parseDateForSheet(data.realizado_DatadeTermino),
    "OS Planejado - Operador(es)": data.Operadores, "OS Realizado - Operador(es)": data.realizado_Operadores,
    "OS Planejado - Observacao": data.Observacao, "OS Realizado - Observacao": data.observacao,
    "OS Planejado - Trator": data.Trator || data.maquina,
    "OS Realizado - Trator": data.realizado_Trator || data.realizado_maquina,
    "OS Planejado - Implemento": data.Implemento, "OS Realizado - Implemento": data.realizado_Implemento,
    "OS Planejado - Cultura / Cultivar": data.CulturaCultivar, "OS Realizado - Cultura / Cultivar": data.realizado_CulturaCultivar,
    "Relatorio - Horimetro Inicio": formatNumberForSheet(data.horimetroInicio), "Relatorio - Horimetro Fim": formatNumberForSheet(data.horimetroFim),
    "Relatorio - Paradas Imprevistas": data.paradasImprevistas, "Relatorio - Numero Abastecimentos": data.numAbastecimentos,
    "OS Planejado - Cultura e Cultivar": data.CulturaeCultivar || data.CulturaCultivar,
    "OS Realizado - Cultura e Cultivar": data.realizado_CulturaeCultivar || data.realizado_CulturaCultivar,
    "OS Planejado - Qtd Sementes (Kg)": formatNumberForSheet(data.QtdSementesKg), "OS Realizado - Qtd Sementes (Kg)": formatNumberForSheet(data.realizado_QtdSementesKg),
    "OS Planejado - Produtos e Dosagens": data.Insumos || data.ProdutoseDosagens, "OS Realizado - Produtos e Dosagens": data.realizado_Insumos || data.realizado_ProdutoseDosagens,
    "OS Planejado - Maquina": data.maquina || data.Trator,
    "OS Realizado - Maquina": data.realizado_maquina || data.realizado_Trator,
    "OS Planejado - Quantidade/ha - Máximo": formatNumberForSheet(data.QtdhaMaximo), "OS Realizado - Quantidade/ha - Máximo": formatNumberForSheet(data.realizado_QtdhaMaximo),
    "OS Planejado - Quantidade/ha - Mínimo": formatNumberForSheet(data.QtdhaMinimo), "OS Realizado - Quantidade/ha - Mínimo": formatNumberForSheet(data.realizado_QtdhaMinimo),
    "OS Planejado - Plantas por metro": formatNumberForSheet(data.Plantaspormetro), "OS Realizado - Plantas por metro": formatNumberForSheet(data.realizado_Plantaspormetro),
    "OS Planejado - Espacamento entre plantas": formatNumberForSheet(data.Espacamentoentreplantas), "OS Realizado - Espacamento entre plantas": formatNumberForSheet(data.realizado_Espacamentoentreplantas),
    "OS Planejado - PMS": formatNumberForSheet(data.PMS), "OS Realizado - PMS": formatNumberForSheet(data.realizado_PMS),
    "OS Planejado - Produtos e quantidades": data.produtosQuantidade, "OS Realizado - Produtos e quantidades": data.realizado_produtosQuantidade,
    "OS Planejado - Bico": data.Bico, "OS Realizado - Bico": data.realizado_Bico,
    "OS Planejado - Capacidade do tanque": formatNumberForSheet(data.Capacidadedotanque), "OS Realizado - Capacidade do tanque": formatNumberForSheet(data.realizado_Capacidadedotanque),
    "OS Planejado - Vazão (L/ha)": formatNumberForSheet(data.vazaoLHa), "OS Realizado - Vazão (L/ha)": formatNumberForSheet(data.realizado_vazaoLHa),
    "OS Planejado - Pressão": formatNumberForSheet(data.pressao), "OS Realizado - Pressão": formatNumberForSheet(data.realizado_pressao),
    "OS Planejado - Dose/ha": formatNumberForSheet(data.Doseha), "OS Realizado - Dose/ha": formatNumberForSheet(data.realizado_Doseha),
    "OS Planejado - Dose/tanque": formatNumeroOuTexto(data.Dosetanque, formatNumberForSheet),
    "OS Realizado - Dose/tanque": activity === "Pulverizacao" ? doseTanqueRealizada(data) : formatNumeroOuTexto(data.realizado_Dosetanque, formatNumberForSheet),
    "OS Planejado - Máquina (Pulverizador)": data.maquina, "OS Realizado - Máquina (Pulverizador)": data.realizado_maquina,
    "Relatorio - Equipamento": data.equipmentType,
    "OS Planejado - Produtividade estimada": formatNumberForSheet(data.ProdutividadeEstimada), "OS Realizado - Produtividade estimada": formatNumberForSheet(data.realizado_ProdutividadeEstimada),
    "OS Planejado - Colhedeira": data.Colhedeira, "OS Realizado - Colhedeira": data.realizado_Colhedeira,
    "OS Planejado - Operador(es) Colhedeira": data.OperadoresColhedeira, "OS Realizado - Operador(es) Colhedeira": data.realizado_OperadoresColhedeira,
    "OS Planejado - Operador(es) Trator": data.OperadoresTrator, "OS Realizado - Operador(es) Trator": data.realizado_OperadoresTrator,
    "OS Planejado - Caminhão 1": data.Caminhao1, "OS Realizado - Caminhão 1": data.realizado_Caminhao1,
    "OS Planejado - Motorista 1": data.Motorista1, "OS Realizado - Motorista 1": data.realizado_Motorista1,
    "OS Planejado - Caminhão 2": data.Caminhao2, "OS Realizado - Caminhão 2": data.realizado_Caminhao2,
    "OS Planejado - Motorista 2": data.Motorista2, "OS Realizado - Motorista 2": data.realizado_Motorista2,
    "Relatorio - Horimetro Colhedeira Inicio": formatNumberForSheet(data.horimetro_colhe_inicio), "Relatorio - Horimetro Colhedeira Fim": formatNumberForSheet(data.horimetro_colhe_fim),
    "Relatorio - Paradas Colhedeira": data.PARADAS_IMPREVISTAS_COLHEDEIRA, "Relatorio - Abastecimentos Colhedeira": data.NUMERO_ABASTECIMENTO_COLHEDEIRA,
    "Relatorio - Caminhao ID": data.Caminhao_ID, "Relatorio - Motorista": data.MOTORISTA_CAMINHAO,
    "Relatorio - KM Inicio": formatNumberForSheet(data.km_inicio), "Relatorio - KM Fim": formatNumberForSheet(data.km_fim),
    "Relatorio - Abastecimentos Caminhao": data.NUMERO_ABASTECIMENTO_CAMINHAO,
    "Relatorio - Paradas Caminhao": data.PARADAS_IMPREVISTAS_CAMINHAO,
    "Relatorio - Horimetro Trator Inicio": formatNumberForSheet(data.horimetro_trator_inicio), "Relatorio - Horimetro Trator Fim": formatNumberForSheet(data.horimetro_trator_fim),
    "Relatorio - Paradas Trator": data.PARADAS_IMPREVISTAS_TRATOR, "Relatorio - Abastecimentos Trator": data.NUMERO_ABASTECIMENTO_TRATOR
  };

  for (let i = 1; i <= numAbastecimentos; i++) {
    rowDataMap['Relatorio - ' + cfg.colH + i] = formatNumberForSheet(data[cfg.formH + i]);
    rowDataMap['Relatorio - Litros Abastecimento ' + i] = formatNumberForSheet(data[cfg.formL + i]);
  }

  return rowDataMap;
}

function montarPlaceholders(data, activity, agora, osId, equipamento) {
  let caminhaoRealizadoPdf = data.Caminhao_ID;
  let motoristaRealizadoPdf = data.MOTORISTA_CAMINHAO;

  if (activity === 'Colheita' && equipamento === 'Caminhao') {
    if (data.Caminhao_ID === data.Caminhao1) {
      caminhaoRealizadoPdf = data.realizado_Caminhao1;
      motoristaRealizadoPdf = data.realizado_Motorista1;
    } else if (data.Caminhao_ID === data.Caminhao2) {
      caminhaoRealizadoPdf = data.realizado_Caminhao2;
      motoristaRealizadoPdf = data.realizado_Motorista2;
    }
  }

  return {
    '{{DATA_EMISSAO}}': formatDateForPdf(agora), '{{USUARIO_REGISTRO}}': data.userName,
    '{{USUARIO_RELATORIO}}': data.userName, '{{DATA_RELATORIO}}': formatDateForPdf(agora),
    '{{OBSERVACAO_OS_RELATORIO}}': data.observacao, '{{ID_OPERACAO}}': osId + '-OP', '{{OS_ID}}': osId,
    '{{LOCAL_OS_RELATORIO}}': data.realizado_Local, '{{LOCAL_ATIVIDADE}}': data.realizado_Local,
    '{{TALHOES_OS_RELATORIO}}': data.realizado_TalhoesArea, '{{TALHOES_SELECIONADOS}}': data.realizado_TalhoesArea,
    '{{AREA_TOTAL_OS_RELATORIO}}': formatNumberForPdf(data.realizado_reaTotalha), '{{AREA_TOTAL_HECTARES}}': formatNumberForPdf(data.realizado_reaTotalha),
    '{{DATA_INICIO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeInicio), '{{DATA_INICIO}}': formatDateForPdf(data.realizado_DatadeInicio),
    '{{DATA_TERMINO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeTermino), '{{DATA_TERMINO}}': formatDateForPdf(data.realizado_DatadeTermino),
    '{{OPERADORES_OS}}': data.realizado_Operadores, '{{OPERADORES}}': data.realizado_Operadores,
    '{{OBSERVACAO_OS}}': data.Observacao,
    '{{OBSERVACAO_OS-RELATORIO}}': data.observacao,
    '{{HORIMETRO_INICIO}}': formatNumberForPdf(data.horimetroInicio), '{{HORIMETRO_FIM}}': formatNumberForPdf(data.horimetroFim),
    '{{PARADAS_IMPREVISTAS}}': data.paradasImprevistas, '{{NUM_ABASTECIMENTOS}}': data.numAbastecimentos,
    '{{TRATOR_OS}}': data.Trator || data.maquina,
    '{{TRATOR}}': data.realizado_Trator || data.realizado_maquina,
    '{{IMPLEMENTO_OS}}': data.Implemento,
    '{{IMPLEMENTO}}': data.realizado_Implemento,
    '{{CULTURA_CULTIVAR_OS}}': data.CulturaeCultivar || data.CulturaCultivar,
    '{{CULTURA_CULTIVAR}}': data.realizado_CulturaeCultivar || data.realizado_CulturaCultivar,
    '{{QTD_SEMENTES_KG_OS}}': formatNumberForPdf(data.QtdSementesKg),
    '{{PRODUTOS_UTILIZADOS_OS}}': data.Insumos || data.ProdutoseDosagens,
    '{{MAQUINA_OS}}': data.maquina || data.Trator,
    '{{MAQUINA}}': data.realizado_maquina || data.realizado_Trator,
    '{{QTD_HA_MAX}}': formatNumberForPdf(data.realizado_QtdhaMaximo), '{{QTD_HA_MIN}}': formatNumberForPdf(data.realizado_QtdhaMinimo),
    '{{PLANTAS_METRO}}': formatNumberForPdf(data.realizado_Plantaspormetro), '{{ESPACAMENTO_PLANTAS}}': formatNumberForPdf(data.realizado_Espacamentoentreplantas), '{{PMS}}': formatNumberForPdf(data.realizado_PMS),
    '{{PRODUTOS_QTD_HA}}': data.realizado_produtosQuantidade || data.produtosQuantidade,
    '{{BICO}}': data.realizado_Bico, '{{CAPACIDADE_TANQUE}}': formatNumberForPdf(data.realizado_Capacidadedotanque),
    '{{VAZAO_L_HA}}': formatNumberForPdf(data.realizado_vazaoLHa), '{{PRESSAO}}': formatNumberForPdf(data.realizado_pressao), '{{DOSE_HA}}': formatNumberForPdf(data.realizado_Doseha),
    '{{DOSE_TANQUE}}': formatNumeroOuTexto(data.realizado_Dosetanque, formatNumberForPdf),
    '{{PRODUTIVIDADE_ESTIMADA}}': formatNumberForPdf(data.realizado_ProdutividadeEstimada),
    '{{OPERADORES_MAQUINA}}': data.realizado_OperadoresColhedeira,
    '{{horimetro_colhe_inicio}}': formatNumberForPdf(data.horimetro_colhe_inicio), '{{horimetro_colhe_fim}}': formatNumberForPdf(data.horimetro_colhe_fim),
    '{{PARADAS_IMPREVISTAS_COLHEDEIRA}}': data.PARADAS_IMPREVISTAS_COLHEDEIRA, '{{NUMERO_ABASTECIMENTO_COLHEDEIRA}}': data.NUMERO_ABASTECIMENTO_COLHEDEIRA,
    '{{Caminhao_ID}}': caminhaoRealizadoPdf, '{{MOTORISTA_CAMINHAO}}': motoristaRealizadoPdf,
    '{{km_inicio}}': formatNumberForPdf(data.km_inicio), '{{km_fim}}': formatNumberForPdf(data.km_fim),
    '{{PARADAS_IMPREVISTAS_CAMINHAO}}': data.PARADAS_IMPREVISTAS_CAMINHAO,
    '{{NUMERO_ABASTECIMENTO_CAMINHAO}}': data.NUMERO_ABASTECIMENTO_CAMINHAO,
    '{{horimetro_trator_inicio}}': formatNumberForPdf(data.horimetro_trator_inicio), '{{horimetro_trator_fim}}': formatNumberForPdf(data.horimetro_trator_fim),
    '{{PARADAS_IMPREVISTAS_TRATOR}}': data.PARADAS_IMPREVISTAS_TRATOR, '{{NUMERO_ABASTECIMENTO_TRATOR}}': data.NUMERO_ABASTECIMENTO_TRATOR
  };
}

/** Devolve o número da linha (1-based) do relatório, ou -1. */
function localizarLinhaRelatorio(sheet, headers, reportId, rowIndex) {
  const idxIdRel = headers.indexOf("ID do Relatorio");
  const linha = parseInt(rowIndex, 10);

  // Caminho normal: a lista já informou a linha; só confirmamos o ID.
  if (linha >= 2 && linha <= sheet.getLastRow()) {
    if (!reportId || idxIdRel < 0) return linha;
    const valor = sheet.getRange(linha, idxIdRel + 1).getValue();
    if (String(valor) === String(reportId)) return linha;
  }

  // Reserva: varre só a coluna de ID.
  if (reportId && idxIdRel >= 0 && sheet.getLastRow() > 1) {
    const coluna = sheet.getRange(2, idxIdRel + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < coluna.length; i++) {
      if (String(coluna[i][0]) === String(reportId)) return i + 2;
    }
  }
  return -1;
}


/* =========================================================================
 * doGet — consultas
 * ========================================================================= */

function doGet(e) {
  try {
    const action = e.parameter.action;

    switch (action) {
      case "listReports":     return listReports(e.parameter);
      case "getReport":       return getReport(e.parameter);
      case "getIrrigationIdsByLocation":
      case "getIrrigationDataById":
        return handleIrrigationGet(e.parameter, action);
      default:
        return createJsonResponse({ error: true, message: "Ação inválida." });
    }
  } catch (error) {
    Logger.log("Erro no doGet: " + error);
    return createJsonResponse({ error: true, message: "Erro no servidor: " + error });
  }
}

/** Lista os últimos relatórios de uma atividade (mais recentes primeiro). */
function listReports(params) {
  const activity = params.activity;
  if (!activity || !REPORT_HEADERS_CONFIG[activity]) {
    return createJsonResponse({ error: true, message: "Atividade inválida." });
  }

  const sheet = abrirAbaRelatorio(activity, false);
  if (!sheet || sheet.getLastRow() < 2) {
    return createJsonResponse({ success: true, data: [] });
  }

  const limite = Math.min(parseInt(params.limit || '60', 10) || 60, 300);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const ultimaLinha = sheet.getLastRow();
  // Lê apenas o bloco final da planilha: uma aba com milhares de relatórios
  // não pesa mais do que uma com cinquenta.
  const primeiraLinha = Math.max(2, ultimaLinha - limite + 1);
  const linhas = sheet.getRange(primeiraLinha, 1, ultimaLinha - primeiraLinha + 1, headers.length).getValues();

  const idx = nome => headers.indexOf(nome);
  const iTs = idx("Timestamp Relatorio"), iOs = idx("ID da OS"), iUser = idx("Nome do Usuario");
  const iEquip = idx("Relatorio - Equipamento"), iLocal = idx("OS Realizado - Local");
  const iId = idx("ID do Relatorio"), iPdf = idx("URL do PDF"), iEdit = idx("Ultima Edicao");

  const data = [];
  for (let i = linhas.length - 1; i >= 0; i--) {
    const linha = linhas[i];
    if (!linha[iOs] && !linha[iTs]) continue;
    data.push({
      rowIndex: primeiraLinha + i,
      reportId: iId >= 0 ? linha[iId] : '',
      timestamp: iTs >= 0 ? isoOuTexto(linha[iTs]) : '',
      osId: iOs >= 0 ? linha[iOs] : '',
      userName: iUser >= 0 ? linha[iUser] : '',
      equipmentType: iEquip >= 0 ? linha[iEquip] : '',
      local: iLocal >= 0 ? linha[iLocal] : '',
      pdfUrl: iPdf >= 0 ? linha[iPdf] : '',
      editadoEm: iEdit >= 0 ? isoOuTexto(linha[iEdit]) : ''
    });
  }

  return createJsonResponse({ success: true, data: data });
}

function isoOuTexto(v) {
  return (v instanceof Date) ? v.toISOString() : (v === null || v === undefined ? '' : String(v));
}

/**
 * Devolve um relatório já gravado, traduzido de volta para a nomenclatura do
 * formulário (planejado / realizado / relatorio), para que a tela de edição
 * seja montada exatamente como a de um relatório novo.
 */
function getReport(params) {
  const activity = params.activity;
  const sheet = abrirAbaRelatorio(activity, false);
  if (!sheet) return createJsonResponse({ error: true, message: "Atividade sem relatórios." });

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const linhaNum = localizarLinhaRelatorio(sheet, headers, params.reportId, params.rowIndex);
  if (linhaNum < 0) return createJsonResponse({ error: true, message: "Relatório não encontrado." });

  const linha = sheet.getRange(linhaNum, 1, 1, headers.length).getValues()[0];
  const get = nome => {
    const i = headers.indexOf(nome);
    return i >= 0 ? linha[i] : '';
  };

  const valorPara = (bruto, tipo) => {
    if (bruto === '' || bruto === null || bruto === undefined) return '';
    if (tipo === 'date') return formatDateForPdf(bruto);   // dd/MM/yyyy
    return String(bruto);
  };

  const labels = {}, planejado = {}, realizado = {};
  OS_FIELDS.forEach(campo => {
    const [sufixo, clientKey, label, tipo] = campo;
    const colPlan = "OS Planejado - " + sufixo;
    if (headers.indexOf(colPlan) < 0) return;   // coluna não existe nesta atividade
    labels[clientKey] = label;
    planejado[clientKey] = valorPara(get(colPlan), tipo);
    realizado[clientKey] = valorPara(get("OS Realizado - " + sufixo), tipo);
  });

  const equipmentType = String(get("Relatorio - Equipamento") || '');
  const cfg = ABASTECIMENTO_CFG[equipmentType || 'Simples'];

  const relatorio = {
    observacao: String(get("OS Realizado - Observacao") || ''),
    horimetroInicio: get("Relatorio - Horimetro Inicio"),
    horimetroFim: get("Relatorio - Horimetro Fim"),
    paradasImprevistas: get("Relatorio - Paradas Imprevistas"),
    horimetro_colhe_inicio: get("Relatorio - Horimetro Colhedeira Inicio"),
    horimetro_colhe_fim: get("Relatorio - Horimetro Colhedeira Fim"),
    PARADAS_IMPREVISTAS_COLHEDEIRA: get("Relatorio - Paradas Colhedeira"),
    OPERADORES_MAQUINA: get("OS Realizado - Operador(es) Colhedeira"),
    Caminhao_ID: get("Relatorio - Caminhao ID"),
    MOTORISTA_CAMINHAO: get("Relatorio - Motorista"),
    km_inicio: get("Relatorio - KM Inicio"),
    km_fim: get("Relatorio - KM Fim"),
    PARADAS_IMPREVISTAS_CAMINHAO: get("Relatorio - Paradas Caminhao"),
    horimetro_trator_inicio: get("Relatorio - Horimetro Trator Inicio"),
    horimetro_trator_fim: get("Relatorio - Horimetro Trator Fim"),
    PARADAS_IMPREVISTAS_TRATOR: get("Relatorio - Paradas Trator"),
    OPERADORES: get("OS Realizado - Operador(es) Trator")
  };

  let numAbastecimentos = 0;
  if (activity === "Colheita") {
    if (equipmentType === 'Colhedeira') numAbastecimentos = get("Relatorio - Abastecimentos Colhedeira");
    else if (equipmentType === 'Caminhao') numAbastecimentos = get("Relatorio - Abastecimentos Caminhao");
    else if (equipmentType === 'Trator') numAbastecimentos = get("Relatorio - Abastecimentos Trator");
  } else {
    numAbastecimentos = get("Relatorio - Numero Abastecimentos");
  }
  numAbastecimentos = parseInt(numAbastecimentos || '0', 10) || 0;
  relatorio.numAbastecimentos = numAbastecimentos;

  relatorio.abastecimentos = [];
  for (let i = 1; i <= numAbastecimentos; i++) {
    relatorio.abastecimentos.push({
      h: String(get('Relatorio - ' + cfg.colH + i) || '').replace(',', '.'),
      l: String(get('Relatorio - Litros Abastecimento ' + i) || '').replace(',', '.')
    });
  }

  // Campos numéricos voltam com vírgula da planilha; os <input type="number">
  // do formulário só aceitam ponto.
  ["horimetroInicio", "horimetroFim", "horimetro_colhe_inicio", "horimetro_colhe_fim",
   "km_inicio", "km_fim", "horimetro_trator_inicio", "horimetro_trator_fim"].forEach(k => {
    relatorio[k] = String(relatorio[k] === null || relatorio[k] === undefined ? '' : relatorio[k]).replace(',', '.');
  });

  return createJsonResponse({
    success: true,
    data: {
      reportId: get("ID do Relatorio"),
      rowIndex: linhaNum,
      activity: activity,
      osId: get("ID da OS"),
      userName: get("Nome do Usuario"),
      timestamp: isoOuTexto(get("Timestamp Relatorio")),
      equipmentType: equipmentType,
      pdfUrl: get("URL do PDF"),
      observacaoOs: String(get("OS Planejado - Observacao") || ''),
      labels: labels,
      planejado: planejado,
      realizado: realizado,
      relatorio: relatorio
    }
  });
}


/* =========================================================================
 * Irrigação
 * ========================================================================= */

function handleIrrigationGet(params, action) {
  const sheet = abrirAbaRelatorio("Irrigacao", false);
  if (!sheet || sheet.getLastRow() < 2) {
    if (action === "getIrrigationIdsByLocation") {
      return createJsonResponse({ error: false, message: "Nenhuma operação de irrigação registrada até o momento.", data: [] });
    }
    return createJsonResponse({ error: true, message: "Planilha de Irrigação não encontrada ou vazia." });
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const idColIndex = headers.indexOf("ID da Operacao");
  const localColIndex = headers.indexOf("Local");

  if (action === "getIrrigationIdsByLocation") {
    const location = params.location;
    if (!location) return createJsonResponse({ error: true, message: "Local não especificado." });

    const filteredIds = dataRange
      .filter(row => row[localColIndex] === location)
      .map(row => row[idColIndex])
      .filter((id, index, self) => self.indexOf(id) === index);

    if (filteredIds.length === 0) {
      return createJsonResponse({ error: false, message: "Nenhuma operação de irrigação registrada para " + location + ".", data: [] });
    }
    return createJsonResponse({ success: true, data: filteredIds });
  }

  const id = params.id;
  if (!id) return createJsonResponse({ error: true, message: "ID da Operação não especificado." });

  const rowData = dataRange.find(row => row[idColIndex] === id);
  if (!rowData) return createJsonResponse({ error: true, message: "Operação com ID " + id + " não encontrada." });

  const operationDetails = {};
  headers.forEach((header, index) => { operationDetails[header] = rowData[index]; });
  return createJsonResponse({ success: true, data: operationDetails });
}

function handleIrrigationPost(data) {
  const activity = "Irrigacao";
  const sheet = abrirAbaRelatorio(activity, true);
  const headers = REPORT_HEADERS_CONFIG[activity];

  if (String(data.isUpdate) === 'true' && data.originalId) {
    const idColIndex = headers.indexOf("ID da Operacao");
    if (sheet.getLastRow() > 1) {
      const coluna = sheet.getRange(2, idColIndex + 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = coluna.length - 1; i >= 0; i--) {
        if (String(coluna[i][0]) === String(data.originalId)) { sheet.deleteRow(i + 2); break; }
      }
    }
  }

  const timestampReport = new Date();
  const rowDataMap = {
    "Timestamp Relatorio": timestampReport,
    "ID da Operacao": data.operationId,
    "Nome do Usuario": data.userName,
    "Local": data.local,
    "Pivo": data.pivo,
    "Data de Inicio": parseDateForSheet(data.dataInicio),
    "Hora de Inicio": data.horaInicio,
    "Data de Termino": parseDateForSheet(data.dataTermino),
    "Hora de Termino": data.horaTermino,
    "Volta": data.volta,
    "Intensidade": data.intensidade,
    "Operador": data.operador,
    "Numero de Paradas Imprevistas": data.paradas,
    "Observacao": data.observacao
  };
  sheet.appendRow(headers.map(h => rowDataMap[h] !== undefined ? rowDataMap[h] : ''));

  const templateId = REPORT_TEMPLATE_IDS[activity];
  if (!templateId) {
    return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
  }

  const nomeArquivo = 'Relatorio - ' + activity + ' - ' + data.operationId + ' - ' +
                      Utilities.formatDate(timestampReport, Session.getScriptTimeZone(), "dd-MM-yyyy");

  const pdf = gerarPdf(templateId, nomeArquivo, {
    '{{ID_IRRIGACAO}}': data.operationId,
    '{{DATA_EMISSAO}}': formatDateForPdf(timestampReport),
    '{{USUARIO_REGISTRO}}': data.userName,
    '{{LOCAL_ATIVIDADE}}': data.local,
    '{{PIVO_CENTRAL}}': data.pivo,
    '{{DATA_INICIO}}': formatDateForPdf(data.dataInicio),
    '{{DATA_TERMINO}}': formatDateForPdf(data.dataTermino),
    '{{HORA_INICIO}}': data.horaInicio,
    '{{HORA_TERMINO}}': data.horaTermino,
    '{{VOLTA}}': data.volta,
    '{{INTENSIDADE}}': data.intensidade ? data.intensidade + '%' : '',
    '{{OPERADORES}}': data.operador,
    '{{PARADAS_IMPREVISTAS}}': data.paradas,
    '{{OBSERVACAO_OS_RELATORIO}}': data.observacao
  }, null);

  return createJsonResponse({ success: true, pdfUrl: pdf.url, folderUrl: folderUrl() });
}

// =========================================================================
// PDF do relatório (usado no envio e na fila em segundo plano)
// =========================================================================
function gerarPdfRelatorio(data, activity, agora, ehEdicao) {
  const osId = data.osId;
  const equipamento = (activity === "Colheita") ? data.equipmentType : null;
  const cfg = ABASTECIMENTO_CFG[equipamento || 'Simples'];
  const numAbastecimentos = contarAbastecimentos(data, activity, equipamento);
  const templateId = (activity === 'Colheita')
    ? (REPORT_TEMPLATE_IDS[activity] || {})[equipamento]
    : REPORT_TEMPLATE_IDS[activity];

  let nomeArquivo = 'Relatorio - ' + activity;
  if (activity === 'Colheita') nomeArquivo += ' (' + equipamento + ')';
  nomeArquivo += ' - OS ' + osId + ' - ' + (data.realizado_Local || data.Local || 'local') +
                 ' - ' + Utilities.formatDate(agora, Session.getScriptTimeZone(), "dd-MM-yyyy");
  if (ehEdicao) nomeArquivo += ' (rev)';

  const linhas = [];
  for (let i = 1; i <= numAbastecimentos; i++) {
    linhas.push({ h: data[cfg.formH + i], l: data[cfg.formL + i] });
  }

  return gerarPdf(
    templateId,
    nomeArquivo,
    montarPlaceholders(data, activity, agora, osId, equipamento),
    ATIVIDADES_COM_ABASTECIMENTO.indexOf(activity) >= 0 ? { cfg: cfg, linhas: linhas } : null,
    activity === 'Pulverizacao' ? produtosRealizados(data) : null
  );
}

// =========================================================================
// Pulverização: produtos em tabela (Produto | Dose/ha | Dose/tanque)
//   área por tanque = capacidade ÷ vazão;  dose/tanque = dose/ha × área
// =========================================================================
function parseDecimal(value) {
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  const match = String(value == null ? '' : value).match(/-?\d+(?:[.,]\d+)*/);
  if (!match) return NaN;
  let text = match[0];
  text = (text.indexOf('.') !== -1 && text.indexOf(',') !== -1)
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  return parseFloat(text);
}

function formatDecimal(num) {
  if (!isFinite(num)) return '';
  return String(Math.round(num * 100) / 100).replace('.', ',');
}

function doseTanqueTexto(dosagem, area) {
  const dose = parseDecimal(dosagem);
  if (!isFinite(dose) || !(area > 0)) return '';
  const unidade = String(dosagem)
    .replace(/-?\d+(?:[.,]\d+)*/, '')
    .replace(/\s*\/\s*ha\b\.?/i, '')
    .trim();
  if (unidade.indexOf('/') !== -1) return '';
  return formatDecimal(dose * area) + (unidade ? ' ' + unidade : '');
}

/** "Roundup: 3 l/ha; Óleo: 0,5 l/ha;" → [{nome, dose}] */
function produtosDoTexto(texto) {
  return String(texto || '').split(';').map(p => p.trim()).filter(Boolean).map(parte => {
    const i = parte.indexOf(':');
    const nome = i === -1 ? parte : parte.substring(0, i).trim();
    const dose = i === -1 ? '' : parte.substring(i + 1).trim();
    return { nome: nome, dose: dose === 'N/A' ? '' : dose };
  });
}

/** Produtos como foram aplicados, com a dose/tanque refeita pelo realizado. */
function produtosRealizados(data) {
  const cap = parseDecimal(data.realizado_Capacidadedotanque || data.Capacidadedotanque);
  const vaz = parseDecimal(data.realizado_vazaoLHa || data.vazaoLHa);
  const area = (cap > 0 && vaz > 0) ? cap / vaz : NaN;
  return produtosDoTexto(data.realizado_produtosQuantidade || data.produtosQuantidade).map(p => ({
    nome: p.nome, dose: p.dose, tanque: doseTanqueTexto(p.dose, area)
  }));
}

function doseTanqueRealizada(data) {
  return produtosRealizados(data)
    .map(p => p.nome + ': ' + (p.tanque || 'N/A') + ';').join(' ');
}

/**
 * Troca o texto "{{PRODUTOS_QTD_HA}}" por uma tabela logo abaixo do parágrafo
 * e tira as linhas "Dose/ha: {{DOSE_HA}}" e "Dose/tanque: {{DOSE_TANQUE}}".
 */
function inserirTabelaProdutos(body, produtos, mapa) {
  const achado = body.findText(escapeParaFindText('{{PRODUTOS_QTD_HA}}'));
  if (achado) {
    let paragrafo = achado.getElement();
    while (paragrafo.getParent() && paragrafo.getParent().getType() !== DocumentApp.ElementType.BODY_SECTION) {
      paragrafo = paragrafo.getParent();
    }
    const celulas = [['Produto', 'Dose/ha', 'Dose/tanque']].concat(
      produtos.length ? produtos.map(p => [p.nome || '', p.dose || '', p.tanque || '']) : [['—', '', '']]);
    const tabela = body.insertTable(body.getChildIndex(paragrafo) + 1, celulas);
    try { tabela.getRow(0).editAsText().setBold(true); } catch (err) { /* só estética */ }
    paragrafo.replaceText('Produtos e quantidades:', 'Produtos utilizados:');
    paragrafo.replaceText(escapeParaFindText('{{PRODUTOS_QTD_HA}}'), '');
    delete mapa['{{PRODUTOS_QTD_HA}}'];
  }
  ['Dose/ha:\\s*\\{\\{DOSE_HA\\}\\}', 'Dose/tanque:\\s*\\{\\{DOSE_TANQUE\\}\\}'].forEach(padrao => {
    for (let n = 0; n < 5; n++) {
      const r = body.findText(padrao);
      if (!r) break;
      const elemento = r.getElement();
      const par = elemento.getParent();
      const textoPar = par && par.getText ? par.getText() : '';
      if (par && new RegExp('^\\s*' + padrao + '\\s*$').test(textoPar)) {
        try { par.removeFromParent(); continue; } catch (err) { /* último parágrafo: só limpa */ }
      }
      body.replaceText(padrao, '');
    }
  });
}

// =========================================================================
// FILA DE PDF (geração em segundo plano) — mesmo desenho do projeto de OS
// =========================================================================
function planilhaRelatorios() { return SpreadsheetApp.openById(REPORT_SPREADSHEET_ID); }

function abaFilaPdf(ss) {
  let aba = ss.getSheetByName(FILA_PDF_ABA);
  if (!aba) {
    aba = ss.insertSheet(FILA_PDF_ABA);
    aba.appendRow(FILA_PDF_CABECALHOS);
    try { aba.hideSheet(); } catch (err) { /* visível não atrapalha */ }
  }
  return aba;
}

function lerFilaPdf(ss) {
  const aba = abaFilaPdf(ss);
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, FILA_PDF_CABECALHOS.length).getValues().map((v, i) => ({
    linha: i + 2, chave: String(v[0]), atividade: String(v[1]), versao: String(v[2]),
    status: String(v[3]), tentativas: Number(v[4]) || 0, erro: String(v[5] || ''), payload: String(v[6] || '')
  }));
}

/** Chamar DENTRO da trava (o doPost já está nela). */
function enfileirarPdf(chave, atividade, pacote) {
  const ss = planilhaRelatorios();
  const aba = abaFilaPdf(ss);
  const linha = [chave, atividade, Utilities.getUuid(), 'pendente', 0, '', JSON.stringify(pacote)];
  const existente = lerFilaPdf(ss).filter(i => i.chave === String(chave))[0];
  if (existente) aba.getRange(existente.linha, 1, 1, linha.length).setValues([linha]);
  else aba.appendRow(linha);
}

/** Devolve false se não foi possível agendar (acionadores sem autorização). */
function agendarFilaPdf() {
  try {
    const jaAgendado = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'processarFilaPdf');
    if (!jaAgendado) ScriptApp.newTrigger('processarFilaPdf').timeBased().after(10 * 1000).create();
    return true;
  } catch (err) {
    Logger.log("Não foi possível agendar a fila de PDF: " + err);
    return false;
  }
}

function removerGatilhosAvulsos(nomeFuncao) {
  try {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === nomeFuncao)
      .forEach(t => ScriptApp.deleteTrigger(t));
  } catch (err) { /* sem permissão */ }
}

function processarFilaPdf() {
  removerGatilhosAvulsos('processarFilaPdf');
  const props = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { agendarFilaPdf(); return; }
  try {
    if (Number(props.getProperty('fila_pdf_ocupada_ate') || 0) > Date.now()) { agendarFilaPdf(); return; }
    props.setProperty('fila_pdf_ocupada_ate', String(Date.now() + 6 * 60 * 1000));
  } finally {
    lock.releaseLock();
  }

  const inicio = Date.now();
  const tentados = {};
  const ss = planilhaRelatorios();
  try {
    while (Date.now() - inicio < FILA_PDF_LIMITE_MS) {
      const item = lerFilaPdf(ss).filter(i => i.status === 'pendente' && !tentados[i.chave + i.versao])[0];
      if (!item) break;
      tentados[item.chave + item.versao] = true;
      processarItemPdf(ss, item);
    }
  } finally {
    props.deleteProperty('fila_pdf_ocupada_ate');
  }
  if (lerFilaPdf(ss).some(i => i.status === 'pendente')) agendarFilaPdf();
}

function processarItemPdf(ss, item) {
  let pdf;
  try {
    const pacote = JSON.parse(item.payload);
    pdf = gerarPdfRelatorio(pacote.data, item.atividade, new Date(pacote.agora), pacote.ehEdicao);
  } catch (err) {
    Logger.log("PDF do relatório " + item.chave + " falhou: " + err);
    registrarFalhaFila(ss, item, err);
    return;
  }

  let pdfAnterior = '';
  let descartarNovo = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const atual = lerFilaPdf(ss).filter(i => i.chave === item.chave)[0];
    if (!atual || atual.versao !== item.versao) {
      descartarNovo = true;   // relatório corrigido durante a geração
    } else {
      const sheet = ss.getSheetByName(item.atividade);
      const headers = sheet ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
      const linha = sheet ? localizarLinhaRelatorio(sheet, headers, item.chave, '') : -1;
      if (linha < 0) {
        descartarNovo = true;
      } else {
        const iId = headers.indexOf("ID do PDF");
        pdfAnterior = iId >= 0 ? sheet.getRange(linha, iId + 1).getValue() : '';
        if (iId >= 0) sheet.getRange(linha, iId + 1).setValue(pdf.id);
        const iUrl = headers.indexOf("URL do PDF");
        if (iUrl >= 0) sheet.getRange(linha, iUrl + 1).setValue(pdf.url);
        const iStatus = headers.indexOf("Status PDF");
        if (iStatus >= 0) sheet.getRange(linha, iStatus + 1).setValue('ok');
      }
      abaFilaPdf(ss).deleteRow(atual.linha);
    }
  } finally {
    lock.releaseLock();
  }

  const descartar = descartarNovo ? pdf.id : (pdfAnterior && pdfAnterior !== pdf.id ? pdfAnterior : '');
  if (descartar) {
    try { DriveApp.getFileById(descartar).setTrashed(true); } catch (err) { Logger.log("PDF não descartado: " + err); }
  }
}

function registrarFalhaFila(ss, item, err) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const atual = lerFilaPdf(ss).filter(i => i.chave === item.chave)[0];
    if (!atual || atual.versao !== item.versao) return;
    const tentativas = atual.tentativas + 1;
    abaFilaPdf(ss).getRange(atual.linha, 4, 1, 3).setValues([[
      tentativas >= FILA_PDF_MAX_TENTATIVAS ? 'erro' : 'pendente', tentativas, String(err).slice(0, 500)]]);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================
// CONFIRMAÇÃO DO RT E ARQUIVAMENTO POR SAFRA
// =========================================================================

/**
 * RODAR UMA VEZ no editor depois de publicar esta versão: cria o acionador da
 * caixa "Confirmado RT" e a rotina de hora em hora, e pede as autorizações.
 */
function instalarAcionadores() {
  ScriptApp.getProjectTriggers()
    .filter(t => ['aoEditarPlanilha', 'rotinaHoraria'].indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('aoEditarPlanilha').forSpreadsheet(REPORT_SPREADSHEET_ID).onEdit().create();
  ScriptApp.newTrigger('rotinaHoraria').timeBased().everyHours(1).create();
  DriveApp.getFolderById(ARQUIVO_PASTA_RAIZ_ID).getName();
  // Caixas de seleção nas abas que já existem.
  const ss = planilhaRelatorios();
  ATIVIDADES_ARQUIVAVEIS.forEach(atividade => {
    const sheet = ss.getSheetByName(atividade);
    if (!sheet || sheet.getLastRow() < 1) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    garantirColunas(sheet, headers, [COLUNA_CONFIRMACAO]);
  });
  Logger.log("Acionadores instalados.");
}

function rotinaHoraria() {
  processarFilaPdf();
  arquivarRelatoriosConfirmados();
}

/** Acionador de edição: só reage à coluna "Confirmado RT". */
function aoEditarPlanilha(e) {
  try {
    const aba = e.range.getSheet();
    if (ATIVIDADES_ARQUIVAVEIS.indexOf(aba.getName()) === -1) return;
    const headers = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
    const col = headers.indexOf(COLUNA_CONFIRMACAO) + 1;
    if (col < 1 || e.range.getColumn() > col || e.range.getLastColumn() < col) return;
  } catch (err) {
    return;
  }
  arquivarRelatoriosConfirmados();
}

function nomeSafraPasta(safra) {
  const texto = String(safra || '').replace(/[\/\\]/g, '-').replace(/\s+/g, ' ').trim();
  return texto || 'Sem safra';
}

function safraPorData(valor) {
  const data = parseDateForSheet(valor);
  if (!(data instanceof Date) || isNaN(data.getTime())) return '';
  const ano = data.getMonth() >= 6 ? data.getFullYear() : data.getFullYear() - 1;
  return 'Safra ' + ano + '/' + String((ano + 1) % 100).padStart(2, '0');
}

function obterArquivoSafra(safra) {
  const nome = nomeSafraPasta(safra);
  const raiz = DriveApp.getFolderById(ARQUIVO_PASTA_RAIZ_ID);
  const pastas = raiz.getFoldersByName(nome);
  const pasta = pastas.hasNext() ? pastas.next() : raiz.createFolder(nome);
  const nomePlanilha = 'Arquivo - ' + nome;
  const arquivos = pasta.getFilesByName(nomePlanilha);
  let planilha;
  if (arquivos.hasNext()) {
    planilha = SpreadsheetApp.openById(arquivos.next().getId());
  } else {
    planilha = SpreadsheetApp.create(nomePlanilha);
    DriveApp.getFileById(planilha.getId()).moveTo(pasta);
  }
  return { pasta: pasta, planilha: planilha };
}

function arquivarLinha(planilha, nomeAba, cabecalhos, valores) {
  const colunas = cabecalhos.concat(['Arquivado em']);
  let aba = planilha.getSheetByName(nomeAba);
  if (!aba) {
    aba = planilha.insertSheet(nomeAba);
    aba.appendRow(colunas);
    planilha.getSheets().forEach(s => {
      if (s.getName() !== nomeAba && s.getLastRow() === 0 && planilha.getSheets().length > 1) planilha.deleteSheet(s);
    });
  }
  let atuais = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  const faltam = colunas.filter(h => h && atuais.indexOf(h) === -1);
  if (faltam.length) {
    aba.getRange(1, atuais.length + 1, 1, faltam.length).setValues([faltam]);
    atuais = atuais.concat(faltam);
  }
  aba.appendRow(atuais.map(h => {
    if (h === 'Arquivado em') return new Date();
    const i = cabecalhos.indexOf(h);
    return i >= 0 ? valores[i] : '';
  }));
}

/** Pede ao projeto de OS que arquive a OS (ele lê esta aba de hora em hora). */
function pedirArquivoOs(ss, osId, atividade, safra, naoAntes) {
  let aba = ss.getSheetByName(FILA_ARQUIVO_OS_ABA);
  if (!aba) {
    aba = ss.insertSheet(FILA_ARQUIVO_OS_ABA);
    aba.appendRow(FILA_ARQUIVO_OS_CABECALHOS);
    try { aba.hideSheet(); } catch (err) { /* ok */ }
  }
  const linha = [osId, atividade, safra, naoAntes, new Date()];
  const n = aba.getLastRow();
  const existentes = n > 1 ? aba.getRange(2, 1, n - 1, 2).getValues() : [];
  const i = existentes.findIndex(r => String(r[0]) === String(osId) && String(r[1]) === atividade);
  if (i >= 0) aba.getRange(i + 2, 1, 1, linha.length).setValues([linha]);
  else aba.appendRow(linha);
}

/** Pedidos com mais de 120 dias já foram atendidos: limpa a aba. */
function limparPedidosAntigos(ss) {
  const aba = ss.getSheetByName(FILA_ARQUIVO_OS_ABA);
  if (!aba || aba.getLastRow() < 2) return;
  const limite = Date.now() - 120 * 24 * 3600 * 1000;
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, FILA_ARQUIVO_OS_CABECALHOS.length).getValues();
  for (let i = valores.length - 1; i >= 0; i--) {
    const pedido = valores[i][4] ? new Date(valores[i][4]).getTime() : 0;
    if (pedido && pedido < limite) aba.deleteRow(i + 2);
  }
}

/**
 * Move para a pasta da safra cada relatório com "Confirmado RT" marcado:
 * a linha vai para a planilha "Arquivo - Safra ..." (aba "RO - atividade") e o
 * PDF para a pasta. Relatório com PDF ainda em geração espera a próxima volta.
 */
function arquivarRelatoriosConfirmados() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 0;
  const movimentos = [];
  let arquivados = 0;
  try {
    const ss = planilhaRelatorios();
    const destinos = {};
    ATIVIDADES_ARQUIVAVEIS.forEach(atividade => {
      const sheet = ss.getSheetByName(atividade);
      if (!sheet || sheet.getLastRow() < 2) return;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const iRt = headers.indexOf(COLUNA_CONFIRMACAO);
      if (iRt === -1) return;
      const valores = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
      const col = nome => headers.indexOf(nome);
      const osAfetadas = {};

      for (let i = valores.length - 1; i >= 0; i--) {
        const linha = valores[i];
        if (linha[iRt] !== true) continue;
        if (col("Status PDF") !== -1 && linha[col("Status PDF")] === 'gerando') continue;

        const safra = (col("Safra") !== -1 && linha[col("Safra")]) ||
          safraPorData(linha[col("OS Planejado - Data de Inicio")]);
        const nome = nomeSafraPasta(safra);
        if (!destinos[nome]) destinos[nome] = obterArquivoSafra(safra);
        arquivarLinha(destinos[nome].planilha, 'RO - ' + atividade, headers, linha);
        const pdfId = col("ID do PDF") !== -1 ? String(linha[col("ID do PDF")] || '') : '';
        if (pdfId) movimentos.push({ pdfId: pdfId, pasta: destinos[nome].pasta });
        sheet.deleteRow(i + 2);
        arquivados++;

        const osId = String(linha[col("ID da OS")] || '');
        if (osId) osAfetadas[osId] = { safra: safra, termino: linha[col("OS Planejado - Data de Termino")] };
      }

      // A OS só é arquivada quando não sobra relatório dela por confirmar. Na
      // Colheita (vários relatórios por OS) espera ainda o fim previsto da OS.
      const restantes = sheet.getLastRow() > 1
        ? sheet.getRange(2, col("ID da OS") + 1, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0]))
        : [];
      Object.keys(osAfetadas).forEach(osId => {
        if (restantes.indexOf(osId) !== -1) return;
        let naoAntes = new Date();
        if (atividade === 'Colheita') {
          const termino = parseDateForSheet(osAfetadas[osId].termino);
          if (termino instanceof Date && !isNaN(termino.getTime())) {
            naoAntes = new Date(termino.getTime() + 24 * 3600 * 1000);
          }
        }
        pedirArquivoOs(ss, osId, atividade, osAfetadas[osId].safra, naoAntes);
      });
    });
    limparPedidosAntigos(ss);
  } finally {
    lock.releaseLock();
  }

  movimentos.forEach(m => {
    try { DriveApp.getFileById(m.pdfId).moveTo(m.pasta); }
    catch (err) { Logger.log("PDF " + m.pdfId + " não pôde ser movido: " + err); }
  });
  return arquivados;
}
