/*
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Ele é responsável por:
* 1. Receber os dados do formulário de Relatório de Operações (via doPost).
* 2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
* 3. Criar abas dinamicamente, se necessário.
* 4. Gerar PDFs de relatório para as operações.
* 5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
*/

const REPORT_SPREADSHEET_ID = "1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8";
const PDF_REPORT_FOLDER_ID = "1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI";

const REPORT_TEMPLATE_IDS = {
  "PreparodeArea": "1mpWpIZkZ58zV_SojCAG7ibqSoC_OyXHmSTBNm2FcMq0",
  "TratamentodeSementes": "1D-zNji40SaoO-1Smy46kbAZnZIqx5JRpL63tYTqpfgQ",
  "Plantio": "1s3HKETzY1Y-EWD08PV3xwNOJpl1RchiRbv-pJc8nmDI",
  "Pulverizacao": "1CbaCfu6Hm57FHf1ozUBlfb_euDLgg8IoM1Fvz1pTtag"
};

const COMMON_OS_HEADERS = [ "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Observacao", "OS Realizado - Observacao" ];
const TDS_COMMON_HEADERS = COMMON_OS_HEADERS.filter(h => !h.includes("Trator") && !h.includes("Implemento"));

const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...COMMON_OS_HEADERS, "OS Planejado - Cultura / Cultivar", "OS Realizado - Cultura / Cultivar", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "TratamentodeSementes": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...TDS_COMMON_HEADERS, "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Qtd Sementes (Kg)", "OS Realizado - Qtd Sementes (Kg)", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Maquina", "OS Realizado - Maquina" ],
  "Plantio": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Quantidade/ha - Máximo", "OS Realizado - Quantidade/ha - Máximo", "OS Planejado - Quantidade/ha - Mínimo", "OS Realizado - Quantidade/ha - Mínimo", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Plantas por metro", "OS Realizado - Plantas por metro", "OS Planejado - Espacamento entre plantas", "OS Realizado - Espacamento entre plantas", "OS Planejado - PMS", "OS Realizado - PMS", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "Pulverizacao": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtos e quantidades", "OS Realizado - Produtos e quantidades", "OS Planejado - Bico", "OS Realizado - Bico", "OS Planejado - Capacidade do tanque", "OS Realizado - Capacidade do tanque", "OS Planejado - Vazão (L/ha)", "OS Realizado - Vazão (L/ha)", "OS Planejado - Pressão", "OS Realizado - Pressão", "OS Planejado - Dose/ha", "OS Realizado - Dose/ha", "OS Planejado - Dose/tanque", "OS Realizado - Dose/tanque", "OS Planejado - Máquina (Pulverizador)", "OS Realizado - Máquina (Pulverizador)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ]
};


