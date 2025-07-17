// --- CONFIGURAÇÕES PARA GERAR PDF ---
const TEMPLATE_IDS = {
  "PreparodeArea": "19ZED49t_UCG8vb5QTaeNMDwoMtyEysmKh_n5oV0KBPU",
  "TratamentodeSementes": "17-Ao_mdN82xD1qipdMVqnac2k4Kga17nPtSDIhN2cJY",
  "Plantio": "1PbO-nm4JGm2WtOjftXTCedmwdaxc3I-psXYK5HYysj0",
  "Pulverizacao": "1ukv9o1ZAkBfMbhDLo4Qcb7BeCSBvxBdNs207Hq3xLx4",
  "Colheita": "1epcbgrnwAMKgEEDxdi8bNWskM7SXjZxf_FpAIUVR6Z8",
  "Lancas": "1kFocDdOm0H0KX1dPtR4MMSQrHjkaR3FWgSfJ4w8I7L0"
};
const PDF_FOLDER_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754";
const MAX_PRODUCTS = 5;
// --- FIM DA CONFIGURAÇÃO ---


function formatDateColumnsInSheet(sheet, headers) {
  const dateHeaders = ["Timestamp", "Data de Inicio", "Data de Termino"];
  headers.forEach(function(header, index) {
    if (dateHeaders.indexOf(header) !== -1) {
      const columnIndex = index + 1;
      sheet.getRange(2, columnIndex, sheet.getMaxRows()).setNumberFormat("dd/MM/yyyy");
    }
  });
}

