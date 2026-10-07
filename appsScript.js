/* =========================================================================
 * FAV — Ordem de Serviço · Google Apps Script (planilha "FAV - Ordem de Serviço")
 * https://docs.google.com/spreadsheets/d/1vWqfkjNYD71bsea_mCY_WmmjUKZJzQaPzIThVyisp34/
 *
 * Como instalar:
 *   1. Abrir a planilha → menu Extensões → Apps Script.
 *   2. Substituir todo o conteúdo por este arquivo.
 *   3. (Opcional, mas recomendado — deixa o PDF bem mais rápido)
 *      Menu "Serviços" (+) → adicionar "Google Docs API" com o identificador
 *      padrão `Docs`. Sem isso o script continua funcionando pelo caminho antigo.
 *   4. Implantar → Gerenciar implantações → editar a implantação existente →
 *      Nova versão. A URL /exec continua a mesma (o app e o Relatório de
 *      Operações apontam para ela).
 *
 * O que mudou nesta versão:
 *   • PDF mais rápido: todas as substituições de texto vão em UMA chamada da
 *     API do Docs (antes eram ~40 chamadas de serviço, uma por placeholder);
 *     a reformatação de colunas de data deixou de rodar a cada envio.
 *   • Idempotência: gravação por ID da OS (upsert). Se o celular reenviar uma
 *     OS que já chegou (queda de sinal depois do envio), a linha é atualizada
 *     em vez de duplicar.
 *   • Edição: `mode=update` regrava a linha, refaz o PDF e descarta o antigo.
 *   • Consulta: `?action=list` e `?action=get` para a tela de edição do app.
 *     O contrato antigo (`?activity=` e `?activity=&osId=`), usado pelo app de
 *     Relatório de Operações, continua valendo exatamente como era.
 *
 * Out/2026:
 *   • Pulverização: dose por tanque calculada POR PRODUTO
 *       área por tanque (ha) = capacidade do tanque ÷ vazão (L/ha)
 *       dose por tanque      = dosagem (/ha) × área por tanque
 *     Vai como 3ª coluna da tabela "Produtos Utilizados" do PDF e sai da linha
 *     "Dose/tanque" abaixo da tabela. Se o template ainda não tiver a coluna,
 *     ela é criada na cópia de cada PDF; para deixar o template definitivo,
 *     rode uma vez a função atualizarTemplatePulverizacao() no editor.
 *     A coluna "Dose/tanque" da planilha passa a guardar a lista por produto.
 *   • `?activity=X&detalhes=1` devolve todas as OS da aba de uma vez (o app de
 *     Relatório de Operações usa para baixar tudo para o uso offline).
 * ========================================================================= */

// --- CONFIGURAÇÕES --------------------------------------------------------
const TEMPLATE_IDS = {
  "PreparodeArea": "19ZED49t_UCG8vb5QTaeNMDwoMtyEysmKh_n5oV0KBPU",
  "TratamentodeSementes": "17-Ao_mdN82xD1qipdMVqnac2k4Kga17nPtSDIhN2cJY",
  "Plantio": "1PbO-nm4JGm2WtOjftXTCedmwdaxc3I-psXYK5HYysj0",
  "Pulverizacao": "1ukv9o1ZAkBfMbhDLo4Qcb7BeCSBvxBdNs207Hq3xLx4",
  "Colheita": "1epcbgrnwAMKgEEDxdi8bNWskM7SXjZxf_FpAIUVR6Z8",
  "Lancas": "1kFocDdOm0H0KX1dPtR4MMSQrHjkaR3FWgSfJ4w8I7L0"
};
const PDF_FOLDER_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754";
const MAX_PRODUCTS = 20;      // mesmo limite para produtos e caminhões
const ID_HEADER = "ID da OS";
const LIST_CACHE_KEY = "os_list_v1";
const LIST_CACHE_SECONDS = 60;

const HEADERS_CONFIG = {
  "PreparodeArea": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Trator", "Operador(es)", "Implemento", "Observacao"],
  "TratamentodeSementes": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Qtd Sementes (Kg)", "Produtos e Dosagens", "Maquina", "Operadores", "Observacao"],
  "Plantio": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Qtd/ha - Maximo", "Qtd/ha - Minimo", "Insumos", "Trator", "Implemento", "Plantas por metro", "Espacamento entre plantas", "PMS", "Operador(es)", "Observacao"],
  "Pulverizacao": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Produto(s) e quantidade/ha", "Maquina", "Bico", "Capacidade do tanque", "Vazao (L/ha)", "Operador(es)", "Pressao", "Dose/ha", "Dose/tanque", "Implemento", "Observacao"],
  "Colheita": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Produtividade estimada", "Colhedeira", "Operador(es) Colhedeira", "Trator", "Operador(es) Trator", "Implemento", "Observacao"],
  "Lancas": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Quantidade de produto/hectare", "Maquina", "Operador(es)", "Implemento", "Observacao"]
};

