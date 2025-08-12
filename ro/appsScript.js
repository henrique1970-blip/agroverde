/*
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Ele é responsável por:
* 1. Receber os dados do formulário de Relatório de Operações (via doPost).
* 2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
* 3. Criar abas dinamicamente, se necessário.
* 4. Gerar PDFs de relatório para as operações.
* 5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
*/

// --- CONFIGURAÇÕES GLOBAIS ---
const REPORT_SPREADSHEET_ID = "1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8";
const PDF_REPORT_FOLDER_ID = "1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI";

const REPORT_TEMPLATE_IDS = {
  "PreparodeArea": "1mpWpIZkZ58zV_SojCAG7ibqSoC_OyXHmSTBNm2FcMq0",
  "TratamentodeSementes": "1D-zNji40SaoO-1Smy46kbAZnZIqx5JRpL63tYTqpfgQ"
};

const COMMON_OS_HEADERS = [
    "OS Planejado - Local", "OS Realizado - Local",
    "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)",
    "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)",
    "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio",
    "OS Planejado - Data de Termino", "OS Realizado - Data de Termino",
    "OS Planejado - Cultura / Cultivar", "OS Realizado - Cultura / Cultivar",
    "OS Planejado - Trator", "OS Realizado - Trator",
    "OS Planejado - Operador(es)", "OS Realizado - Operador(es)",
    "OS Planejado - Implemento", "OS Realizado - Implemento",
    "OS Planejado - Observacao", "OS Realizado - Observacao"
];

// --- INÍCIO DA MODIFICAÇÃO: Cabeçalhos específicos para Tratamento de Sementes (sem Trator) ---
const TDS_OS_HEADERS = COMMON_OS_HEADERS.filter(header => !header.includes("Trator"));
// --- FIM DA MODIFICAÇÃO ---

const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [
    "Timestamp Relatorio", "ID da OS", "Nome do Usuario",
    ...COMMON_OS_HEADERS,
    "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim",
    "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos"
  ],
  // --- INÍCIO DA MODIFICAÇÃO: Usando os cabeçalhos filtrados e adicionando os novos ---
  "TratamentodeSementes": [
    "Timestamp Relatorio", "ID da OS", "Nome do Usuario",
    ...TDS_OS_HEADERS,
    "OS Planejado - Quantidade de Sementes (Kg)", "OS Realizado - Quantidade de Sementes (Kg)",
    "OS Planejado - Produtos Utilizados", "OS Realizado - Produtos Utilizados",
    "OS Planejado - Maquina", "OS Realizado - Maquina"
  ]
  // --- FIM DA MODIFICAÇÃO ---
};

