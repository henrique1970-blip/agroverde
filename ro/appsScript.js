/*
* Este é o script do Google Apps Script para a PLANILHA DE RELATÓRIOS DE OPERAÇÕES.
* Ele é responsável por:
* 1. Receber os dados do formulário de Relatório de Operações (via doPost).
* 2. Gravar esses dados na planilha '1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8'.
* 3. Criar abas dinamicamente, se necessário.
* 4. Gerar PDFs de relatório para as operações.
* 5. Salvar os PDFs na pasta '1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI'.
* 6. Fornecer dados para a funcionalidade "Consulta Operação" de Irrigação (via doGet).
*/

const REPORT_SPREADSHEET_ID = "1b8LMyDTfkqIfl0bftvQNdpGRg0O1PRvNjrOV0LkEtf8";
const PDF_REPORT_FOLDER_ID = "1YeUqLtTnClJJ834KkqcO4Yy1_0SlzGAI";

// ATUALIZAÇÃO: Templates de Colheita e Irrigação adicionados
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
  "Irrigacao": "1HB7o9eiC3FpOw7VAfBrRdsN3sUOZqIYIGbKyHFi8wKs" // NOVO TEMPLATE
};

const COMMON_OS_HEADERS = [ "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Observacao", "OS Realizado - Observacao" ];
const TDS_COMMON_HEADERS = COMMON_OS_HEADERS.filter(h => !h.includes("Trator") && !h.includes("Implemento"));