// Colunas de controle acrescentadas automaticamente às abas existentes.
const CONTROL_HEADERS = ["PDF ID", "PDF URL", "Atualizado em"];

// Cabeçalho da planilha  ->  nome do campo usado pelo formulário do app.
const HEADER_TO_FIELD = {
  "id da os": "osId",
  "nome do usuario": "userName",
  "local": "local",
  "talhoes (area)": "talhoes",
  "area total (ha)": "areaTotalHectares",
  "data de inicio": "dataInicio",
  "data de termino": "dataTermino",
  "cultura e cultivar": "culturaCultivar",
  "qtd sementes (kg)": "qtdSementesKg",
  "qtd/ha - maximo": "qtdHaMax",
  "qtd/ha - minimo": "qtdHaMin",
  "plantas por metro": "plantasPorMetro",
  "espacamento entre plantas": "espacamentoPlantas",
  "pms": "pms",
  "bico": "bico",
  "capacidade do tanque": "capacidadeTanque",
  "vazao (l/ha)": "vazaoLHa",
  "pressao": "pressao",
  "dose/ha": "doseHa",
  "dose/tanque": "doseTanque",
  "produtividade estimada": "produtividadeEstimada",
  "trator": "trator",
  "implemento": "implemento",
  "maquina": "maquina",
  "colhedeira": "maquina",
  "operador(es)": "operadores",
  "operadores": "operadores",
  "operador(es) colhedeira": "operadoresMaquina",
  "operador(es) trator": "operadoresTrator",
  "observacao": "observacao"
};

// Cabeçalhos que guardam a lista concatenada de produtos/insumos.
const PRODUCT_HEADERS = [
  "produtos e dosagens", "insumos",
  "produto(s) e quantidade/ha", "quantidade de produto/hectare"
];

const DATE_FIELDS = ["dataInicio", "dataTermino"];

// Atividades que têm tanque (capacidade + vazão) e, portanto, dose por tanque.
const ATIVIDADES_COM_TANQUE = ["Pulverizacao"];
const PH_NOME_PRODUTO = "{{Nome Produto}}";
const PH_DOSE_PRODUTO = "{{Dose Produto}}";
const PH_DOSE_TANQUE_PRODUTO = "{{Dose Tanque Produto}}";
const TITULO_COLUNA_DOSE_TANQUE = "Dose/tanque";