function createJsonResponse(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function parseDateForSheet(dateInput) {
  if (!dateInput) return '';
  try {
    let date = new Date(dateInput);
    if (!isNaN(date.getTime())) return date;

    const parts = dateInput.split('/');
    if (parts.length === 3) {
      date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
      if (!isNaN(date.getTime())) return date;
    }
    return dateInput;
  } catch (e) {
    return dateInput;
  }
}

function formatDateForPdf(dateInput) {
  if (!dateInput) return '';
  try {
    const date = parseDateForSheet(dateInput);
    return isNaN(date.getTime()) ? dateInput : Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) { return dateInput; }
}

function formatNumberForPdf(numInput) {
  if (numInput === null || numInput === undefined || numInput === '') return '';
  try {
    const num = parseFloat(numInput.toString().replace(',', '.'));
    if (isNaN(num)) return numInput;
    return num.toFixed(1).replace('.', ',');
  } catch (e) {
    return numInput;
  }
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
    
    const numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    if (["PreparodeArea", "Plantio", "Pulverizacao"].includes(activity) && numAbastecimentos > 0) {
        let dynamicHeaders = [];
        for (let i = 1; i <= numAbastecimentos; i++) {
            dynamicHeaders.push(`Relatorio - Horimetro Abastecimento ${i}`);
            dynamicHeaders.push(`Relatorio - Litros Abastecimento ${i}`);
        }
        const existingHeadersSet = new Set(headers);
        const newHeadersToAdd = dynamicHeaders.filter(h => !existingHeadersSet.has(h));
        if (newHeadersToAdd.length > 0) {
            sheet.getRange(1, headers.length + 1, 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
            headers.push(...newHeadersToAdd);
        }
    }
    
    const rowDataMap = {
      "Timestamp Relatorio": timestampReport, "ID da OS": osId, "Nome do Usuario": data.userName,
      "OS Planejado - Local": data.Local, "OS Realizado - Local": data.realizado_Local,
      "OS Planejado - Talhoes (Area)": data.TalhoesArea, "OS Realizado - Talhoes (Area)": data.realizado_TalhoesArea,
      "OS Planejado - Área Total (ha)": data.reaTotalha, "OS Realizado - Área Total (ha)": data.realizado_reaTotalha,
      "OS Planejado - Data de Inicio": parseDateForSheet(data.DatadeInicio), "OS Realizado - Data de Inicio": parseDateForSheet(data.realizado_DatadeInicio),
      "OS Planejado - Data de Termino": parseDateForSheet(data.DatadeTermino), "OS Realizado - Data de Termino": parseDateForSheet(data.realizado_DatadeTermino),
      "OS Planejado - Operador(es)": data.Operadores, "OS Realizado - Operador(es)": data.realizado_Operadores,
      "OS Planejado - Observacao": data.Observacao, "OS Realizado - Observacao": data.observacao,
      "OS Planejado - Trator": data.Trator, "OS Realizado - Trator": data.realizado_Trator,
      "OS Planejado - Implemento": data.Implemento, "OS Realizado - Implemento": data.realizado_Implemento,
      "OS Planejado - Cultura / Cultivar": data.CulturaCultivar, "OS Realizado - Cultura / Cultivar": data.realizado_CulturaCultivar,
      "Relatorio - Horimetro Inicio": data.horimetroInicio, "Relatorio - Horimetro Fim": data.horimetroFim,
      "Relatorio - Paradas Imprevistas": data.paradasImprevistas, "Relatorio - Numero Abastecimentos": data.numAbastecimentos,
      "OS Planejado - Cultura e Cultivar": data.CulturaeCultivar, "OS Realizado - Cultura e Cultivar": data.realizado_CulturaeCultivar,
      "OS Planejado - Qtd Sementes (Kg)": data.QtdSementesKg, "OS Realizado - Qtd Sementes (Kg)": data.realizado_QtdSementesKg,
      "OS Planejado - Produtos e Dosagens": data.Insumos || data.ProdutoseDosagens, "OS Realizado - Produtos e Dosagens": data.realizado_Insumos || data.realizado_ProdutoseDosagens,
      "OS Planejado - Maquina": data.Maquina, "OS Realizado - Maquina": data.realizado_Maquina,
      "OS Planejado - Quantidade/ha - Máximo": data.QtdhaMaximo, "OS Realizado - Quantidade/ha - Máximo": data.realizado_QtdhaMaximo,
      "OS Planejado - Quantidade/ha - Mínimo": data.QtdhaMinimo, "OS Realizado - Quantidade/ha - Mínimo": data.realizado_QtdhaMinimo,
      "Relatorio - Plantas por metro": data.realizado_Plantaspormetro,
      "Relatorio - Espaçamento entre plantas": data.realizado_Espacamentoentreplantas,
      "Relatorio - Peso de mil sementes (PMS)": data.realizado_PMS,
      
      // --- CORREÇÃO FINAL PARA A PLANILHA ---
      "OS Planejado - Produtos e quantidades": data.produtosQuantidade,
      "OS Realizado - Produtos e quantidades": data.realizado_produtosQuantidade,
      "OS Planejado - Bico": data.Bico, "OS Realizado - Bico": data.realizado_Bico,
      "OS Planejado - Capacidade do tanque": data.Capacidadedotanque, "OS Realizado - Capacidade do tanque": data.realizado_Capacidadedotanque,
      "OS Planejado - Vazão (L/ha)": data.vazaoLHa,
      "OS Realizado - Vazão (L/ha)": data.realizado_vazaoLHa,
      "OS Planejado - Pressão": data.pressao,
      "OS Realizado - Pressão": data.realizado_pressao,
      "OS Planejado - Dose/ha": data.Doseha, "OS Realizado - Dose/ha": data.realizado_Doseha,
      "OS Planejado - Dose/tanque": data.Dosetanque, "OS Realizado - Dose/tanque": data.realizado_Dosetanque,
      "OS Planejado - Máquina (Pulverizador)": data.maquina,
      "OS Realizado - Máquina (Pulverizador)": data.realizado_maquina
    };

    

    if ((["PreparodeArea", "Plantio", "Pulverizacao"].includes(activity)) && numAbastecimentos > 0) {
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
      // Comuns
      '{{DATA_EMISSAO}}': formatDateForPdf(timestampReport), '{{USUARIO_REGISTRO}}': data.userName, '{{USUARIO_RELATORIO}}': data.userName, '{{DATA_RELATORIO}}': formatDateForPdf(timestampReport),
      '{{OBSERVACAO_OS_RELATORIO}}': data.observacao, '{{ID_OPERACAO}}': `${osId}-OP`, '{{OS_ID}}': osId,
      '{{LOCAL_OS_RELATORIO}}': data.realizado_Local, '{{LOCAL_ATIVIDADE}}': data.realizado_Local,
      '{{TALHOES_OS_RELATORIO}}': data.realizado_TalhoesArea, '{{TALHOES_SELECIONADOS}}': data.realizado_TalhoesArea,
      '{{AREA_TOTAL_OS_RELATORIO}}': formatNumberForPdf(data.realizado_reaTotalha), '{{AREA_TOTAL_HECTARES}}': formatNumberForPdf(data.realizado_reaTotalha),
      '{{DATA_INICIO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeInicio), '{{DATA_INICIO}}': formatDateForPdf(data.realizado_DatadeInicio),
      '{{DATA_TERMINO_OS_RELATORIO}}': formatDateForPdf(data.realizado_DatadeTermino), '{{DATA_TERMINO}}': formatDateForPdf(data.realizado_DatadeTermino),
      '{{OPERADORES_OS}}': data.realizado_Operadores, '{{OPERADORES}}': data.realizado_Operadores, '{{OBSERVACAO_OS}}': data.Observacao,
      // Etapa 1, 3 e 4
      '{{HORIMETRO_INICIO}}': data.horimetroInicio, '{{HORIMETRO_FIM}}': data.horimetroFim,
      '{{PARADAS_IMPREVISTAS}}': data.paradasImprevistas, '{{NUM_ABASTECIMENTOS}}': data.numAbastecimentos,
      '{{TRATOR_OS}}': data.realizado_Trator, '{{TRATOR}}': data.realizado_Trator,
      '{{IMPLEMENTO_OS}}': data.realizado_Implemento, '{{IMPLEMENTO}}': data.realizado_Implemento,
      // Etapa 2
      '{{QTD_SEMENTES_KG_OS}}': formatNumberForPdf(data.realizado_QtdSementesKg),
      '{{PRODUTOS_UTILIZADOS_OS}}': data.realizado_Insumos || data.realizado_ProdutoseDosagens,
      '{{MAQUINA_OS}}': data.realizado_Maquina,
      // Etapa 3
      '{{CULTURA_CULTIVAR}}': data.realizado_CulturaeCultivar || data.realizado_CulturaCultivar,
      '{{QTD_HA_MAX}}': formatNumberForPdf(data.realizado_QtdhaMaximo), '{{QTD_HA_MIN}}': formatNumberForPdf(data.realizado_QtdhaMinimo),
      '{{PLANTAS_METRO}}': data.realizado_Plantaspormetro,
      '{{ESPACAMENTO_PLANTAS}}': data.realizado_Espacamentoentreplantas,
      '{{PMS}}': formatNumberForPdf(data.realizado_PMS),
      
      // --- INÍCIO DA SOLUÇÃO DEFINITIVA: Pulverização com chaves padronizadas para o PDF ---
      '{{PRODUTOS_QTD_HA}}': data.realizado_produtosQuantidade,
      '{{BICO}}': data.realizado_Bico,
      '{{CAPACIDADE_TANQUE}}': formatNumberForPdf(data.realizado_Capacidadedotanque),
      '{{VAZAO_L_HA}}': formatNumberForPdf(data.realizado_vazaoLHa),
      '{{PRESSAO}}': formatNumberForPdf(data.realizado_pressao),
      '{{DOSE_HA}}': formatNumberForPdf(data.realizado_Doseha),
      '{{DOSE_TANQUE}}': formatNumberForPdf(data.realizado_Dosetanque),
      '{{MAQUINA}}': data.realizado_maquina,
      // --- FIM DA SOLUÇÃO DEFINITIVA ---
    };

    for (const placeholder in placeholderMap) { body.replaceText(placeholder, placeholderMap[placeholder] || ''); }
    
    const abastecimentoTableElement = body.findText("{{HorimetroAbastecimento}}");
    if ((["PreparodeArea", "Plantio", "Pulverizacao"].includes(activity)) && numAbastecimentos > 0 && abastecimentoTableElement) {
        try {
            let element = abastecimentoTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) { element = element.getParent(); }
            const templateRow = element.getParent();
            const table = templateRow.getParent();
            const templateRowIndex = table.getChildIndex(templateRow);
            for (let i = 1; i <= numAbastecimentos; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{HorimetroAbastecimento}}", data['abastecimento_horimetro_' + i] || '');
                newRow.replaceText("{{LitrosAbastecimento}}", data['abastecimento_litros_' + i] || '');
            }
            table.removeRow(templateRowIndex);
        } catch(err) { Logger.log("Erro ao processar tabela de abastecimentos no PDF: " + err.toString()); }
    }
    
    doc.saveAndClose();
    const pdfBlob = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
    tempDocFile.setTrashed(true);

    return createJsonResponse({ success: true, pdfUrl: finalPdfFile.getUrl(), folderUrl: pdfFolder.getUrl() });

  } catch (error) {
    Logger.log("Erro no servidor: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error.toString() });
  }
}