const MAX_ABASTECIMENTOS_PDF = 10;

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function formatDateForSheet(dateInput) {
  if (!dateInput) return '';
  try {
    const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput;
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  } catch (e) {
    return dateInput;
  }
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

function doPost(e) {
  try {
    const data = e.parameter;
    const activity = data.activity;
    const osId = data.osId;

    if (!activity || !osId) {
      return createJsonResponse({ success: false, message: "Erro: Atividade ou ID da OS não especificados." });
    }

    const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
    let sheet = ss.getSheetByName(activity);
    let headers = REPORT_HEADERS_CONFIG[activity] || [];

    if (!sheet) {
      sheet = ss.insertSheet(activity);
      if (headers.length > 0) {
        sheet.appendRow(headers);
      }
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      headers = currentHeaders.length > 0 ? currentHeaders : headers;
      if (currentHeaders.length === 0 && headers.length > 0) {
          sheet.appendRow(headers);
      }
    }

    const numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      let dynamicAbastecimentoHeaders = [];
      for (let i = 1; i <= numAbastecimentos; i++) {
        dynamicAbastecimentoHeaders.push(`Relatorio - Horimetro Abastecimento ${i}`);
        dynamicAbastecimentoHeaders.push(`Relatorio - Litros Abastecimento ${i}`);
      }
      const existingHeadersSet = new Set(headers);
      const newHeadersToAdd = dynamicAbastecimentoHeaders.filter(header => !existingHeadersSet.has(header));
      if (newHeadersToAdd.length > 0) {
          const lastCol = sheet.getLastColumn();
          sheet.getRange(1, lastCol + 1, 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
          headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      }
    }

    const timestampReport = new Date();

    // Mapeamento de dados para a PLANILHA
    const rowDataMap = {
      "Timestamp Relatorio": timestampReport,
      "ID da OS": data.osId,
      "Nome do Usuario": data.userName,

      "OS Planejado - Local": data.Local, "OS Realizado - Local": data.realizado_Local,
      "OS Planejado - Talhoes (Area)": data.TalhoesArea, "OS Realizado - Talhoes (Area)": data.realizado_TalhoesArea,
      "OS Planejado - Área Total (ha)": data.reaTotalha, "OS Realizado - Área Total (ha)": data.realizado_reaTotalha,
      "OS Planejado - Data de Inicio": formatDateForSheet(data.DatadeInicio), "OS Realizado - Data de Inicio": formatDateForSheet(data.realizado_DatadeInicio),
      "OS Planejado - Data de Termino": formatDateForSheet(data.DatadeTermino), "OS Realizado - Data de Termino": formatDateForSheet(data.realizado_DatadeTermino),
      "OS Planejado - Cultura / Cultivar": data.CulturaCultivar, "OS Realizado - Cultura / Cultivar": data.realizado_CulturaCultivar,
      "OS Planejado - Trator": data.Trator, "OS Realizado - Trator": data.realizado_Trator,
      "OS Planejado - Operador(es)": data.Operadores || data.Operadores, "OS Realizado - Operador(es)": data.realizado_Operadores || data.realizado_Operadores,
      "OS Planejado - Implemento": data.Implemento, "OS Realizado - Implemento": data.realizado_Implemento,
      "OS Planejado - Observacao": data.Observao || data.Observacao, "OS Realizado - Observacao": data.observacao,

      "OS Planejado - Quantidade de Sementes (Kg)": data.QuantidadedeSementesKg, "OS Realizado - Quantidade de Sementes (Kg)": data.realizado_QuantidadedeSementesKg,
      "OS Planejado - Produtos Utilizados": data.ProdutosUtilizados, "OS Realizado - Produtos Utilizados": data.realizado_ProdutosUtilizados,
      "OS Planejado - Maquina": data.Maquina, "OS Realizado - Maquina": data.realizado_Maquina,
      
      "Relatorio - Horimetro Inicio": data.horimetroInicio,
      "Relatorio - Horimetro Fim": data.horimetroFim,
      "Relatorio - Paradas Imprevistas": data.paradasImprevistas,
      "Relatorio - Numero Abastecimentos": data.numAbastecimentos
    };
    
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      for (let i = 1; i <= numAbastecimentos; i++) {
        rowDataMap[`Relatorio - Horimetro Abastecimento ${i}`] = data[`abastecimento_horimetro_${i}`] || '';
        rowDataMap[`Relatorio - Litros Abastecimento ${i}`] = data[`abastecimento_litros_${i}`] || '';
      }
    }

    const rowValues = headers.map(header => rowDataMap[header] !== undefined ? rowDataMap[header] : '');
    sheet.appendRow(rowValues);

    const templateId = REPORT_TEMPLATE_IDS[activity];
    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados do relatório registrados! Template de PDF não configurado." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const newFileName = `Relatorio - ${activity} - OS ${osId || 'S-ID'} - ${data.realizado_Local || 'local'} - ${formatDateForPdf(timestampReport)}`;
    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    // --- INÍCIO DA MODIFICAÇÃO: Mapeamento de placeholders corrigido ---
    const placeholderMap = {
      '{{ID_OPERACAO}}': `${osId}-OP`,
      '{{DATA_RELATORIO}}': formatDateForPdf(timestampReport),
      '{{USUARIO_RELATORIO}}': data.userName,
      '{{LOCAL_OS_RELATORIO}}': data.realizado_Local,
      '{{TALHOES_OS_RELATORIO}}': data.realizado_TalhoesArea,
      '{{AREA_TOTAL_OS_RELATORIO}}': data.realizado_reaTotalha,
      '{{DATA_INICIO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeInicio),
      '{{DATA_TERMINO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeTermino),
      '{{OPERADORES_OS}}': data.realizado_Operadores || data.realizado_Operadores,
      '{{OBSERVACAO_OS_RELATORIO}}': data.observacao,
      // Placeholders de Preparo de Área
      '{{HORIMETRO_INICIO}}': data.horimetroInicio,
      '{{HORIMETRO_FIM}}': data.horimetroFim,
      // Placeholders de Tratamento de Sementes
      '{{CULTURA_CULTIVAR_OS}}': data.realizado_CulturaCultivar,
      '{{QTD_SEMENTES_KG_OS}}': data.realizado_QuantidadedeSementesKg,
      '{{PRODUTOS_UTILIZADOS_OS}}': data.realizado_ProdutosUtilizados,
      '{{MAQUINA_OS}}': data.realizado_Maquina,
    };
    // --- FIM DA MODIFICAÇÃO ---

    for (const placeholder in placeholderMap) {
        if (placeholderMap[placeholder] !== undefined && placeholderMap[placeholder] !== null) {
             body.replaceText(placeholder, placeholderMap[placeholder]);
        }
    }
    
    body.replaceText('\\{\\{.*?\\}\\}', ''); // Limpa placeholders não encontrados
    doc.saveAndClose();
    const pdfBlob = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
    tempDocFile.setTrashed(true);

    const pdfUrl = finalPdfFile.getUrl();
    const folderUrl = pdfFolder.getUrl();

    return createJsonResponse({ success: true, message: "Relatório registrado e PDF criado!", pdfUrl: pdfUrl, folderUrl: folderUrl });

  } catch (error) {
    Logger.log("Erro no servidor do Relatório: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor do Relatório: " + error.toString() });
  }
}