// --- AUXILIARES -----------------------------------------------------------
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** minúsculas, sem acento, sem espaços duplicados — para casar cabeçalhos. */
function normalizeHeader(header) {
  return String(header || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function formatDateForPdf(dateInput) {
  if (!dateInput) return '';
  try {
    const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput;
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) {
    return dateInput;
  }
}

function formatDateForInput(value) {
  if (!value) return '';
  const date = (value instanceof Date) ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatDateColumnsInSheet(sheet, headers) {
  const dateHeaders = ["Timestamp", "Data de Inicio", "Data de Termino"];
  headers.forEach(function (header, index) {
    if (dateHeaders.indexOf(header) !== -1) {
      sheet.getRange(2, index + 1, sheet.getMaxRows()).setNumberFormat("dd/MM/yyyy");
    }
  });
}

function readHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
}

function headerIndex(headers, headerName) {
  const target = normalizeHeader(headerName);
  for (let i = 0; i < headers.length; i++) {
    if (normalizeHeader(headers[i]) === target) return i;
  }
  return -1;
}

/** Localiza a linha da OS lendo apenas a coluna de ID (barato mesmo com muitas linhas). */
function findRowByOsId(sheet, headers, osId) {
  if (!osId) return -1;
  const idColumn = headerIndex(headers, ID_HEADER);
  const lastRow = sheet.getLastRow();
  if (idColumn === -1 || lastRow < 2) return -1;

  const ids = sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {   // do mais recente para o mais antigo
    if (String(ids[i][0]).trim() === String(osId).trim()) return i + 2;
  }
  return -1;
}

/** Primeiro número do texto, aceitando vírgula decimal ("0,5 l/ha" → 0.5). */
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

/** 90 → "90"; 4.5 → "4,5"; 1/3 → "0,33". */
function formatDecimal(num) {
  if (!isFinite(num)) return '';
  const arredondado = Math.round(num * 100) / 100;
  return String(arredondado).replace('.', ',');
}

function areaPorTanque(capacidade, vazao) {
  const cap = parseDecimal(capacidade);
  const vaz = parseDecimal(vazao);
  return (cap > 0 && vaz > 0) ? cap / vaz : NaN;
}

/** "3 l /ha" com 30 ha/tanque → "90 l". Vazio se a dosagem não for por ha. */
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

/**
 * Preenche data.areaPorTanque, data['dose_tanque_produto_N'] e
 * data.doseTanqueConcatenado. O servidor recalcula sempre (é ele quem grava):
 * OS que estavam na fila do celular antes desta versão chegam sem esses campos.
 */
function calcularDosesTanque(data, numProducts) {
  const area = areaPorTanque(data.capacidadeTanque, data.vazaoLHa);
  data.areaPorTanque = area > 0 ? formatDecimal(area) : '';
  let texto = '';
  for (let i = 1; i <= numProducts; i++) {
    const nome = data['nome_produto_' + i] || data['product_name_' + i];
    const dose = data['dose_produto_' + i] || data['product_dosage_' + i];
    const porTanque = doseTanqueTexto(dose, area);
    data['dose_tanque_produto_' + i] = porTanque;
    if (nome && String(nome).trim() !== '') texto += `${nome}: ${porTanque || 'N/A'}; `;
  }
  data.doseTanqueConcatenado = texto.trim();
}

function concatenarProdutos(data, numProducts) {
  let texto = '';
  for (let i = 1; i <= numProducts; i++) {
    const nome = data['nome_produto_' + i] || data['product_name_' + i];
    const dose = data['dose_produto_' + i] || data['product_dosage_' + i];
    if (nome && String(nome).trim() !== '') {
      texto += `${nome}: ${dose || 'N/A'}; `;
    }
  }
  return texto.trim();
}

// =========================================================================
// GRAVAÇÃO (POST)
// =========================================================================
function doPost(e) {
  const inicio = Date.now();
  try {
    const data = e.parameter;
    const activity = data.activity;
    const osId = data.osId;

    if (!activity) {
      return createJsonResponse({ success: false, message: "Erro: Atividade não especificada." });
    }
    if (!HEADERS_CONFIG[activity]) {
      return createJsonResponse({ success: false, message: "Erro: Atividade desconhecida: " + activity });
    }

    const numProducts = parseInt(data.numProducts || '0', 10) || 0;
    const numTrucks = (activity === "Colheita") ? (parseInt(data.numTrucks || '0', 10) || 0) : 0;
    data.produtosConcatenados = concatenarProdutos(data, numProducts);
    if (ATIVIDADES_COM_TANQUE.indexOf(activity) !== -1) calcularDosesTanque(data, numProducts);

    // --- planilha (com trava: leitura + escrita da mesma linha) ---
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    let sheet, headers, rowNumber, timestampOriginal, pdfIdAnterior, isUpdate;
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      sheet = ss.getSheetByName(activity);

      let headersDesejados = HEADERS_CONFIG[activity].slice();
      for (let i = 1; i <= numTrucks; i++) {
        headersDesejados.push('Caminhão ' + i);
        headersDesejados.push('Motorista ' + i);
      }
      headersDesejados = headersDesejados.concat(CONTROL_HEADERS);

      if (!sheet) {
        sheet = ss.insertSheet(activity);
        sheet.appendRow(headersDesejados);
        formatDateColumnsInSheet(sheet, headersDesejados);   // só na criação da aba
        headers = headersDesejados;
      } else {
        headers = readHeaders(sheet);
        const existentes = headers.map(normalizeHeader);
        const faltantes = headersDesejados.filter(h => existentes.indexOf(normalizeHeader(h)) === -1);
        if (faltantes.length) {
          sheet.getRange(1, Math.max(1, headers.length + 1), 1, faltantes.length).setValues([faltantes]);
          headers = readHeaders(sheet);
        }
      }

      rowNumber = findRowByOsId(sheet, headers, osId);
      isUpdate = rowNumber > 0;

      const agora = new Date();
      timestampOriginal = agora;
      if (isUpdate) {
        const tsIndex = headerIndex(headers, "Timestamp");
        if (tsIndex !== -1) {
          const valorAtual = sheet.getRange(rowNumber, tsIndex + 1).getValue();
          if (valorAtual) timestampOriginal = valorAtual;
        }
        const pdfIdIndex = headerIndex(headers, "PDF ID");
        if (pdfIdIndex !== -1) pdfIdAnterior = sheet.getRange(rowNumber, pdfIdIndex + 1).getValue();
      }

      const dataMap = montarDataMap(data, activity, timestampOriginal, agora, numTrucks);
      const rowValues = headers.map(header => {
        const chave = normalizeHeader(header);
        return dataMap.hasOwnProperty(chave) ? dataMap[chave] : '';
      });

      if (isUpdate) {
        sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        rowNumber = sheet.getLastRow();
      }
    } finally {
      lock.releaseLock();
    }

    CacheService.getScriptCache().remove(LIST_CACHE_KEY);

    // --- PDF ---
    const templateId = TEMPLATE_IDS[activity];
    if (!templateId) {
      return createJsonResponse({
        success: true, osId: osId, mode: isUpdate ? 'update' : 'create',
        message: "Dados registrados, mas o template de PDF não foi encontrado.",
        elapsedMs: Date.now() - inicio
      });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_FOLDER_ID);
    const arquivo = gerarPdf({
      templateId: templateId,
      pdfFolder: pdfFolder,
      activity: activity,
      data: data,
      numProducts: numProducts,
      numTrucks: numTrucks,
      timestampEmissao: timestampOriginal
    });

    // Descarta o PDF anterior desta OS para a pasta não acumular versões.
    if (pdfIdAnterior) {
      try { DriveApp.getFileById(pdfIdAnterior).setTrashed(true); }
      catch (err) { Logger.log("PDF anterior não pôde ser descartado: " + err); }
    }

    gravarDadosDoPdf(sheet, headers, rowNumber, arquivo.getId(), arquivo.getUrl());

    return createJsonResponse({
      success: true,
      mode: isUpdate ? 'update' : 'create',
      message: isUpdate ? "Ordem de serviço atualizada e PDF refeito!" : "Dados registrados e PDF criado!",
      osId: osId,
      pdfUrl: arquivo.getUrl(),
      pdfId: arquivo.getId(),
      folderUrl: pdfFolder.getUrl(),
      elapsedMs: Date.now() - inicio
    });

  } catch (error) {
    Logger.log("Erro no servidor: " + error + " Stack: " + (error && error.stack));
    return createJsonResponse({
      success: false,
      message: "Ocorreu um erro no servidor: " + error,
      elapsedMs: Date.now() - inicio
    });
  }
}

function montarDataMap(data, activity, timestampOriginal, agora, numTrucks) {
  const mapa = {
    "timestamp": timestampOriginal,
    "id da os": data.osId,
    "nome do usuario": data.userName,
    "local": data.local,
    "talhoes (area)": data.talhoes,
    "area total (ha)": data.areaTotalHectares,
    "data de inicio": data.dataInicio,
    "data de termino": data.dataTermino,
    "trator": data.trator,
    "operador(es)": data.operadores,
    "operadores": data.operadores,
    "implemento": data.implemento,
    "observacao": data.observacao,
    "cultura e cultivar": data.culturaCultivar,
    "qtd sementes (kg)": data.qtdSementesKg,
    "produtos e dosagens": data.produtosConcatenados,
    "maquina": data.maquina,
    "qtd/ha - maximo": data.qtdHaMax,
    "qtd/ha - minimo": data.qtdHaMin,
    "insumos": data.produtosConcatenados,
    "plantas por metro": data.plantasPorMetro,
    "espacamento entre plantas": data.espacamentoPlantas,
    "pms": data.pms,
    "bico": data.bico,
    "capacidade do tanque": data.capacidadeTanque,
    "vazao (l/ha)": data.vazaoLHa,
    "pressao": data.pressao,
    "dose/ha": data.doseHa,
    "dose/tanque": ATIVIDADES_COM_TANQUE.indexOf(activity) !== -1 ? data.doseTanqueConcatenado : data.doseTanque,
    "produtividade estimada": data.produtividadeEstimada,
    "colhedeira": data.maquina,
    "operador(es) colhedeira": data.operadoresMaquina,
    "operador(es) trator": data.operadoresTrator,
    "quantidade de produto/hectare": data.produtosConcatenados,
    "produto(s) e quantidade/ha": data.produtosConcatenados,
    "atualizado em": agora
  };

  if (activity === "Colheita") {
    for (let i = 1; i <= MAX_PRODUCTS; i++) {
      mapa[normalizeHeader('Caminhão ' + i)] = (i <= numTrucks) ? (data['identificacao_caminhao_' + i] || data['truck_id_' + i] || "") : "";
      mapa[normalizeHeader('Motorista ' + i)] = (i <= numTrucks) ? (data['motorista_caminhao_' + i] || data['truck_driver_' + i] || "") : "";
    }
  }
  return mapa;
}

function gravarDadosDoPdf(sheet, headers, rowNumber, pdfId, pdfUrl) {
  const idIndex = headerIndex(headers, "PDF ID");
  const urlIndex = headerIndex(headers, "PDF URL");
  if (idIndex !== -1) sheet.getRange(rowNumber, idIndex + 1).setValue(pdfId);
  if (urlIndex !== -1) sheet.getRange(rowNumber, urlIndex + 1).setValue(pdfUrl);
}

// =========================================================================
// GERAÇÃO DO PDF
// =========================================================================
function gerarPdf(opcoes) {
  const data = opcoes.data;
  const templateFile = DriveApp.getFileById(opcoes.templateId);
  const tempDocFile = templateFile.makeCopy(opcoes.pdfFolder);
  const docId = tempDocFile.getId();

  try {
    let doc = DocumentApp.openById(docId);
    let body = doc.getBody();

    const temTanque = ATIVIDADES_COM_TANQUE.indexOf(opcoes.activity) !== -1;
    if (temTanque) prepararTemplateDoseTanque(body);

    // As linhas de produtos/caminhões precisam ser duplicadas na tabela antes
    // de qualquer substituição em lote.
    const placeholdersProduto = temTanque
      ? [PH_NOME_PRODUTO, PH_DOSE_PRODUTO, PH_DOSE_TANQUE_PRODUTO]
      : [PH_NOME_PRODUTO, PH_DOSE_PRODUTO];
    expandirTabela(body, placeholdersProduto, opcoes.numProducts, i => [
      data['nome_produto_' + i] || data['product_name_' + i] || '',
      data['dose_produto_' + i] || data['product_dosage_' + i] || '',
      data['dose_tanque_produto_' + i] || ''
    ]);

    if (opcoes.activity === "Colheita") {
      expandirTabela(body, ["{{Caminhao_ID}}", "{{Motorista_ID}}"], opcoes.numTrucks, i => [
        data['identificacao_caminhao_' + i] || data['truck_id_' + i] || '',
        data['motorista_caminhao_' + i] || data['truck_driver_' + i] || ''
      ]);
    }

    const placeholders = montarPlaceholders(data, opcoes.timestampEmissao);

    if (typeof Docs !== 'undefined') {
      // Caminho rápido: uma única chamada de API para todos os placeholders.
      doc.saveAndClose();
      const requests = Object.keys(placeholders).map(chave => ({
        replaceAllText: {
          containsText: { text: chave, matchCase: true },
          replaceText: String(placeholders[chave] === undefined || placeholders[chave] === null ? '' : placeholders[chave])
        }
      }));
      Docs.Documents.batchUpdate({ requests: requests }, docId);

      doc = DocumentApp.openById(docId);
      body = doc.getBody();
      body.replaceText('\\{\\{.*?\\}\\}', '');   // varre placeholders não usados
      doc.saveAndClose();
    } else {
      // Caminho antigo (API do Docs não habilitada no projeto).
      Object.keys(placeholders).forEach(chave => {
        const valor = placeholders[chave];
        if (valor !== undefined && valor !== null) body.replaceText(chave, String(valor));
      });
      body.replaceText('\\{\\{.*?\\}\\}', '');
      doc.saveAndClose();
    }

    const nomeArquivo = `${opcoes.activity} - OS ${data.osId || 'S-ID'} - ${data.local || 'local'}`;
    const pdfBlob = DriveApp.getFileById(docId).getAs('application/pdf');
    return opcoes.pdfFolder.createFile(pdfBlob).setName(nomeArquivo);

  } finally {
    try { DriveApp.getFileById(docId).setTrashed(true); }
    catch (err) { Logger.log("Documento temporário não pôde ser descartado: " + err); }
  }
}

function montarPlaceholders(data, timestampEmissao) {
  return {
    '{{OS_ID}}': data.osId,
    '{{DATA_EMISSAO}}': formatDateForPdf(timestampEmissao),
    '{{DATA_ATUALIZACAO}}': formatDateForPdf(new Date()),
    '{{USUARIO_REGISTRO}}': data.userName,
    '{{LOCAL_ATIVIDADE}}': data.local,
    '{{TALHOES_SELECIONADOS}}': data.talhoes,
    '{{AREA_TOTAL_HECTARES}}': data.areaTotalHectares,
    '{{CULTURA_CULTIVAR}}': data.culturaCultivar,
    '{{DATA_INICIO}}': formatDateForPdf(data.dataInicio),
    '{{DATA_TERMINO}}': formatDateForPdf(data.dataTermino),
    '{{OBSERVACAO}}': data.observacao,
    '{{QTD_SEMENTES_KG}}': data.qtdSementesKg,
    '{{OPERADORES}}': data.operadores,
    '{{PRODUTIVIDADE_ESTIMADA}}': data.produtividadeEstimada,
    '{{COLHEDEIRA}}': data.maquina,
    '{{OPERADORES_MAQUINA}}': data.operadoresMaquina,
    '{{TRATOR}}': data.trator,
    '{{OPERADORES_TRATOR}}': data.operadoresTrator,
    '{{IMPLEMENTO}}': data.implemento,
    '{{MAQUINA}}': data.maquina,
    '{{BICO}}': data.bico,
    '{{CAPACIDADE_TANQUE}}': data.capacidadeTanque,
    '{{VAZAO_L_HA}}': data.vazaoLHa,
    '{{PRESSAO}}': data.pressao,
    '{{DOSE_HA}}': data.doseHa,
    '{{DOSE_TANQUE}}': data.doseTanqueConcatenado || data.doseTanque,
    '{{AREA_POR_TANQUE}}': data.areaPorTanque,
    '{{PMS}}': data.pms,
    '{{PLANTAS_METRO}}': data.plantasPorMetro,
    '{{QTD_HA_MAX}}': data.qtdHaMax,
    '{{QTD_HA_MIN}}': data.qtdHaMin,
    '{{ESPACAMENTO_PLANTAS}}': data.espacamentoPlantas
  };
}

/** findText()/replaceText() do DocumentApp recebem regex: escapa as chaves. */
function escaparRegex(texto) {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sobe a partir de um elemento até a TABLE_ROW que o contém (ou null). */
function linhaDaTabela(elemento) {
  let atual = elemento;
  while (atual && atual.getType() !== DocumentApp.ElementType.TABLE_ROW) {
    if (atual.getType() === DocumentApp.ElementType.BODY_SECTION) return null;
    atual = atual.getParent();
  }
  return atual;
}

/**
 * Duplica a linha-modelo de uma tabela (uma por item) e preenche os
 * placeholders da linha, na ordem de `placeholders`. Se não houver itens,
 * remove a linha-modelo.
 */
function expandirTabela(body, placeholders, quantidade, valoresPorIndice) {
  const encontrado = body.findText(escaparRegex(placeholders[0]));
  if (!encontrado) return;

  const linhaModelo = linhaDaTabela(encontrado.getElement());
  if (quantidade <= 0) {
    try {
      if (linhaModelo) linhaModelo.removeFromParent();
    } catch (err) {
      Logger.log("Não foi possível remover a linha-modelo de " + placeholders[0] + ": " + err);
    }
    return;
  }

  try {
    if (!linhaModelo) throw new Error("O placeholder " + placeholders[0] + " não está dentro de uma tabela.");
    const tabela = linhaModelo.getParent();
    const indiceModelo = tabela.getChildIndex(linhaModelo);
    for (let i = 1; i <= quantidade; i++) {
      const valores = valoresPorIndice(i);
      const novaLinha = tabela.insertTableRow(indiceModelo + i, linhaModelo.copy());
      placeholders.forEach((ph, k) =>
        novaLinha.replaceText(escaparRegex(ph), String(valores[k] == null ? '' : valores[k])));
    }
    tabela.removeRow(indiceModelo);
  } catch (err) {
    Logger.log("Erro ao expandir tabela de " + placeholders[0] + ": " + err);
    placeholders.forEach(ph => body.replaceText(escaparRegex(ph), ""));
  }
}

/**
 * Garante a coluna "Dose/tanque" na tabela de produtos e tira a linha
 * "Dose/tanque: {{DOSE_TANQUE}}" de baixo da tabela. Não faz nada se o
 * template já estiver no formato novo, por isso pode rodar a cada PDF.
 * Devolve true se alterou alguma coisa.
 */
function prepararTemplateDoseTanque(body) {
  let alterou = false;

  if (!body.findText(escaparRegex(PH_DOSE_TANQUE_PRODUTO))) {
    const achado = body.findText(escaparRegex(PH_DOSE_PRODUTO));
    const linhaModelo = achado ? linhaDaTabela(achado.getElement()) : null;
    if (linhaModelo) {
      const tabela = linhaModelo.getParent();
      const indiceModelo = tabela.getChildIndex(linhaModelo);
      const colunas = linhaModelo.getNumCells();
      const larguras = [];
      for (let c = 0; c < colunas; c++) larguras.push(tabela.getColumnWidth(c));

      // Cada linha ganha uma cópia da sua última célula (mantém fonte, fundo e
      // borda); só o texto da cópia muda.
      for (let r = 0; r < tabela.getNumRows(); r++) {
        const linha = tabela.getRow(r);
        const nova = linha.appendTableCell(linha.getCell(linha.getNumCells() - 1).copy());
        const texto = r === indiceModelo ? PH_DOSE_TANQUE_PRODUTO
          : (r === 0 ? TITULO_COLUNA_DOSE_TANQUE : '');
        trocarTextoDaCelula(nova, texto);
      }

      // Se o template fixa larguras, redistribui para a tabela não passar da margem.
      if (colunas === 2 && larguras.every(w => w)) {
        const total = larguras[0] + larguras[1];
        tabela.setColumnWidth(0, total * 0.5);
        tabela.setColumnWidth(1, total * 0.25);
        tabela.setColumnWidth(2, total * 0.25);
      }
      alterou = true;
    }
  }

  const linhaAntiga = '\\s*Dose/tanque:\\s*\\{\\{DOSE_TANQUE\\}\\}';
  if (body.findText(linhaAntiga)) {
    body.replaceText(linhaAntiga, '');
    alterou = true;
  }
  return alterou;
}

/** Troca o texto da célula mantendo a formatação do primeiro trecho. */
function trocarTextoDaCelula(celula, texto) {
  while (celula.getNumChildren() > 1) celula.removeChild(celula.getChild(celula.getNumChildren() - 1));
  const paragrafo = celula.getChild(0);
  const trecho = (paragrafo.getType() === DocumentApp.ElementType.PARAGRAPH && paragrafo.getNumChildren())
    ? paragrafo.getChild(0) : null;
  if (trecho && trecho.getType() === DocumentApp.ElementType.TEXT) {
    while (paragrafo.getNumChildren() > 1) paragrafo.removeChild(paragrafo.getChild(paragrafo.getNumChildren() - 1));
    trecho.asText().setText(texto || ' ');
  } else {
    celula.setText(texto);
  }
}

/**
 * RODAR UMA VEZ, à mão, no editor do Apps Script (escolher a função na lista
 * e clicar em Executar). Aplica no template de Pulverização a mesma mudança
 * que hoje é feita em cada cópia: 3ª coluna "Dose/tanque" na tabela de
 * produtos e remoção da linha "Dose/tanque" abaixo dela. Depois disso o PDF
 * sai um pouco mais rápido e o visual da coluna pode ser ajustado no Docs.
 */
function atualizarTemplatePulverizacao() {
  const doc = DocumentApp.openById(TEMPLATE_IDS["Pulverizacao"]);
  const alterou = prepararTemplateDoseTanque(doc.getBody());
  doc.saveAndClose();
  Logger.log(alterou ? "Template de Pulverização atualizado." : "O template já estava no formato novo.");
}

// =========================================================================
// CONSULTA (GET)
// =========================================================================
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action;

    if (action === 'list') return createJsonResponse({ items: listarOs(parseInt(params.limit || '100', 10)) });
    if (action === 'get') return createJsonResponse(obterOs(params.osId, params.activity));

    // --- contrato antigo, usado pelo app de Relatório de Operações ---
    const activity = params.activity;
    const osId = params.osId;
    if (!activity) throw new Error("Parâmetro 'activity' não fornecido.");

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(activity);
    if (!sheet) throw new Error("Aba '" + activity + "' não encontrada.");

    if (osId) {
      const valores = sheet.getDataRange().getValues();
      const headers = valores.shift();
      const idColumn = headerIndex(headers, ID_HEADER);
      if (idColumn === -1) throw new Error("Coluna 'ID da OS' não encontrada.");

      const linha = valores.filter(row => String(row[idColumn]) == String(osId)).pop();
      if (!linha) throw new Error("OS com ID '" + osId + "' não encontrada.");

      const detalhes = {};
      headers.forEach((header, index) => { detalhes[header] = linha[index]; });
      return createJsonResponse(detalhes);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return createJsonResponse([]);
    const headers = readHeaders(sheet);
    const idColumn = headerIndex(headers, ID_HEADER);
    if (idColumn === -1) throw new Error("Coluna 'ID da OS' não encontrada.");
    // Lote: todas as OS completas numa resposta só. O app de Relatório de
    // Operações reconhece o formato e evita uma requisição por OS.
    if (params.detalhes) {
      const valores = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      return createJsonResponse(valores
        .filter(linha => String(linha[idColumn]).trim() !== '')
        .map(linha => {
          const os = {};
          headers.forEach((h, i) => { os[h] = linha[i]; });
          return os;
        }));
    }

    const ids = sheet.getRange(2, idColumn + 1, lastRow - 1, 1).getValues().flat().filter(String);
    return createJsonResponse(ids);

  } catch (error) {
    Logger.log(error.toString());
    return createJsonResponse({ error: error.toString() });
  }
}

/** Lista as OS mais recentes de todas as atividades (para a tela de edição). */
function listarOs(limite) {
  const cache = CacheService.getScriptCache();
  const emCache = cache.get(LIST_CACHE_KEY);
  if (emCache) {
    try { return JSON.parse(emCache).slice(0, limite); } catch (err) { /* segue adiante */ }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const itens = [];

  Object.keys(HEADERS_CONFIG).forEach(activity => {
    const sheet = ss.getSheetByName(activity);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const headers = readHeaders(sheet);
    const idIndex = headerIndex(headers, ID_HEADER);
    const tsIndex = headerIndex(headers, "Timestamp");
    const localIndex = headerIndex(headers, "Local");
    const pdfUrlIndex = headerIndex(headers, "PDF URL");
    if (idIndex === -1) return;

    // Lê no máximo as últimas 200 linhas de cada aba.
    const primeiraLinha = Math.max(2, lastRow - 199);
    const quantidade = lastRow - primeiraLinha + 1;
    const bloco = sheet.getRange(primeiraLinha, 1, quantidade, headers.length).getValues();

    bloco.forEach(row => {
      const osId = row[idIndex];
      if (!osId) return;
      itens.push({
        osId: String(osId),
        activity: activity,
        local: localIndex !== -1 ? String(row[localIndex] || '') : '',
        timestamp: tsIndex !== -1 && row[tsIndex] ? new Date(row[tsIndex]).toISOString() : '',
        pdfUrl: pdfUrlIndex !== -1 ? String(row[pdfUrlIndex] || '') : ''
      });
    });
  });

  itens.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const resultado = itens.slice(0, 300);
  try { cache.put(LIST_CACHE_KEY, JSON.stringify(resultado), LIST_CACHE_SECONDS); } catch (err) { /* payload grande */ }
  return resultado.slice(0, limite);
}

/** Devolve a OS no MESMO formato que o formulário envia, pronta para edição. */
function obterOs(osId, activity) {
  if (!osId) throw new Error("Parâmetro 'osId' não fornecido.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const atividades = activity ? [activity] : Object.keys(HEADERS_CONFIG);

  for (const nomeAtividade of atividades) {
    const sheet = ss.getSheetByName(nomeAtividade);
    if (!sheet) continue;

    const headers = readHeaders(sheet);
    const rowNumber = findRowByOsId(sheet, headers, osId);
    if (rowNumber < 0) continue;

    const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const data = { activity: nomeAtividade, osId: String(osId) };
    let pdfId = '', pdfUrl = '';
    let numProducts = 0, numTrucks = 0;

    headers.forEach((header, index) => {
      const chave = normalizeHeader(header);
      const valor = row[index];

      if (chave === 'pdf id') { pdfId = String(valor || ''); return; }
      if (chave === 'pdf url') { pdfUrl = String(valor || ''); return; }

      if (PRODUCT_HEADERS.indexOf(chave) !== -1) {
        String(valor || '').split(';').forEach(parte => {
          const texto = parte.trim();
          if (!texto) return;
          const separador = texto.indexOf(':');
          const nome = separador === -1 ? texto : texto.substring(0, separador).trim();
          const dose = separador === -1 ? '' : texto.substring(separador + 1).trim();
          numProducts++;
          data['product_name_' + numProducts] = nome;
          data['product_dosage_' + numProducts] = dose === 'N/A' ? '' : dose;
        });
        return;
      }

      const caminhao = chave.match(/^caminhao (\d+)$/);
      if (caminhao) {
        const texto = String(valor == null ? '' : valor);
        if (texto) {
          data['truck_id_' + caminhao[1]] = texto;
          numTrucks = Math.max(numTrucks, parseInt(caminhao[1], 10));
        }
        return;
      }
      const motorista = chave.match(/^motorista (\d+)$/);
      if (motorista) {
        const texto = String(valor == null ? '' : valor);
        if (texto) data['truck_driver_' + motorista[1]] = texto;
        return;
      }

      const campo = HEADER_TO_FIELD[chave];
      if (!campo || campo === 'osId') return;

      // Dois cabeçalhos podem apontar para o mesmo campo ("Operador(es)" e
      // "Operadores"): o preenchido não é sobrescrito por uma coluna vazia.
      const jaPreenchido = data[campo] !== undefined && data[campo] !== '';
      const valorVazio = valor === null || valor === undefined || valor === '';
      if (jaPreenchido && valorVazio) return;

      if (DATE_FIELDS.indexOf(campo) !== -1) {
        data[campo] = formatDateForInput(valor);
      } else if (valor instanceof Date) {
        data[campo] = formatDateForInput(valor);
      } else {
        data[campo] = valor == null ? '' : String(valor);
      }
    });

    data.numProducts = String(numProducts);
    if (nomeAtividade === 'Colheita') data.numTrucks = String(numTrucks);

    return { data: data, pdfId: pdfId, pdfUrl: pdfUrl, activity: nomeAtividade, osId: String(osId) };
  }

  throw new Error("OS com ID '" + osId + "' não encontrada.");
}
