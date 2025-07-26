/*

Esse script deve ser gravado na planilha a conter os dados digitados.

Este projeto é composto dos seguintes elementos:
1. Planilha do Google Sheets nomeada "FAV - Ordem de Serviço"
2. Script do Google Script - este arquivo
3. java script nomeado como "script.js"  (bem original, né?), responsável pelo trabalho "pesado"
4. Service-worker.js, outro java script responsável por fazer a conexão entre os diferentes elementos do projeto
5. manifest.json 
6. style.css
7. index.html
8. icon-192x192.png
9. icon-512x512.png
10.logoFAVbase64.css


O endereço URL da planilha é
https://docs.google.com/spreadsheets/d/1vWqfkjNYD71bsea_mCY_WmmjUKZJzQaPzIThVyisp34/edit?gid=0#gid=0

Passos para gravar o script:

- Abrir a planilha no Google Drive
- Acessar o menu "Extensões"
- Selecionar a opção "Apps Script"
- Apagar o conteúdo existente e colar todo o conteúdo deste arquivo

*/

// --- CONFIGURAÇÕES PARA GERAR PDF ---
// --- CONFIGURAÇÕES ---
const TEMPLATE_IDS = {
  "PreparodeArea": "19ZED49t_UCG8vb5QTaeNMDwoMtyEysmKh_n5oV0KBPU",
  "TratamentodeSementes": "17-Ao_mdN82xD1qipdMVqnac2k4Kga17nPtSDIhN2cJY",
  "Plantio": "1PbO-nm4JGm2WtOjftXTCedmwdaxc3I-psXYK5HYysj0",
  "Pulverizacao": "1ukv9o1ZAkBfMbhDLo4Qcb7BeCSBvxBdNs207Hq3xLx4",
  "Colheita": "1epcbgrnwAMKgEEDxdi8bNWskM7SXjZxf_FpAIUVR6Z8",
  "Lancas": "1kFocDdOm0H0KX1dPtR4MMSQrHjkaR3FWgSfJ4w8I7L0"
};
const PDF_FOLDER_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754";
const MAX_PRODUCTS = 20; // O mesmo limite para produtos e caminhões
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
    // Tenta criar uma data. Se já for um objeto Date, usa diretamente.
    var date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput; // Se for inválido, retorna o input original
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) {
    return dateInput; // Em caso de erro, retorna o input original
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
    
    // Concatena produtos
    let produtosString = '';
    const numProducts = parseInt(data.numProducts || '0');
    for (let i = 1; i <= numProducts; i++) {
        const nome = data[`product_name_${i}`];
        const dose = data[`product_dosage_${i}`];
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
      "Colheita": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Produtividade estimada", "Colhedeira", "Operador(es) Colhedeira", "Trator", "Operador(es) Trator", "Implemento", "Observacao"],
      "Lancas": ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Área Total (ha)", "Data de Inicio", "Data de Termino", "Cultura e Cultivar", "Quantidade de produto/hectare", "Maquina", "Operador(es)", "Implemento", "Observacao"]
    };

    let baseHeaders = headersConfig[activity] || [];
    let finalHeadersForSheet = [...baseHeaders];

    // Adiciona apenas os cabeçalhos de caminhão/motorista que são relevantes para a submissão atual
    const numTrucksFromSubmission = (activity === "Colheita") ? parseInt(data.numTrucks || '0') : 0;
    if (activity === "Colheita") {
        for (let i = 1; i <= numTrucksFromSubmission; i++) {
            finalHeadersForSheet.push(`Caminhão ${i}`);
            finalHeadersForSheet.push(`Motorista ${i}`);
        }
    }

    let headers;

    if (!sheet) {
        sheet = ss.insertSheet(activity);
        if (finalHeadersForSheet.length > 0) {
            sheet.appendRow(finalHeadersForSheet);
            headers = finalHeadersForSheet;
        } else {
            headers = []; 
        }
    } else {
        const currentLastColumn = sheet.getLastColumn();
        const existingHeaders = (currentLastColumn > 0) ? sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0] : [];
        
        const newHeadersToAdd = finalHeadersForSheet.filter(header => !existingHeaders.includes(header));

        if (newHeadersToAdd.length > 0) {
            sheet.getRange(1, Math.max(1, currentLastColumn + 1), 1, newHeadersToAdd.length).setValues([newHeadersToAdd]);
            Logger.log(`Added new headers to existing sheet ${activity}: ${newHeadersToAdd.join(', ')}`);
        }
        
        headers = (sheet.getLastColumn() > 0) ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
        
        if (headers.length === 0 && finalHeadersForSheet.length > 0) {
            sheet.appendRow(finalHeadersForSheet);
            headers = finalHeadersForSheet;
        }
    }
    
    const timestamp = new Date();
    
    const dataMap = {
      "Timestamp": timestamp, "ID da OS": data.osId, "Nome do Usuário": data.userName,
      "Local": data.local, "Talhoes (Area)": data.talhoes, "Área Total (ha)": data.areaTotalHectares,
      "Data de Inicio": data.dataInicio, "Data de Termino": data.dataTermino, "Trator": data.trator, 
      "Operador(es)": data.operadores, "Operadores": data.operadores, "Implemento": data.implemento, 
      "Observacao": data.observacao, "Cultura e Cultivar": data.culturaCultivar, "Qtd Sementes (Kg)": data.qtdSementesKg,
      "Produtos e Dosagens": data.produtosConcatenados,
      "Maquina": data.maquina, "Qtd/ha - Maximo": data.qtdHaMax,
      "Qtd/ha - Minimo": data.qtdHaMin, "Insumos": data.produtosConcatenados,
      "Plantas por metro": data.plantasPorMetro,
      "Espacamento entre plantas": data.espacamentoPlantas, "PMS": data.pms, "Bico": data.bico, 
      "Capacidade do tanque": data.capacidadeTanque, "Vazao (L/ha)": data.vazaoLHa, "Pressao": data.pressao, 
      "Dose/ha": data.doseHa, "Dose/tanque": data.doseTanque, "Produtividade estimada": data.produtividadeEstimada, 
      "Colhedeira": data.maquina, "Operador(es) Colhedeira": data.operadoresMaquina,
      "Operador(es) Trator": data.operadoresTrator, 
      "Quantidade de produto/hectare": data.produtosConcatenados,
      "Produto(s) e quantidade/ha": data.produtosConcatenados
    };

    if (activity === "Colheita") {
        const numTrucks = parseInt(data.numTrucks || '0');
        for (let i = 1; i <= MAX_PRODUCTS; i++) {
            dataMap[`Caminhão ${i}`] = (i <= numTrucks) ? (data[`identificacao_caminhao_${i}`] || "") : "";
            dataMap[`Motorista ${i}`] = (i <= numTrucks) ? (data[`motorista_caminhao_${i}`] || "") : "";
        }
    }
    
    const rowData = headers.map(header => dataMap[header] !== undefined ? dataMap[header] : '');
    if (rowData.length === 0 && headers.length === 0) {
        rowData.push("");
    }
    
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
      '{{OPERADORES_MAQUINA}}': data.operadoresMaquina,
      '{{TRATOR}}': data.trator, '{{OPERADORES_TRATOR}}': data.operadoresTrator, '{{IMPLEMENTO}}': data.implemento,
      '{{MAQUINA}}': data.maquina, '{{BICO}}': data.bico, '{{CAPACIDADE_TANQUE}}': data.capacidadeTanque,
      '{{VAZAO_L_HA}}': data.vazaoLHa, '{{PRESSAO}}': data.pressao, '{{DOSE_HA}}': data.doseHa, '{{DOSE_TANQUE}}': data.doseTanque,
      '{{PMS}}': data.pms,
      '{{PLANTAS_METRO}}': data.plantasPorMetro,
      '{{QTD_HA_MAX}}': data.qtdHaMax,
      '{{QTD_HA_MIN}}': data.qtdHaMin,
      '{{ESPACAMENTO_PLANTAS}}': data.espacamentoPlanta
    };

    for (const placeholder in placeholderMap) {
        if (placeholderMap[placeholder] !== undefined && placeholderMap[placeholder] !== null) {
             body.replaceText(placeholder, placeholderMap[placeholder]);
        }
    }

    const productTableElement = body.findText("{{Nome Produto}}");
    const numTrucks = parseInt(data.numTrucks || '0');

    if (numProducts > 0 && productTableElement) {
        try {
            var element = productTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) {
                element = element.getParent();
                if (element.getParent().getType() === DocumentApp.ElementType.BODY_SECTION) {
                    throw new Error("O placeholder '{{Nome Produto}}' não foi encontrado dentro de uma tabela.");
                }
            }
            const templateRow = element.getParent();
            const table = templateRow.getParent();

            if (table.getType() !== DocumentApp.ElementType.TABLE) {
                throw new Error("A linha do produto não está dentro de uma tabela válida.");
            }

            const templateRowIndex = table.getChildIndex(templateRow);

            for (let i = 1; i <= numProducts; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{Nome Produto}}", data['product_name_' + i] || '');
                newRow.replaceText("{{Dose Produto}}", data['product_dosage_' + i] || '');
            }
            table.removeRow(templateRowIndex);
        } catch(err) {
            Logger.log("Erro ao processar tabela dinâmica de produtos: " + err.toString());
            body.replaceText("{{Nome Produto}}", "Erro ao gerar lista de produtos.");
            body.replaceText("{{Dose Produto}}", "");
        }
    } else if (productTableElement) {
        try {
            const rowElement = productTableElement.getElement().getParent().getParent();
            if (rowElement.getType() === DocumentApp.ElementType.TABLE_ROW) {
                rowElement.removeFromParent();
            }
        } catch(err) {
            Logger.log("Erro ao remover linha de template de produtos: " + err.toString());
        }
    }

    const truckTableElement = body.findText("{{Caminhao_ID}}");
    if (activity === "Colheita" && numTrucks > 0 && truckTableElement) {
        try {
            let element = truckTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) {
                element = element.getParent();
                if (element.getParent().getType() === DocumentApp.ElementType.BODY_SECTION) {
                    throw new Error("O placeholder '{{Caminhao_ID}}' não foi encontrado dentro de uma tabela.");
                }
            }
            const templateRow = element.getParent();
            const table = templateRow.getParent();

            if (table.getType() !== DocumentApp.ElementType.TABLE) {
                throw new Error("A linha do caminhão não está dentro de uma tabela válida.");
            }

            const templateRowIndex = table.getChildIndex(templateRow);

            for (let i = 1; i <= numTrucks; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText("{{Caminhao_ID}}", data['identificacao_caminhao_' + i] || '');
                newRow.replaceText("{{Motorista_ID}}", data['motorista_caminhao_' + i] || '');
            }
            table.removeRow(templateRowIndex);
        } catch(err) {
            Logger.log("Erro ao processar tabela dinâmica de caminhões: " + err.toString());
            body.replaceText("{{Caminhao_ID}}", "Erro ao gerar lista de caminhões.");
            body.replaceText("{{Motorista_ID}}", "");
        }
    } else if (activity === "Colheita" && truckTableElement) {
        try {
            const rowElement = truckTableElement.getElement().getParent().getParent();
            if (rowElement.getType() === DocumentApp.ElementType.TABLE_ROW) {
                rowElement.removeFromParent();
            }
        } catch(err) {
            Logger.log("Erro ao remover linha de template de caminhões: " + err.toString());
        }
    }
    
    body.replaceText('\\{\\{.*?\\}\\}', '');

    doc.saveAndClose();

    const pdfBlob = tempDocFile.getAs('application/pdf');
    const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
    tempDocFile.setTrashed(true);
    
    const pdfUrl = finalPdfFile.getUrl();
    const folderUrl = pdfFolder.getUrl();

    return createJsonResponse({ success: true, message: "Dados registrados e PDF criado!", pdfUrl: pdfUrl, folderUrl: folderUrl });

  } catch (error) {
    Logger.log("Erro no servidor: " + error.toString() + " Stack: " + error.stack);
    return createJsonResponse({ success: false, message: "Ocorreu um erro no servidor: " + error.toString() });
  }
}


