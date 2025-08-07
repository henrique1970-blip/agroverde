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
};

// Definição dos cabeçalhos da planilha com a estrutura "Planejado vs. Realizado"
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

const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [
    "Timestamp Relatorio", "ID da OS", "Nome do Usuario",
    ...COMMON_OS_HEADERS,
    "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim",
    "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos"
  ]
};

const MAX_ABASTECIMENTOS_PDF = 10;

// --- FUNÇÕES AUXILIARES (sem alteração) ---
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

// --- FUNÇÃO PRINCIPAL DE PROCESSAMENTO (POST) ---
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
      const currentLastColumn = sheet.getLastColumn();
      if (currentLastColumn > 0) {
        headers = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];
      } else if (REPORT_HEADERS_CONFIG[activity].length > 0) {
        sheet.appendRow(REPORT_HEADERS_CONFIG[activity]);
        headers = REPORT_HEADERS_CONFIG[activity];
      }
    }

    const numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    let dynamicAbastecimentoHeaders = [];
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      for (let i = 1; i <= numAbastecimentos; i++) {
        dynamicAbastecimentoHeaders.push(`Relatorio - Horimetro Abastecimento ${i}`);
        dynamicAbastecimentoHeaders.push(`Relatorio - Litros Abastecimento ${i}`);
      }
    }

    const existingHeadersSet = new Set(headers);
    const newHeadersToAdd = dynamicAbastecimentoHeaders.filter(header => !existingHeadersSet.has(header));
    if (newHeadersToAdd.length > 0) {
        const lastCol = sheet.getLastColumn();
        sheet.getRange(1, lastCol + 1, 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
        headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    const timestampReport = new Date();

    // --- INÍCIO DA CORREÇÃO ---
    // Mapeamento de dados para a PLANILHA
    const rowDataMap = {
      "Timestamp Relatorio": timestampReport,
      "ID da OS": data.osId,
      "Nome do Usuario": data.userName,

      // Dados Planejados
      "OS Planejado - Local": data.Local,
      "OS Planejado - Talhoes (Area)": data.TalhoesArea,
      "OS Planejado - Área Total (ha)": data.reaTotalha,
      "OS Planejado - Data de Inicio": formatDateForSheet(data.DatadeInicio),
      "OS Planejado - Data de Termino": formatDateForSheet(data.DatadeTermino),
      "OS Planejado - Cultura / Cultivar": data.CulturaCultivar,
      "OS Planejado - Trator": data.Trator,
      "OS Planejado - Operador(es)": data.Operadores,
      "OS Planejado - Implemento": data.Implemento,
      "OS Planejado - Observacao": data.Observacao || data.Observao,

      // Dados Realizados
      "OS Realizado - Local": data.realizado_Local,
      "OS Realizado - Talhoes (Area)": data.realizado_TalhoesArea,
      "OS Realizado - Área Total (ha)": data.realizado_reaTotalha,
      "OS Realizado - Data de Inicio": formatDateForSheet(data.realizado_DatadeInicio),
      "OS Realizado - Data de Termino": formatDateForSheet(data.realizado_DatadeTermino),
      "OS Realizado - Cultura / Cultivar": data.realizado_CulturaCultivar,
      "OS Realizado - Trator": data.realizado_Trator,
      "OS Realizado - Operador(es)": data.realizado_Operadores,
      "OS Realizado - Implemento": data.realizado_Implemento,
      "OS Realizado - Observacao": data.realizado_Observacao || data.realizado_Observao, // Remove o fallback para o valor planejado
      
      // Dados específicos do relatório
      "Relatorio - Horimetro Inicio": data.horimetroInicio,
      "Relatorio - Horimetro Fim": data.horimetroFim,
      "Relatorio - Paradas Imprevistas": data.paradasImprevistas,
      "Relatorio - Numero Abastecimentos": data.numAbastecimentos
    };
    // --- FIM DA CORREÇÃO ---
    
    // Adiciona dados de abastecimento dinâmicos ao mapa
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      for (let i = 1; i <= numAbastecimentos; i++) {
        rowDataMap[`Relatorio - Horimetro Abastecimento ${i}`] = data[`abastecimento_horimetro_${i}`] || '';
        rowDataMap[`Relatorio - Litros Abastecimento ${i}`] = data[`abastecimento_litros_${i}`] || '';
      }
    }

    const rowValues = headers.map(header => rowDataMap[header] !== undefined ? rowDataMap[header] : '');
    sheet.appendRow(rowValues);

    // --- GERAÇÃO DE PDF (SEM ALTERAÇÃO) ---
    const templateId = REPORT_TEMPLATE_IDS[activity];
    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados do relatório registrados! Template de PDF não configurado." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const newFileName = `Relatorio - ${activity} - OS ${osId || 'S-ID'} - ${data.local || 'local'} - ${formatDateForPdf(timestampReport)}`;
    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    const placeholderMap = {
      '{{OS_ID_RELATORIO}}': osId,
      '{{DATA_RELATORIO}}': formatDateForPdf(timestampReport),
      '{{USUARIO_RELATORIO}}': data.userName,
      '{{ATIVIDADE_RELATORIO}}': activity,
      '{{LOCAL_OS_RELATORIO}}': data.local,
      '{{TALHOES_OS_RELATORIO}}': data.talhoes,
      '{{AREA_TOTAL_OS_RELATORIO}}': data.areaTotalHectares,
      '{{DATA_INICIO_OS_RELATORIO}}': formatDateForPdf(data.dataInicio),
      '{{DATA_TERMINO_OS_RELATORIO}}': formatDateForPdf(data.dataTermino),
      '{{HORIMETRO_INICIO}}': data.horimetroInicio,
      '{{HORIMETRO_FIM}}': data.horimetroFim,
      '{{PARADAS_IMPREVISTAS}}': data.paradasImprevistas,
      '{{NUM_ABASTECIMENTOS}}': data.numAbastecimentos,
      '{{TRATOR_OS}}': data.trator,
      '{{OPERADORES_OS}}': data.operadores,
      '{{IMPLEMENTO_OS}}': data.implemento,
      '{{OBSERVACAO_OS}}': data.observacao,
    };

    for (const placeholder in placeholderMap) {
        if (placeholderMap[placeholder] !== undefined && placeholderMap[placeholder] !== null) {
             body.replaceText(placeholder, placeholderMap[placeholder]);
        }
    }

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
            for (let i = 1; i <= numAbastecimentos && i <= MAX_ABASTECIMENTOS_PDF; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{HorimetroAbastecimento}}", data['abastecimento_horimetro_' + i] || '');
                newRow.replaceText("{{LitrosAbastecimento}}", data['abastecimento_litros_' + i] || '');
            }
            table.removeRow(templateRowIndex);
        } catch(err) {
            Logger.log("Erro ao processar tabela de abastecimentos: " + err.toString());
        }
    } else if (abastecimentoTableElement) {
        try {
            const rowElement = abastecimentoTableElement.getElement().getParent().getParent();
            if (rowElement.getType() === DocumentApp.ElementType.TABLE_ROW) {
                rowElement.removeFromParent();
            }
        } catch(err) {
            Logger.log("Erro ao remover linha de template de abastecimentos: " + err.toString());
        }
    }
    
    body.replaceText('\\{\\{.*?\\}\\}', '');
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