/*
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Ele é responsável por:
* 1. Receber os dados do formulário de Relatório de Operações (via doPost).
* 2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
* 3. Criar abas dinamicamente, se necessário.
* 4. Gerar PDFs de relatório para as operações.
* 5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
*/

/*
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
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
    "OS Planejado - Trator", "OS Realizado - Trator",
    "OS Planejado - Operador(es)", "OS Realizado - Operador(es)",
    "OS Planejado - Implemento", "OS Realizado - Implemento",
    "OS Planejado - Observacao", "OS Realizado - Observacao"
];

const TDS_COMMON_HEADERS = [
    "OS Planejado - Local", "OS Realizado - Local",
    "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)",
    "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)",
    "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio",
    "OS Planejado - Data de Termino", "OS Realizado - Data de Termino",
    "OS Planejado - Operador(es)", "OS Realizado - Operador(es)",
    "OS Planejado - Observacao", "OS Realizado - Observacao"
];

const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [
    "Timestamp Relatorio", "ID da OS", "Nome do Usuario",
    ...COMMON_OS_HEADERS,
    "OS Planejado - Cultura / Cultivar", "OS Realizado - Cultura / Cultivar",
    "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim",
    "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos"
  ],
  "TratamentodeSementes": [
    "Timestamp Relatorio", "ID da OS", "Nome do Usuario",
    ...TDS_COMMON_HEADERS,
    "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar",
    "OS Planejado - Qtd Sementes (Kg)", "OS Realizado - Qtd Sementes (Kg)",
    "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens",
    "OS Planejado - Maquina", "OS Realizado - Maquina"
  ]
};

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function formatDateForSheet(dateInput) {
  if (!dateInput) return '';
  try {
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? dateInput : Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  } catch (e) { return dateInput; }
}
function formatDateForPdf(dateInput) {
  if (!dateInput) return '';
  try {
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? dateInput : Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) { return dateInput; }
}

function doPost(e) {
  try {
    const data = e.parameter;
    Logger.log(JSON.stringify(data, null, 2));
    
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
      if (headers.length > 0) sheet.appendRow(headers);
    } else if (sheet.getLastRow() === 0 && headers.length > 0) {
      sheet.appendRow(headers);
    }
    
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const timestampReport = new Date();
    
    // --- LÓGICA PARA ADICIONAR CABEÇALHOS DE ABASTECIMENTO RESTAURADA ---
    const numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
        let dynamicHeaders = [];
        for (let i = 1; i <= numAbastecimentos; i++) {
            dynamicHeaders.push(`Relatorio - Horimetro Abastecimento ${i}`);
            dynamicHeaders.push(`Relatorio - Litros Abastecimento ${i}`);
        }
        const existingHeadersSet = new Set(headers);
        const newHeadersToAdd = dynamicHeaders.filter(h => !existingHeadersSet.has(h));
        if (newHeadersToAdd.length > 0) {
            sheet.getRange(1, headers.length + 1, 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
            headers.push(...newHeadersToAdd); // Atualiza a lista de headers em memória
        }
    }

    const rowDataMap = {
      "Timestamp Relatorio": timestampReport,
      "ID da OS": data.osId,
      "Nome do Usuario": data.userName,

      "OS Planejado - Local": data.Local, "OS Realizado - Local": data.realizado_Local,
      "OS Planejado - Talhoes (Area)": data.TalhoesArea, "OS Realizado - Talhoes (Area)": data.realizado_TalhoesArea,
      "OS Planejado - Área Total (ha)": data.reaTotalha, "OS Realizado - Área Total (ha)": data.realizado_reaTotalha,
      "OS Planejado - Data de Inicio": formatDateForSheet(data.DatadeInicio), "OS Realizado - Data de Inicio": formatDateForSheet(data.realizado_DatadeInicio),
      "OS Planejado - Data de Termino": formatDateForSheet(data.DatadeTermino), "OS Realizado - Data de Termino": formatDateForSheet(data.realizado_DatadeTermino),
      "OS Planejado - Operador(es)": data.Operadores, "OS Realizado - Operador(es)": data.realizado_Operadores,
      "OS Planejado - Observacao": data.Observacao, "OS Realizado - Observacao": data.observacao,
      
      "OS Planejado - Trator": data.Trator, "OS Realizado - Trator": data.realizado_Trator,
      "OS Planejado - Implemento": data.Implemento, "OS Realizado - Implemento": data.realizado_Implemento,
      "OS Planejado - Cultura / Cultivar": data.CulturaCultivar, "OS Realizado - Cultura / Cultivar": data.realizado_CulturaCultivar,
      "Relatorio - Horimetro Inicio": data.horimetroInicio,
      "Relatorio - Horimetro Fim": data.horimetroFim,
      "Relatorio - Paradas Imprevistas": data.paradasImprevistas,
      "Relatorio - Numero Abastecimentos": data.numAbastecimentos,

      "OS Planejado - Cultura e Cultivar": data.CulturaeCultivar, "OS Realizado - Cultura e Cultivar": data.realizado_CulturaeCultivar,
      "OS Planejado - Qtd Sementes (Kg)": data.QtdSementesKg, "OS Realizado - Qtd Sementes (Kg)": data.realizado_QtdSementesKg,
      "OS Planejado - Produtos e Dosagens": data.ProdutoseDosagens, "OS Realizado - Produtos e Dosagens": data.realizado_ProdutoseDosagens,
      "OS Planejado - Maquina": data.Maquina, "OS Realizado - Maquina": data.realizado_Maquina
    };

    // --- LÓGICA PARA MAPEAMENTO DOS DADOS DE ABASTECIMENTO RESTAURADA ---
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
      return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const newFileName = `Relatorio - ${activity} - OS ${osId} - ${rowDataMap["OS Realizado - Local"] || 'local'} - ${formatDateForPdf(timestampReport)}`;
    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();
    
    const placeholderMap = {
      '{{ID_OPERACAO}}': `${osId}-OP`,
      '{{DATA_RELATORIO}}': formatDateForPdf(timestampReport),
      '{{USUARIO_RELATORIO}}': data.userName,
      '{{LOCAL_OS_RELATORIO}}': rowDataMap["OS Realizado - Local"],
      '{{TALHOES_OS_RELATORIO}}': rowDataMap["OS Realizado - Talhoes (Area)"],
      '{{AREA_TOTAL_OS_RELATORIO}}': rowDataMap["OS Realizado - Área Total (ha)"],
      '{{DATA_INICIO_OS_RELATORIO}}': formatDateForPdf(rowDataMap["OS Realizado - Data de Inicio"]),
      '{{DATA_TERMINO_OS_RELATORIO}}': formatDateForPdf(rowDataMap["OS Realizado - Data de Termino"]),
      '{{OPERADORES_OS}}': rowDataMap["OS Realizado - Operador(es)"],
      '{{OBSERVACAO_OS_RELATORIO}}': rowDataMap["OS Realizado - Observacao"],
      '{{HORIMETRO_INICIO}}': data.horimetroInicio,
      '{{HORIMETRO_FIM}}': data.horimetroFim,
      '{{PARADAS_IMPREVISTAS}}': data.paradasImprevistas,
      '{{NUM_ABASTECIMENTOS}}': data.numAbastecimentos,
      '{{TRATOR_OS}}': rowDataMap["OS Realizado - Trator"],
      '{{IMPLEMENTO_OS}}': rowDataMap["OS Realizado - Implemento"],
      '{{CULTURA_CULTIVAR_OS}}': rowDataMap["OS Realizado - Cultura e Cultivar"] || rowDataMap["OS Realizado - Cultura / Cultivar"],
      '{{QTD_SEMENTES_KG_OS}}': rowDataMap["OS Realizado - Qtd Sementes (Kg)"],
      '{{PRODUTOS_UTILIZADOS_OS}}': rowDataMap["OS Realizado - Produtos e Dosagens"],
      '{{MAQUINA_OS}}': rowDataMap["OS Realizado - Maquina"]
    };

    for (const placeholder in placeholderMap) {
        body.replaceText(placeholder, placeholderMap[placeholder] || '');
    }
    
    // --- LÓGICA PARA PREENCHIMENTO DA TABELA DE ABASTECIMENTOS NO PDF RESTAURADA ---
    const abastecimentoTableElement = body.findText("{{HorimetroAbastecimento}}");
    if (activity === "PreparodeArea" && numAbastecimentos > 0 && abastecimentoTableElement) {
        try {
            let element = abastecimentoTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) {
                element = element.getParent();
            }
            const templateRow = element.getParent();
            const table = templateRow.getParent();
            const templateRowIndex = table.getChildIndex(templateRow);
            for (let i = 1; i <= numAbastecimentos; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{HorimetroAbastecimento}}", data['abastecimento_horimetro_' + i] || '');
                newRow.replaceText("{{LitrosAbastecimento}}", data['abastecimento_litros_' + i] || '');
            }
            table.removeRow(templateRowIndex);
        } catch(err) {
            Logger.log("Erro ao processar tabela de abastecimentos: " + err.toString());
        }
    }
    
    doc.saveAndClose();
    const pdfBlob = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
    tempDocFile.setTrashed(true);

    return createJsonResponse({ success: true, pdfUrl: finalPdfFile.getUrl(), folderUrl: pdfFolder.getUrl() });

  } catch (error) {
    Logger.log("Erro no servidor do Relatório: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error.toString() });
  }
}