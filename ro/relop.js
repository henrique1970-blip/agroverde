/*
* RelOp.js
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Ele é responsável por:
* 1. Receber os dados do formulário de Relatório de Operações (via doPost).
* 2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
* 3. Criar abas dinamicamente, se necessário.
* 4. Gerar PDFs de relatório para as operações.
* 5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
*/

// --- CONFIGURAÇÕES GLOBAIS ---
// ID da planilha onde os dados do relatório serão gravados
const REPORT_SPREADSHEET_ID = "1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8";
// ID da pasta onde os PDFs do relatório serão salvos
const PDF_REPORT_FOLDER_ID = "1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI";

// IDs dos modelos de documento Google Docs para cada atividade de relatório
// ATENÇÃO: Você precisará criar estes modelos e colocar os IDs corretos aqui.
// Para começar, podemos usar um modelo genérico ou para "Preparo de Área"
const REPORT_TEMPLATE_IDS = {
  "PreparodeArea": "COLOQUE_AQUI_O_ID_DO_TEMPLATE_PDF_DE_PREPARO_DE_AREA", // Ex: "1AbCdefGhiJklMnoPqrStUvWxyZ_0123456789"
  // Adicione outras atividades aqui conforme necessário no futuro
  // "TratamentodeSementes": "ID_DO_TEMPLATE_DE_TRATAMENTO_DE_SEMENTES",
};

// Mapeamento dos cabeçalhos de coluna para cada atividade
// Isso permitirá expandir para outras atividades no futuro
const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [
    "Timestamp Relatorio", "ID da OS Relatorio", "Nome do Usuario Relatorio", "Local da OS",
    "Talhoes da OS", "Area Total da OS (ha)", "Data Inicio da OS", "Data Termino da OS",
    // Novos campos específicos do relatório para Preparo de Área
    "Horimetro Inicio", "Horimetro Fim", "Paradas Imprevistas", "Numero Abastecimentos"
    // Os campos de abastecimento serão adicionados dinamicamente
  ],
  // Adicione outras atividades aqui com seus respectivos cabeçalhos
  // "TratamentodeSementes": ["Timestamp Relatorio", ..., "Campos Específicos Trat. Sementes"]
};

// Número máximo de abastecimentos que o template PDF pode suportar ou que o script espera
const MAX_ABASTECIMENTOS_PDF = 10; // Ajuste conforme seu template de PDF

