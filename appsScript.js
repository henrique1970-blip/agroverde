/*
Este script vai na planilha do Google Sheets
menu Extensões -> Apps Script
*/

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = e.parameter;
  var activity = data.activity; // Nome da atividade será o nome da aba

  if (!activity) {
    return ContentService.createTextOutput("Erro: Atividade não especificada.").setMimeType(ContentService.MimeType.TEXT);
  }

  const userName = e.parameter.userName || 'Desconhecido';
  // --- ADICIONADO PARA ID DA OS ---
  const osId = e.parameter.osId || 'N/A';
  // --- FIM ADICIONADO ---

  var sheet;
  if (ss.getSheetByName(activity)) {
    sheet = ss.getSheetByName(activity);
  } else {
    // Se a aba não existe, cria e adiciona cabeçalhos
    sheet = ss.insertSheet(activity);
    var headers = [];

    // Define os cabeçalhos com base na atividade
    if (activity === "PreparodeArea") { // Sem espaços para nome da aba
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Maquina", "Operador(es)", "Implemento", "Observacao"]; // <-- ADICIONADO "ID da OS"
    } else if (activity === "TratamentodeSementes") {
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Cultura e Cultivar", "Quantidade de Sementes (Kg)", "Data de Inicio", "Data de Termino", "Produtos e Dosagens", "Maquina", "Operadores", "Observacao"]; // <-- ADICIONADO "ID da OS"
    } else if (activity === "Plantio") {
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Cultura e Cultivar", "Quantidade/ha - Maximo", "Quantidade/ha - Minimo", "Insumos a serem usados e quantidades", "Data de Inicio", "Data de Termino", "Trator - identificacao", "Implemento", "Plantas por metro", "Espacamento entre plantas", "Peso de mil sementes (PMS)", "Operador(es)", "Observacao"]; // <-- ADICIONADO "ID da OS"
    } else if (activity === "Pulverizacao") {
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Cultura e Cultivar", "Produto(s) e quantidade/ha", "Data de Inicio", "Data de Termino", "Maquina - Identificacao", "Bico", "Capacidade do tanque", "Vazao (L/ha)", "Operador(es)", "Pressao", "Dose/ha", "Dose/tanque", "Implemento - Identificacao", "Observacao"]; // <-- ADICIONADO "ID da OS"
    } else if (activity === "Colheita") {
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Cultura e Cultivar", "Produtividade estimada", "Data de Inicio", "Data de Termino", "Maquina - Identificacao", "Operador(es) Maquina", "Caminhao (caminhoes) - identificacao", "Motorista(s)", "Trator - marca modelo e numero", "Operador(es) Trator", "Implemento - Identificacao", "Observacao"]; // <-- ADICIONADO "ID da OS"
    } else if (activity === "Lancas") {
      headers = ["Timestamp", "ID da OS", "Nome do Usuário", "Local", "Talhoes (Area)", "Cultura e Cultivar", "Data de Inicio", "Data de Termino", "Quantidade de produto/hectare", "Maquina - Identificacao", "Operador(es)", "Implemento - Identificacao", "Observacao"]; // <-- ADICIONADO "ID da OS"
    }

    if (headers.length > 0) {
      sheet.appendRow(headers);
    }
  }

  // Define os dados da linha com base na atividade
  var rowData = [];
  var timestamp = new Date(); // Timestamp do lado do servidor

  // A ordem aqui deve corresponder à ordem dos cabeçalhos acima!
  if (activity === "PreparodeArea") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.maquina, data.operadores, data.implemento, data.observacao); // <-- ADICIONADO osId
  } else if (activity === "TratamentodeSementes") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.culturaCultivar, data.qtdSementesKg, data.dataInicio, data.dataTermino, data.produtosDosagens, data.maquina, data.operadores, data.observacao); // <-- ADICIONADO osId
  } else if (activity === "Plantio") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.culturaCultivar, data.qtdHaMax, data.qtdHaMin, data.insumos, data.dataInicio, data.dataTermino, data.trator, data.implemento, data.plantasPorMetro, data.espacamentoPlantas, data.pms, data.operadores, data.observacao); // <-- ADICIONADO osId
  } else if (activity === "Pulverizacao") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.culturaCultivar, data.produtosQtdHa, data.dataInicio, data.dataTermino, data.maquina, data.bico, data.capacidadeTanque, data.vazaoLHa, data.operadores, data.pressao, data.doseHa, data.doseTanque, data.implemento, data.observacao); // <-- ADICIONADO osId
  } else if (activity === "Colheita") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.culturaCultivar, data.produtividadeEstimada, data.dataInicio, data.dataTermino, data.maquina, data.operadoresMaquina, data.caminhao, data.motoristas, data.trator, data.operadoresTrator, data.implemento, data.observacao); // <-- ADICIONADO osId
  } else if (activity === "Lancas") {
    rowData.push(timestamp, osId, userName, data.local, data.talhoes, data.culturaCultivar, data.dataInicio, data.dataTermino, data.qtdProdutoHectare, data.maquina, data.operadores, data.implemento, data.observacao); // <-- ADICIONADO osId
  }

  // Adiciona a linha à planilha
  if (rowData.length > 0) {
    sheet.appendRow(rowData);
  }

  return ContentService.createTextOutput("Dados recebidos com sucesso!").setMimeType(ContentService.MimeType.TEXT);
}