/**
 * ==================================================================
 * FUNÇÃO ADICIONADA PARA O APP DE RELATÓRIO DE OPERAÇÕES
 * Esta função é chamada pelo novo app para obter a lista de IDs de OS.
 * ==================================================================
 */
/**
 * ==================================================================
 * FUNÇÃO ATUALIZADA PARA O APP DE RELATÓRIO DE OPERAÇÕES
 * - Se receber o parâmetro 'activity', lista todas as IDs de OS da aba.
 * - Se receber 'activity' e 'osId', retorna todos os dados daquela OS.
 * ==================================================================
 */
function doGet(e) {
  try {
    const activity = e.parameter.activity;
    const osId = e.parameter.osId;

    if (!activity) {
      throw new Error("Parâmetro 'activity' não fornecido.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(activity);
    if (!sheet) {
      throw new Error("Aba '" + activity + "' não encontrada.");
    }

    // --- LÓGICA ATUALIZADA ---
    if (osId) {
      // Se uma osId foi fornecida, busca os detalhes daquela linha
      const data = sheet.getDataRange().getValues();
      const headers = data.shift(); // Pega a primeira linha (cabeçalhos) e remove do array de dados
      const idColumnIndex = headers.indexOf("ID da OS");

      if (idColumnIndex === -1) {
        throw new Error("Coluna 'ID da OS' não encontrada.");
      }

      const rowData = data.find(row => row[idColumnIndex] == osId);

      if (!rowData) {
        throw new Error("OS com ID '" + osId + "' não encontrada.");
      }

      // Cria um objeto combinando cabeçalhos e dados da linha
      const osDetails = {};
      headers.forEach((header, index) => {
        osDetails[header] = rowData[index];
      });
      
      return ContentService.createTextOutput(JSON.stringify(osDetails)).setMimeType(ContentService.MimeType.JSON);

    } else {
      // Se nenhuma osId foi fornecida, retorna a lista de todas as IDs (lógica anterior)
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      const idRange = sheet.getRange(2, 2, lastRow - 1, 1);
      const ids = idRange.getValues().flat().filter(String);
      return ContentService.createTextOutput(JSON.stringify(ids)).setMimeType(ContentService.MimeType.JSON);
    }

  } catch (error) {
    Logger.log(error.toString());
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}