// --- FUNÇÕES AUXILIARES ---

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
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss"); // Incluir hora para timestamp
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
    const osId = data.osId; // A ID da OS original da operação

    if (!activity || !osId) {
      return createJsonResponse({ success: false, message: "Erro: Atividade ou ID da OS não especificados." });
    }

    const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
    let sheet = ss.getSheetByName(activity);
    let headers = REPORT_HEADERS_CONFIG[activity] || [];

    if (!sheet) {
      sheet = ss.insertSheet(activity);
      // Adiciona cabeçalhos iniciais se a aba for nova
      if (headers.length > 0) {
        sheet.appendRow(headers);
      }
    } else {
      // Pega os cabeçalhos existentes se a aba já existe
      const currentLastColumn = sheet.getLastColumn();
      if (currentLastColumn > 0) {
        headers = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];
      } else if (REPORT_HEADERS_CONFIG[activity].length > 0) {
        // Se a aba existe mas não tem cabeçalhos (estranho, mas seguro)
        sheet.appendRow(REPORT_HEADERS_CONFIG[activity]);
        headers = REPORT_HEADERS_CONFIG[activity];
      }
    }

    // Lógica para adicionar cabeçalhos dinâmicos de abastecimento
    const numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    let dynamicAbastecimentoHeaders = [];
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      for (let i = 1; i <= numAbastecimentos; i++) {
        dynamicAbastecimentoHeaders.push(`Horimetro Abastecimento ${i}`);
        dynamicAbastecimentoHeaders.push(`Litros Abastecimento ${i}`);
      }
    }

    // Concatena cabeçalhos fixos com dinâmicos, adicionando novos se não existirem
    let finalHeadersForSheet = [...new Set([...headers, ...dynamicAbastecimentoHeaders])]; // Usa Set para remover duplicatas e manter ordem aparente

    // Adiciona novos cabeçalhos à planilha se existirem
    const existingHeadersSet = new Set(headers);
    const newHeadersToAdd = finalHeadersForSheet.filter(header => !existingHeadersSet.has(header));
    if (newHeadersToAdd.length > 0) {
        const lastCol = sheet.getLastColumn();
        sheet.getRange(1, lastCol + 1, 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
        // Atualiza a lista de cabeçalhos após adicionar novos
        headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }

    const timestampReport = new Date();

    // Mapeamento dos dados do formulário para os cabeçalhos da planilha
    const rowDataMap = {
      "Timestamp Relatorio": timestampReport,
      "ID da OS Relatorio": data.osId,
      "Nome do Usuario Relatorio": data.userName,
      "Local da OS": data.local,
      "Talhoes da OS": data.talhoes,
      "Area Total da OS (ha)": data.areaTotalHectares,
      "Data Inicio da OS": formatDateForSheet(data.dataInicio), // Salva como data completa para sheets
      "Data Termino da OS": formatDateForSheet(data.dataTermino), // Salva como data completa para sheets
      // Campos de Preparo de Área
      "Horimetro Inicio": data.horimetroInicio,
      "Horimetro Fim": data.horimetroFim,
      "Paradas Imprevistas": data.paradasImprevistas,
      "Numero Abastecimentos": data.numAbastecimentos,
    };

    // Adiciona dados de abastecimento dinâmicos ao mapa
    if (activity === "PreparodeArea" && numAbastecimentos > 0) {
      for (let i = 1; i <= numAbastecimentos; i++) {
        rowDataMap[`Horimetro Abastecimento ${i}`] = data[`abastecimento_horimetro_${i}`] || '';
        rowDataMap[`Litros Abastecimento ${i}`] = data[`abastecimento_litros_${i}`] || '';
      }
    }

    // Cria a linha de dados na ordem dos cabeçalhos (incluindo os novos)
    const rowValues = headers.map(header => rowDataMap[header] !== undefined ? rowDataMap[header] : '');
    sheet.appendRow(rowValues);

    // --- Geração de PDF do Relatório ---
    const templateId = REPORT_TEMPLATE_IDS[activity];
    if (!templateId || templateId === "COLOQUE_AQUI_O_ID_DO_TEMPLATE_PDF_DE_PREPARO_DE_AREA") {
      return createJsonResponse({ success: true, message: "Dados do relatório registrados! Template de PDF ainda não configurado para esta atividade." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    const newFileName = `Relatorio - ${activity} - OS ${osId || 'S-ID'} - ${data.local || 'local'} - ${formatDateForPdf(timestampReport)}`;
    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    // Mapeamento de placeholders para o PDF do Relatório
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
      // Preparo de Área
      '{{HORIMETRO_INICIO}}': data.horimetroInicio,
      '{{HORIMETRO_FIM}}': data.horimetroFim,
      '{{PARADAS_IMPREVISTAS}}': data.paradasImprevistas,
      '{{NUM_ABASTECIMENTOS}}': data.numAbastecimentos,
      // Outros campos da OS que podem ser relevantes no PDF do relatório, se passados pelo frontend
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

    // Lógica para tabela dinâmica de abastecimentos no PDF
    const abastecimentoTableElement = body.findText("{{HorimetroAbastecimento}}"); // Placeholder no template do PDF
    if (activity === "PreparodeArea" && numAbastecimentos > 0 && abastecimentoTableElement) {
        try {
            let element = abastecimentoTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) {
                element = element.getParent();
                if (element.getParent().getType() === DocumentApp.ElementType.BODY_SECTION) {
                    throw new Error("O placeholder '{{HorimetroAbastecimento}}' não foi encontrado dentro de uma tabela.");
                }
            }
            const templateRow = element.getParent();
            const table = templateRow.getParent();

            if (table.getType() !== DocumentApp.ElementType.TABLE) {
                throw new Error("A linha de abastecimento não está dentro de uma tabela válida.");
            }

            const templateRowIndex = table.getChildIndex(templateRow);

            for (let i = 1; i <= numAbastecimentos && i <= MAX_ABASTECIMENTOS_PDF; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{HorimetroAbastecimento}}", data['abastecimento_horimetro_' + i] || '');
                newRow.replaceText("{{LitrosAbastecimento}}", data['abastecimento_litros_' + i] || '');
            }
            table.removeRow(templateRowIndex); // Remove a linha do template original
        } catch(err) {
            Logger.log("Erro ao processar tabela dinâmica de abastecimentos: " + err.toString());
            body.replaceText("{{HorimetroAbastecimento}}", "Erro ao gerar lista de abastecimentos.");
            body.replaceText("{{LitrosAbastecimento}}", "");
        }
    } else if (activity === "PreparodeArea" && abastecimentoTableElement) {
        // Se não houver abastecimentos ou não for Preparo de Área, remova a linha do template da tabela
        try {
            const rowElement = abastecimentoTableElement.getElement().getParent().getParent();
            if (rowElement.getType() === DocumentApp.ElementType.TABLE_ROW) {
                rowElement.removeFromParent();
            }
        } catch(err) {
            Logger.log("Erro ao remover linha de template de abastecimentos: " + err.toString());
        }
    }
    
    // Remove quaisquer placeholders restantes (importante para evitar texto {{PLACEHOLDER}} no PDF final)
    body.replaceText('\\{\\{.*?\\}\\}', '');

    doc.saveAndClose();

    const pdfBlob = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
    tempDocFile.setTrashed(true); // Move o arquivo temporário para a lixeira

    const pdfUrl = finalPdfFile.getUrl();
    const folderUrl = pdfFolder.getUrl();

    return createJsonResponse({ success: true, message: "Relatório registrado e PDF criado!", pdfUrl: pdfUrl, folderUrl: folderUrl });

  } catch (error) {
    Logger.log("Erro no servidor do Relatório: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor do Relatório: " + error.toString() });
  }
}