function formatDateForPdf(dateInput) {
  if (!dateInput) return '';
  try {
    var date = new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput;
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) {
    return dateInput;
  }
}

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = e.parameter;
    const activity = data.activity;
    
    if (!activity) {
      return createJsonResponse({ success: false, message: "Erro: Atividade não especificada." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(activity);
    let headers = [];
    
    let produtosString = '';
    for (let i = 1; i <= MAX_PRODUCTS; i++) {
        const nome = data[`nome_produto_${i}`];
        const dose = data[`dose_produto_${i}`];
        if (nome && nome.trim() !== '') {
            produtosString += `${nome}: ${dose || 'N/A'}; `;
        }
    }
    data.produtosConcatenados = produtosString.trim();

    const headersConfig = {
      "PreparodeArea": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Trator", "Operador(es)", "Implemento", "Observacao"],
      "TratamentodeSementes": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Qtd Sementes (Kg)", "Produtos e Dosagens", "Maquina", "Operadores", "Observacao"],
      "Plantio": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Qtd/ha - Maximo", "Qtd/ha - Minimo", "Insumos", "Trator", "Implemento", "Plantas por metro", "Espacamento entre plantas", "PMS", "Operador(es)", "Observacao"],
      "Pulverizacao": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Produto(s) e quantidade/ha", "Maquina", "Bico", "Capacidade do tanque", "Vazao (L/ha)", "Operador(es)", "Pressao", "Dose/ha", "Dose/tanque", "Implemento", "Observacao"],
      "Colheita": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Produtividade estimada", "Colhedeira", "Operador(es) Colhedeira", "Caminhao", "Motorista(s)", "Trator", "Operador(es) Trator", "Implemento", "Observacao"],
      "Lancas": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Quantidade de produto/hectare", "Maquina", "Operador(es)", "Implemento", "Observacao"]
    };

    if (!sheet) {
      sheet = ss.insertSheet(activity);
      headers = headersConfig[activity] || [];
      if (headers.length > 0) sheet.appendRow(headers);
    } else {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    
    const timestamp = new Date();
    
    const dataMap = {
      "Timestamp": timestamp, "ID da OS": data.osId, "Nome do Usuário": data.userName,
      "Local": data.local, "Talhoes (Area)": data.talhoes, "Área Total (ha)": data.areaTotalHectares,
      "Data de Inicio": data.dataInicio, "Data de Termino": data.dataTermino, "Trator": data.trator, 
      "Operador(es)": data.operadores, "Operadores": data.operadores, "Implemento": data.implemento, 
      "Observacao": data.observacao, "Cultura e Cultivar": data.culturaCultivar, "Qtd Sementes (Kg)": data.qtdSementesKg,
      "Produtos e Dosagens": data.produtosConcatenados, "Maquina": data.maquina, "Qtd/ha - Maximo": data.qtdHaMax,
      "Qtd/ha - Minimo": data.qtdHaMin, "Insumos": data.produtosConcatenados, "Plantas por metro": data.plantasPorMetro,
      "Espacamento entre plantas": data.espacamentoPlantas, "PMS": data.pms, "Bico": data.bico, 
      "Capacidade do tanque": data.capacidadeTanque, "Vazao (L/ha)": data.vazaoLHa, "Pressao": data.pressao, 
      "Dose/ha": data.doseHa, "Dose/tanque": data.doseTanque, "Produtividade estimada": data.produtividadeEstimada, 
      "Colhedeira": data.maquina, "Operador(es) Colhedeira": data.operadoresMaquina, "Caminhao": data.caminhao, 
      "Motorista(s)": data.motoristas, "Operador(es) Trator": data.operadoresTrator, 
      "Quantidade de produto/hectare": data.produtosConcatenados,
      "Produtos e quantidade/ha": data.produtosConcatenados, "Produto(s) e quantidade/ha": data.produtosConcatenados
    };

    const rowData = headers.map(header => dataMap[header] || '');
    sheet.appendRow(rowData);
    formatDateColumnsInSheet(sheet, headers);

    const templateId = TEMPLATE_IDS[activity];
    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados registrados, mas template de PDF não foi encontrado." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const newFileName = `${activity} - OS ${data.osId || 'S-ID'} - ${data.local || 'local'}`;
    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    const placeholderMap = {
      '{{OS_ID}}': data.osId, '{{DATA_EMISSAO}}': formatDateForPdf(timestamp), '{{USUARIO_REGISTRO}}': data.userName,
      '{{LOCAL_ATIVIDADE}}': data.local, '{{TALHOES_SELECIONADOS}}': data.talhoes, '{{AREA_TOTAL_HECTARES}}': data.areaTotalHectares,
      '{{CULTURA_CULTIVAR}}': data.culturaCultivar, '{{DATA_INICIO}}': formatDateForPdf(data.dataInicio),
      '{{DATA_TERMINO}}': formatDateForPdf(data.dataTermino), '{{OBSERVACAO}}': data.observacao, '{{QTD_SEMENTES_KG}}': data.qtdSementesKg,
      '{{OPERADORES}}': data.operadores, '{{PRODUTIVIDADE_ESTIMADA}}': data.produtividadeEstimada, '{{COLHEDEIRA}}': data.maquina,
      '{{OPERADORES_MAQUINA}}': data.operadoresMaquina, '{{CAMINHAO}}': data.caminhao, '{{MOTORISTAS}}': data.motoristas,
      '{{TRATOR}}': data.trator, '{{OPERADORES_TRATOR}}': data.operadoresTrator, '{{IMPLEMENTO}}': data.implemento,
      '{{MAQUINA}}': data.maquina, '{{BICO}}': data.bico, '{{CAPACIDADE_TANQUE}}': data.capacidadeTanque,
      '{{VAZAO_L_HA}}': data.vazaoLHa, '{{PRESSAO}}': data.pressao, '{{DOSE_HA}}': data.doseHa, '{{DOSE_TANQUE}}': data.doseTanque
    };
    
    for (const placeholder in placeholderMap) {
        if (placeholderMap[placeholder] !== undefined) {
             body.replaceText(placeholder, placeholderMap[placeholder]);
        }
    }
    
    for (let i = 1; i <= MAX_PRODUCTS; i++) {
        body.replaceText(`{{NOME_PRODUTO_${i}}}`, data[`nome_produto_${i}`] || '');
        body.replaceText(`{{DOSE_PRODUTO_${i}}}`, data[`dose_produto_${i}`] || '');
    }
    
    body.replaceText('\\{\\{.*?\\}\\}', '');

    doc.saveAndClose();

    const pdfFile = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfFile).setName(newFileName);
    tempDocFile.setTrashed(true);
    
    // ALTERAÇÃO: Retorna a URL direta do arquivo E a URL da pasta
    const pdfUrl = finalPdfFile.getUrl();
    const folderUrl = pdfFolder.getUrl();

    return createJsonResponse({ success: true, message: "Dados registrados e PDF criado!", pdfUrl: pdfUrl, folderUrl: folderUrl });

  } catch (error) {
    Logger.log("Erro no servidor: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error.toString() });
  }
}