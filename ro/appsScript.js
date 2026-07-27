/*
* Apps Script da PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
*
* Responsabilidades:
*  1. Receber os dados do formulário (doPost) e gravá-los na planilha.
*  2. Gerar o PDF do relatório a partir do template do Google Docs.
*  3. Servir as consultas de Irrigação e de Relatórios de Operação (doGet).
*  4. ATUALIZAR um relatório já enviado (edição), regerando o PDF.
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
const CONTROL_HEADERS = ["ID do Relatorio", "ID do PDF", "URL do PDF", "Ultima Edicao", "Editado Por"];

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
  ["Dose/tanque",               "Dosetanque",              "Dose/tanque",               "num"],
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
  } else if (sheet.getLastRow() === 0 && headersConfig.length > 0) {
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
function gerarPdf(templateId, nomeArquivo, substituicoes, abastecimento) {
  const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
  // makeCopy(nome, pasta) já nomeia na cópia — evita um setName() depois.
  const tempDocFile = DriveApp.getFileById(templateId).makeCopy(nomeArquivo + ' (tmp)', pdfFolder);
  const docId = tempDocFile.getId();

  const mapa = {};
  Object.keys(substituicoes).forEach(k => {
    const v = substituicoes[k];
    mapa[k] = (v === null || v === undefined || v === '') ? ' ' : String(v);
  });

  // ---- 1. Tabela de abastecimentos (precisa do DocumentApp: cria/apaga linhas)
  if (abastecimento && abastecimento.cfg) {
    const cfg = abastecimento.cfg;
    const linhas = abastecimento.linhas || [];
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const achou = body.findText(escapeParaFindText(cfg.tplH));

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
    const reportId = (ehEdicao && linhaAtual && linhaAtual[idxIdRel]) ? linhaAtual[idxIdRel] : gerarIdRelatorio();

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

    let pdf = null;
    if (templateId) {
      let nomeArquivo = 'Relatorio - ' + activity;
      if (activity === 'Colheita') nomeArquivo += ' (' + equipamento + ')';
      nomeArquivo += ' - OS ' + osId + ' - ' + (rowDataMap["OS Realizado - Local"] || 'local') +
                     ' - ' + Utilities.formatDate(agora, Session.getScriptTimeZone(), "dd-MM-yyyy");
      if (ehEdicao) nomeArquivo += ' (rev)';

      const linhas = [];
      for (let i = 1; i <= numAbastecimentos; i++) {
        linhas.push({ h: data[cfg.formH + i], l: data[cfg.formL + i] });
      }

      pdf = gerarPdf(
        templateId,
        nomeArquivo,
        montarPlaceholders(data, activity, agora, osId, equipamento),
        ATIVIDADES_COM_ABASTECIMENTO.indexOf(activity) >= 0 ? { cfg: cfg, linhas: linhas } : null
      );

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
    if (ehEdicao) {
      sheet.getRange(linhaAlvo, 1, 1, headers.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
    }
    return createJsonResponse({ success: true, pdfUrl: pdf.url, folderUrl: folderUrl(), reportId: reportId });

  } catch (error) {
    Logger.log("Erro no servidor: " + error + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error });
  } finally {
    lock.releaseLock();
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
    "OS Planejado - Dose/tanque": formatNumberForSheet(data.Dosetanque), "OS Realizado - Dose/tanque": formatNumberForSheet(data.realizado_Dosetanque),
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
    '{{DOSE_TANQUE}}': formatNumberForPdf(data.realizado_Dosetanque),
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