// ATUALIZAÇÃO: Headers para Colheita e Irrigação adicionados
const REPORT_HEADERS_CONFIG = {
  "PreparodeArea": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...COMMON_OS_HEADERS, "OS Planejado - Cultura / Cultivar", "OS Realizado - Cultura / Cultivar", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "TratamentodeSementes": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...TDS_COMMON_HEADERS, "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Qtd Sementes (Kg)", "OS Realizado - Qtd Sementes (Kg)", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Maquina", "OS Realizado - Maquina" ],
  "Plantio": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Quantidade/ha - Máximo", "OS Realizado - Quantidade/ha - Máximo", "OS Planejado - Quantidade/ha - Mínimo", "OS Realizado - Quantidade/ha - Mínimo", "OS Planejado - Produtos e Dosagens", "OS Realizado - Produtos e Dosagens", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Plantas por metro", "OS Realizado - Plantas por metro", "OS Planejado - Espacamento entre plantas", "OS Realizado - Espacamento entre plantas", "OS Planejado - PMS", "OS Realizado - PMS", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "Pulverizacao": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtos e quantidades", "OS Realizado - Produtos e quantidades", "OS Planejado - Bico", "OS Realizado - Bico", "OS Planejado - Capacidade do tanque", "OS Realizado - Capacidade do tanque", "OS Planejado - Vazão (L/ha)", "OS Realizado - Vazão (L/ha)", "OS Planejado - Pressão", "OS Realizado - Pressão", "OS Planejado - Dose/ha", "OS Realizado - Dose/ha", "OS Planejado - Dose/tanque", "OS Realizado - Dose/tanque", "OS Planejado - Máquina (Pulverizador)", "OS Realizado - Máquina (Pulverizador)", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Operador(es)", "OS Realizado - Operador(es)", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos" ],
  "Colheita": ["Timestamp Relatorio", "ID da OS", "Nome do Usuario", "Relatorio - Equipamento", "OS Planejado - Local", "OS Realizado - Local", "OS Planejado - Talhoes (Area)", "OS Realizado - Talhoes (Area)", "OS Planejado - Área Total (ha)", "OS Realizado - Área Total (ha)", "OS Planejado - Data de Inicio", "OS Realizado - Data de Inicio", "OS Planejado - Data de Termino", "OS Realizado - Data de Termino", "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtividade estimada", "OS Realizado - Produtividade estimada", "OS Planejado - Colhedeira", "OS Realizado - Colhedeira", "OS Planejado - Operador(es) Colhedeira", "OS Realizado - Operador(es) Colhedeira", "OS Planejado - Trator", "OS Realizado - Trator", "OS Planejado - Operador(es) Trator", "OS Realizado - Operador(es) Trator", "OS Planejado - Implemento", "OS Realizado - Implemento", "OS Planejado - Caminhão 1", "OS Realizado - Caminhão 1", "OS Planejado - Motorista 1", "OS Realizado - Motorista 1", "OS Planejado - Caminhão 2", "OS Realizado - Caminhão 2", "OS Planejado - Motorista 2", "OS Realizado - Motorista 2", "OS Planejado - Observacao", "OS Realizado - Observacao", "Relatorio - Horimetro Colhedeira Inicio", "Relatorio - Horimetro Colhedeira Fim", "Relatorio - Paradas Colhedeira", "Relatorio - Abastecimentos Colhedeira", "Relatorio - Caminhao ID", "Relatorio - Motorista", "Relatorio - KM Inicio", "Relatorio - KM Fim", "Relatorio - Abastecimentos Caminhao", "Relatorio - Paradas Caminhao", "Relatorio - Horimetro Trator Inicio", "Relatorio - Horimetro Trator Fim", "Relatorio - Paradas Trator", "Relatorio - Abastecimentos Trator" ],
  "Lancas": [ "Timestamp Relatorio", "ID da OS", "Nome do Usuario", ...COMMON_OS_HEADERS, "OS Planejado - Cultura e Cultivar", "OS Realizado - Cultura e Cultivar", "OS Planejado - Produtos e quantidades", "OS Realizado - Produtos e quantidades","Relatorio - Horimetro Inicio", "Relatorio - Horimetro Fim", "Relatorio - Paradas Imprevistas", "Relatorio - Numero Abastecimentos"],
  "Irrigacao": [ "Timestamp Relatorio", "ID da Operacao", "Nome do Usuario", "Local", "Pivo", "Data de Inicio", "Hora de Inicio", "Data de Termino", "Hora de Termino", "Volta", "Intensidade", "Operador", "Numero de Paradas Imprevistas", "Observacao"] // NOVOS HEADERS
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
  if (!dateInput) return ' ';
  try {
    const date = parseDateForSheet(dateInput);
    return isNaN(date.getTime()) ? dateInput : Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (e) { return dateInput; }
}

function formatNumberForPdf(numInput) {
    if (numInput === null || numInput === undefined || numInput.toString().trim() === '') {
        return ' ';
    }
    try {
        const num = parseFloat(numInput.toString().replace(',', '.'));
        if (isNaN(num)) {
            return numInput;
        }
        return num.toFixed(2).replace('.', ',');
    } catch (e) {
        return numInput;
    }
}

function formatNumberForSheet(numInput) {
  if (numInput === null || numInput === undefined || numInput.toString().trim() === '') {
    return ''; 
  }
  return numInput.toString().replace('.', ',');
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Irrigacao");

    if (!sheet || sheet.getLastRow() < 2) {
      if (action === "getIrrigationIdsByLocation") {
        return createJsonResponse({ error: false, message: "Nenhuma operação de irrigação registrada até o momento.", data: [] });
      } else {
        return createJsonResponse({ error: true, message: "Planilha de Irrigação não encontrada ou vazia." });
      }
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const idColIndex = headers.indexOf("ID da Operacao");
    const localColIndex = headers.indexOf("Local");

    if (action === "getIrrigationIdsByLocation") {
      const location = e.parameter.location;
      if (!location) return createJsonResponse({ error: true, message: "Local não especificado." });

      const filteredIds = dataRange
        .filter(row => row[localColIndex] === location)
        .map(row => row[idColIndex])
        .filter((id, index, self) => self.indexOf(id) === index);

      if (filteredIds.length === 0) {
        return createJsonResponse({ error: false, message: `Nenhuma operação de irrigação registrada para ${location}.`, data: [] });
      }

      return createJsonResponse({ success: true, data: filteredIds });
    }

    if (action === "getIrrigationDataById") {
      const id = e.parameter.id;
      if (!id) return createJsonResponse({ error: true, message: "ID da Operação não especificado." });

      const rowData = dataRange.find(row => row[idColIndex] === id);
      if (!rowData) return createJsonResponse({ error: true, message: `Operação com ID ${id} não encontrada.` });
      
      const operationDetails = {};
      headers.forEach((header, index) => {
        operationDetails[header] = rowData[index];
      });

      return createJsonResponse({ success: true, data: operationDetails });
    }

    return createJsonResponse({ error: true, message: "Ação inválida." });

  } catch (error) {
    Logger.log("Erro no doGet: " + error.toString());
    return createJsonResponse({ error: true, message: "Erro no servidor: " + error.toString() });
  }
}

function doPost(e) {
  try {
    const data = e.parameter;
    Logger.log(JSON.stringify(data, null, 2));
    
    const activity = data.activity;
    
    if (activity === "Irrigacao") {
      return handleIrrigationPost(data);
    }
    
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
    
    let numAbastecimentos = 0;
    if (activity === "Colheita") {
        if(data.equipmentType === 'Colhedeira') numAbastecimentos = parseInt(data.NUMERO_ABASTECIMENTO_COLHEDEIRA || '0');
        if(data.equipmentType === 'Caminhao') numAbastecimentos = parseInt(data.NUMERO_ABASTECIMENTO_CAMINHAO || '0');
        if(data.equipmentType === 'Trator') numAbastecimentos = parseInt(data.NUMERO_ABASTECIMENTO_TRATOR || '0');
    } else {
        numAbastecimentos = parseInt(data.numAbastecimentos || '0');
    }

    if (numAbastecimentos > 0) {
        let dynamicHeaders = [];
        let prefix = "Relatorio - ";
        if(activity === "Colheita") {
            if(data.equipmentType === 'Colhedeira') prefix += 'Horimetro Abastecimento Colhedeira ';
            if(data.equipmentType === 'Caminhao') prefix += 'KM Abastecimento Caminhao ';
            if(data.equipmentType === 'Trator') prefix += 'Horimetro Abastecimento Trator ';
        } else {
            prefix += 'Horimetro Abastecimento ';
        }

        for (let i = 1; i <= numAbastecimentos; i++) {
            dynamicHeaders.push(prefix + i);
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
      "OS Planejado - Produtos e quantidades": data.produtosQuantidade,"OS Realizado - Produtos e quantidades": data.realizado_produtosQuantidade,
      "OS Planejado - Bico": data.Bico, "OS Realizado - Bico": data.realizado_Bico,
      "OS Planejado - Capacidade do tanque": formatNumberForSheet(data.Capacidadedotanque), "OS Realizado - Capacidade do tanque": formatNumberForSheet(data.realizado_Capacidadedotanque),
      "OS Planejado - Vazão (L/ha)": formatNumberForSheet(data.vazaoLHa), "OS Realizado - Vazão (L/ha)": formatNumberForSheet(data.realizado_vazaoLHa),
      "OS Planejado - Pressão": formatNumberForSheet(data.pressao), "OS Realizado - Pressão": formatNumberForSheet(data.realizado_pressao),
      "OS Planejado - Dose/ha": formatNumberForSheet(data.Doseha), "OS Realizado - Dose/ha": formatNumberForSheet(data.realizado_Doseha),
      "OS Planejado - Dose/tanque": formatNumberForSheet(data.Dosetanque), "OS Realizado - Dose/tanque": formatNumberForSheet(data.realizado_Dosetanque),
      "OS Planejado - Máquina (Pulverizador)": data.maquina,"OS Realizado - Máquina (Pulverizador)": data.realizado_maquina,
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

    if (numAbastecimentos > 0) {
        let horimetroKey, litrosKey, prefix;
        if(activity === "Colheita") {
            if(data.equipmentType === 'Colhedeira') { horimetroKey = 'horimetro_colhe_abast_'; litrosKey = 'combustivel_colhedeira_'; prefix = 'Horimetro Abastecimento Colhedeira '; }
            if(data.equipmentType === 'Caminhao') { horimetroKey = 'km_abastecimento_'; litrosKey = 'combustivel_caminhao_'; prefix = 'KM Abastecimento Caminhao '; }
            if(data.equipmentType === 'Trator') { horimetroKey = 'horimetro_trator_abast_'; litrosKey = 'combustivel_trator_'; prefix = 'Horimetro Abastecimento Trator '; }
        } else {
            horimetroKey = 'abastecimento_horimetro_'; litrosKey = 'abastecimento_litros_'; prefix = 'Horimetro Abastecimento ';
        }
        for (let i = 1; i <= numAbastecimentos; i++) {
            rowDataMap[`Relatorio - ${prefix}${i}`] = formatNumberForSheet(data[horimetroKey + i]);
            rowDataMap[`Relatorio - Litros Abastecimento ${i}`] = formatNumberForSheet(data[litrosKey + i]);
        }
    }
    
    const rowValues = headers.map(header => rowDataMap[header] !== undefined ? rowDataMap[header] : '');
    sheet.appendRow(rowValues);

    let templateId;
    if (activity === 'Colheita') {
        templateId = REPORT_TEMPLATE_IDS[activity] ? REPORT_TEMPLATE_IDS[activity][data.equipmentType] : null;
    } else {
        templateId = REPORT_TEMPLATE_IDS[activity];
    }
    
    if (!templateId) {
      return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
    }

    const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
    const templateFile = DriveApp.getFileById(templateId);
    let newFileName = `Relatorio - ${activity}`;
    if(activity === 'Colheita') newFileName += ` (${data.equipmentType})`;
    newFileName += ` - OS ${osId} - ${rowDataMap["OS Realizado - Local"] || 'local'} - ${formatDateForPdf(timestampReport)}`;

    const tempDocFile = templateFile.makeCopy(pdfFolder);
    const doc = DocumentApp.openById(tempDocFile.getId());
    const body = doc.getBody();

    var caminhaoRealizadoPdf = data.Caminhao_ID; 
    var motoristaRealizadoPdf = data.MOTORISTA_CAMINHAO; 

    if (activity === 'Colheita' && data.equipmentType === 'Caminhao') {
      if (data.Caminhao_ID === data.Caminhao1) {
        caminhaoRealizadoPdf = data.realizado_Caminhao1;
        motoristaRealizadoPdf = data.realizado_Motorista1;
      } else if (data.Caminhao_ID === data.Caminhao2) { 
        caminhaoRealizadoPdf = data.realizado_Caminhao2;
        motoristaRealizadoPdf = data.realizado_Motorista2;
      }
    }
    
    const placeholderMap = {
      '{{DATA_EMISSAO}}': formatDateForPdf(timestampReport), '{{USUARIO_REGISTRO}}': data.userName, '{{USUARIO_RELATORIO}}': data.userName, '{{DATA_RELATORIO}}': formatDateForPdf(timestampReport),
      '{{OBSERVACAO_OS_RELATORIO}}': data.observacao, '{{ID_OPERACAO}}': `${osId}-OP`, '{{OS_ID}}': osId,
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

    for (const placeholder in placeholderMap) {
      if (placeholderMap[placeholder] === null || placeholderMap[placeholder] === undefined || placeholderMap[placeholder] === '') {
        placeholderMap[placeholder] = ' ';
      }
      body.replaceText(placeholder, placeholderMap[placeholder]);
    }
    
    let templateRowText, horimetroKey, litrosKey;
    if (activity === 'Colheita') {
        if(data.equipmentType === 'Colhedeira') { templateRowText = "{{horimetro_colhe_abast}}"; horimetroKey = 'horimetro_colhe_abast_'; litrosKey = 'combustivel_colhedeira_'; }
        if(data.equipmentType === 'Caminhao') { templateRowText = "{{km_abastecimento}}"; horimetroKey = 'km_abastecimento_'; litrosKey = 'combustivel_caminhao_'; }
        if(data.equipmentType === 'Trator') { templateRowText = "{{horimetro_trator_abast}}"; horimetroKey = 'horimetro_trator_abast_'; litrosKey = 'combustivel_trator_'; }
    } else {
        templateRowText = "{{HorimetroAbastecimento}}"; horimetroKey = 'abastecimento_horimetro_'; litrosKey = 'abastecimento_litros_';
    }

    const abastecimentoTableElement = body.findText(templateRowText);
    if (numAbastecimentos > 0 && abastecimentoTableElement) {
        try {
            let element = abastecimentoTableElement.getElement();
            while (element.getParent().getType() !== DocumentApp.ElementType.TABLE_ROW) { element = element.getParent(); }
            const templateRow = element.getParent();
            const table = templateRow.getParent();
            const templateRowIndex = table.getChildIndex(templateRow);
            for (let i = 1; i <= numAbastecimentos; i++) {
                const newRow = table.insertTableRow(templateRowIndex + i, templateRow.copy());
                newRow.replaceText(templateRowText, formatNumberForPdf(data[horimetroKey + i]));
                
                let litrosPlaceholder = "{{LitrosAbastecimento}}"; // Padrão
                if(data.equipmentType === 'Colhedeira') litrosPlaceholder = "{{combustivel_colhedeira}}";
                else if(data.equipmentType === 'Caminhao') litrosPlaceholder = "{{combustivel_caminhao}}";
                else if(data.equipmentType === 'Trator') litrosPlaceholder = "{{combustivel_trator}}";

                newRow.replaceText(litrosPlaceholder, formatNumberForPdf(data[litrosKey + i]));
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

function handleIrrigationPost(data) {
  const activity = "Irrigacao";
  const ss = SpreadsheetApp.openById(REPORT_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(activity);
  const headers = REPORT_HEADERS_CONFIG[activity];

  if (!sheet) {
    sheet = ss.insertSheet(activity);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  if (data.isUpdate === 'true' && data.originalId) {
    const dataRange = sheet.getDataRange().getValues();
    const idColIndex = headers.indexOf("ID da Operacao");
    for (let i = dataRange.length - 1; i >= 1; i--) { 
      if (dataRange[i][idColIndex] == data.originalId) {
        sheet.deleteRow(i + 1);
        break; 
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

  const rowValues = headers.map(header => rowDataMap[header] !== undefined ? rowDataMap[header] : '');
  sheet.appendRow(rowValues);
  
  const templateId = REPORT_TEMPLATE_IDS[activity];
  if (!templateId) {
    return createJsonResponse({ success: true, message: "Dados registrados! Template PDF não configurado." });
  }

  const pdfFolder = DriveApp.getFolderById(PDF_REPORT_FOLDER_ID);
  const templateFile = DriveApp.getFileById(templateId);
  const newFileName = `Relatorio - ${activity} - ${data.operationId} - ${Utilities.formatDate(timestampReport, Session.getScriptTimeZone(), "dd-MM-yyyy")}`;

  const tempDocFile = templateFile.makeCopy(pdfFolder);
  const doc = DocumentApp.openById(tempDocFile.getId());
  const body = doc.getBody();

  const placeholderMap = {
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
    '{{INTENSIDADE}}': data.intensidade,
    '{{OPERADORES}}': data.operador,
    '{{PARADAS_IMPREVISTAS}}': data.paradas,
    '{{OBSERVACAO_OS_RELATORIO}}': data.observacao || ' '
  };

  for (const placeholder in placeholderMap) {
    body.replaceText(placeholder, placeholderMap[placeholder]);
  }

  doc.saveAndClose();
  const pdfBlob = tempDocFile.getAs('application/pdf');
  const finalPdfFile = pdfFolder.createFile(pdfBlob).setName(newFileName);
  tempDocFile.setTrashed(true);

  return createJsonResponse({ success: true, pdfUrl: finalPdfFile.getUrl(), folderUrl: pdfFolder.getUrl() });
}