// ATENÇÃO: Cole aqui a URL do App da Web da sua planilha de "Ordem de Serviço"
const osAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

// ATENÇÃO: COLE AQUI A URL DE IMPLANTAÇÃO DO SEU NOVO APPS SCRIPT DE RELATÓRIO
const reportAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbznEdqNDvPH34VOE6EQ510BUkk3s5NtZyN8KRMKaCns--qerlsupNlUaQdil1tPdK5R/exec';

let userName = '';
let selectedActivityKey = '';
let currentOsDetails = {};
let currentIrrigationData = { isUpdate: false, originalId: '' };


// CORREÇÃO: O mapa de chaves foi expandido para garantir que todos os cabeçalhos,
// especialmente aqueles com acentos ou variações, sejam padronizados corretamente antes do envio.
// Isso resolve a raiz dos problemas de campos em branco.
const keyMap = {
    // Genéricos que podem ter acento/variação
    'Observacao':                  'Observacao',
    'Observação':                  'Observacao',
    'Trator':                      'Trator',
    'Área Total (ha)':             'reaTotalha',
    'Data de Inicio':              'DatadeInicio',
    'Data de Término':             'DatadeTermino',
    'Talhões (Area)':              'TalhoesArea',
    'Operador(es)':                'Operadores',
    // Pulverização & Lanças
    'Produto(s) e quantidade/ha': 'produtosQuantidade',
    'Produtos e quantidade/ha':    'produtosQuantidade',
    'Produtos e quantidades':      'produtosQuantidade',
    'Quantidade de produto/hectare':    'produtosQuantidade', // <-- ADICIONADO PARA CORRIGIR "LANÇAS"
    'Vazao (L/ha)':                'vazaoLHa',
    'Vazão (L/ha)':                'vazaoLHa',
    'Vazao':                       'vazaoLHa',
    'Vazão':                       'vazaoLHa',
    'Pressao':                     'pressao',
    'Pressão':                     'pressao',
    'Maquina':                     'maquina',
    'Máquina':                     'maquina',
    'Máquina (Pulverizador)':      'maquina',
    // Colheita
    'Colhedeira':                  'Colhedeira',
    'Operador(es) Colhedeira':     'OperadoresColhedeira',
    'Operador(es) Trator':         'OperadoresTrator',
    'Implemento':                  'Implemento',
    'Caminhão 1':                  'Caminhao1',
    'Motorista 1':                 'Motorista1',
    'Caminhão 2':                  'Caminhao2',
    'Motorista 2':                 'Motorista2',
    'Produtividade estimada':      'ProdutividadeEstimada',
    // Tratamento de Sementes & Plantio
    'Cultura e Cultivar':          'CulturaeCultivar',
    'Cultura / Cultivar':          'CulturaCultivar',
    'Produtos e Dosagens':         'ProdutoseDosagens',
    'Qtd Sementes (Kg)':           'QtdSementesKg',
    'Quantidade/ha - Máximo':      'QtdhaMaximo',
    'Quantidade/ha - Mínimo':      'QtdhaMinimo',
    'Plantas por metro':           'Plantaspormetro',
    'Espacamento entre plantas':   'Espacamentoentreplantas',
    'Capacidade do tanque':        'Capacidadedotanque',
    'Dose/ha':                     'Doseha',
    'Dose/tanque':                 'Dosetanque'
};


// Bloco de funcionalidade offline
const DB_NAME = 'reportAgroDB';
const STORE_NAME = 'pendingReports';
const SYNC_TAG = 'sync-report-data';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

const ACTIVITIES = {
    "PreparodeArea": "Preparo de Área",
    "TratamentodeSementes": "Tratamento de Sementes",
    "Plantio": "Plantio",
    "Pulverizacao": "Pulverização",
    "Colheita": "Colheita",
    "Lancas": "Lanças",
    "Irrigacao": "Irrigação"
};


// Referências de elementos do DOM
const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const irrigationContainer = document.getElementById('irrigationContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const osIdRadioContainer = document.getElementById('osIdRadioContainer');
const operationIdDisplay = document.getElementById('operationIdDisplay');
const osDetailsContainer = document.getElementById('osDetailsContainer');
const harvestEquipmentSelectionContainer = document.getElementById('harvestEquipmentSelectionContainer');
const preparoAreaReportFieldsDiv = document.getElementById('preparoAreaReportFields');
const observacoesRelatorioContainer = document.getElementById('observacoesRelatorioContainer');
const submitReportButton = document.getElementById('submitReportButton');
const submitIrrigationReportButton = document.getElementById('submitIrrigationReportButton');
const activityTitleSpan = document.getElementById('activityTitle');
const currentUserSpan = document.getElementById('currentUser');
const irrigationChoiceContainer = document.getElementById('irrigationChoiceContainer');
const irrigationFormContainer = document.getElementById('irrigationFormContainer');
const backToActivitiesFromIrrigationBtn = document.getElementById('backToActivitiesFromIrrigation');
const backToIrrigationChoiceBtn = document.getElementById('backToIrrigationChoice');


function showScreen(screenId) {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'none';
    irrigationContainer.style.display = 'none';

    const screenToShow = document.getElementById(screenId);
    if (screenToShow) {
        screenToShow.style.display = (screenId === 'activitySelection') ? 'grid' : 'block';
    }
}

function showActivitySelection() {
    showScreen('activitySelection');
    osIdRadioContainer.innerHTML = '';
    osDetailsContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    harvestEquipmentSelectionContainer.innerHTML = '';
    submitReportButton.style.display = 'none';
}

function renderActivityButtons() {
    activitySelectionDiv.innerHTML = '';
    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.className = 'activity-button';
        button.textContent = ACTIVITIES[key];

        if (key === "Irrigacao") {
            button.style.gridColumn = "1 / -1";
            button.classList.add('orange-button');
        }

        button.addEventListener('click', () => {
            selectedActivityKey = key;
            if (key === "Irrigacao") {
                showScreen('irrigationContainer');
                showIrrigationChoice();
            } else {
                showScreen('formContainer');
                renderOsSelectionForm(key);
            }
        });
        activitySelectionDiv.appendChild(button);
    }
}

function showIrrigationChoice() {
    irrigationChoiceContainer.style.display = 'block';
    irrigationFormContainer.style.display = 'none';
    activityTitleSpan.textContent = "Irrigação";
    currentUserSpan.textContent = userName;

    irrigationChoiceContainer.innerHTML = `
        <h3>Irrigação</h3>
        <div class="activity-buttons">
            <button id="newIrrigationButton" class="activity-button orange-button">Nova Operação</button>
            <button id="queryIrrigationButton" class="activity-button">Consulta Operação</button>
        </div>
    `;

    document.getElementById('newIrrigationButton').addEventListener('click', handleNewIrrigationOp);
    document.getElementById('queryIrrigationButton').addEventListener('click', handleQueryIrrigationOp);
}

async function renderOsSelectionForm(activityKey) {
    showScreen('formContainer');
    activityTitleSpan.textContent = ACTIVITIES[activityKey];
    currentUserSpan.textContent = userName;
    osIdRadioContainer.innerHTML = `<p class="loading-message">Carregando Ordens de Serviço...</p>`;
    osDetailsContainer.innerHTML = '';
    harvestEquipmentSelectionContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    if (observacoesRelatorioContainer) observacoesRelatorioContainer.style.display = 'none';
    submitReportButton.style.display = 'none';

    try {
        const response = await fetch(`${osAppsScriptUrl}?activity=${activityKey}`);
        const osIds = await response.json();
        if (osIds.error) throw new Error(osIds.error);
        if (osIds.length === 0) {
            osIdRadioContainer.innerHTML = `<p class="error-message">Nenhuma OS encontrada para esta atividade.</p>`;
            return;
        }
        osIdRadioContainer.classList.add('vertical');
        osIdRadioContainer.innerHTML = osIds.map((id, index) => `
            <div class="radio-item">
                <input type="radio" id="os_${index}" name="osIdRadio" value="${id}">
                <label for="os_${index}">${id}</label>
            </div>`).join('');
        osIdRadioContainer.addEventListener('change', async (event) => {
            if (event.target.name === 'osIdRadio') {
                operationIdDisplay.textContent = `${event.target.value}-OP`;
                await fetchAndDisplayOsData(event.target.value);
            }
        });
    } catch (error) {
        osIdRadioContainer.innerHTML = `<p class="error-message">Erro ao carregar OS: ${error.message}</p>`;
    }
}

function formatClientDate(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return dateInput;
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function formatClientNumber(numInput) {
    if (numInput === null || numInput === undefined || numInput === '') return '';
    const num = parseFloat(String(numInput).replace(',', '.'));
    if (isNaN(num)) return numInput;
    return num.toFixed(1).replace('.', ',');
}

function renderHarvestEquipmentSelection() {
    harvestEquipmentSelectionContainer.innerHTML = `
        <label>Selecione o Equipamento do Relatório:</label>
        <div class="radio-group-container">
            <div class="radio-item">
                <input type="radio" id="equip_colhedeira" name="equipmentType" value="Colhedeira">
                <label for="equip_colhedeira">Colhedeira</label>
            </div>
            <div class="radio-item">
                <input type="radio" id="equip_caminhao" name="equipmentType" value="Caminhao">
                <label for="equip_caminhao">Caminhão</label>
            </div>
            <div class="radio-item">
                <input type="radio" id="equip_trator" name="equipmentType" value="Trator">
                <label for="equip_trator">Trator</label>
            </div>
        </div>
    `;
    harvestEquipmentSelectionContainer.addEventListener('change', (e) => {
        if (e.target.name === 'equipmentType') {
            renderHarvestReportFields(e.target.value);
        }
    });
}

async function fetchAndDisplayOsData(osId) {
    osDetailsContainer.innerHTML = `<p class="loading-message">Buscando detalhes da OS...</p>`;
    harvestEquipmentSelectionContainer.innerHTML = '';
    if(document.getElementById('observacoesRelatorio')) document.getElementById('observacoesRelatorio').value = '';

    try {
        const response = await fetch(`${osAppsScriptUrl}?activity=${selectedActivityKey}&osId=${encodeURIComponent(osId)}`);
        const osDetails = await response.json();
        if (osDetails.error) throw new Error(osDetails.error);
        currentOsDetails = osDetails;

        const fieldsToExclude = ["Timestamp", "Nome do Usuário", "ID da OS"];
        let tableHtml = `<div class="os-data-container"><h4>Confirme os dados da Operação:</h4><div class="os-data-grid"><div class="grid-header">Item</div><div class="grid-header">Dados da OS</div><div class="grid-header center">Sim</div><div class="grid-header center">Não</div><div class="grid-header" style="color: grey;">Realizado/Usado</div>`;
        const numericKeys = ["Área Total (ha)", "Capacidade do tanque", "Vazão (L/ha)", "Pressão", "Dose/ha", "Dose/tanque", "Vazão", "Pressao", "Vazao (L/ha)"];
        for (const key in osDetails) {
            if (fieldsToExclude.includes(key) || key.toLowerCase().includes('observa') || !osDetails[key]) continue;
            
            const cleanKey = keyMap[key] || key.replace(/[^a-zA-Z0-9]/g, '');
            let value = key.includes("Data") ? formatClientDate(osDetails[key]) : (numericKeys.includes(key) ? formatClientNumber(osDetails[key]) : osDetails[key]);
            
            tableHtml += `<div class="grid-item" data-label="Item"><strong>${key}</strong></div><div class="grid-item" data-label="Dados da OS">${value}</div><div class="grid-item center" data-label="Sim"><input type="radio" name="confirm_${cleanKey}" value="sim" checked></div><div class="grid-item center" data-label="Não"><input type="radio" name="confirm_${cleanKey}" value="nao"></div><div class="grid-item" data-label="Realizado/Usado"><input type="text" id="realizado_${cleanKey}" value="${value}" ${key.includes("Data") ? 'readonly' : ''} disabled></div>`;
        }
        const osObservacaoKey = Object.keys(osDetails).find(k => k.toLowerCase().includes('observa'));
        if (osObservacaoKey && osDetails[osObservacaoKey]) {
            tableHtml += `<div class="grid-item" style="grid-column: 1 / -1;"><strong>Observação da OS:</strong> ${osDetails[osObservacaoKey]}</div>`;
        }
        tableHtml += `</div></div>`;
        osDetailsContainer.innerHTML = tableHtml;

        osDetailsContainer.querySelector('.os-data-grid').addEventListener('change', (event) => {
            if (event.target.type === 'radio' && event.target.name.startsWith('confirm_')) {
                const cleanKey = event.target.name.replace('confirm_', '');
                document.getElementById(`realizado_${cleanKey}`).disabled = event.target.value !== 'nao';
            }
        });

        if (selectedActivityKey === "Colheita") {
            preparoAreaReportFieldsDiv.style.display = 'none';
            renderHarvestEquipmentSelection();
        } else if (["PreparodeArea", "Plantio", "Pulverizacao", "Lancas"].includes(selectedActivityKey)) {
            preparoAreaReportFieldsDiv.style.display = 'block';
            preparoAreaReportFieldsDiv.innerHTML = `<h3>Detalhes do Relatório</h3>
                <div class="form-line">
                    <label for="horimetroInicio">Horímetro Início da Operação:</label>
                    <input type="number" id="horimetroInicio" name="horimetroInicio" step="0.01" required>
                </div>
                <div class="form-line">
                    <label for="horimetroFim">Horímetro Fim da Operação:</label>
                    <input type="number" id="horimetroFim" name="horimetroFim" step="0.01" required>
                </div>
                <div class="form-line">
                    <label for="paradasImprevistas">Número de Paradas Imprevistas:</label>
                    <input type="number" id="paradasImprevistas" name="paradasImprevistas" min="0" value="0">
                </div>
                <div class="form-line">
                    <label for="numAbastecimentos">Número de Abastecimentos:</label>
                    <input type="number" id="numAbastecimentos" name="numAbastecimentos" min="0" value="0">
                </div>
                <button type="button" class="activity-button" id="addAbastecimentoFields">Adicionar/Atualizar Campos de Abastecimento</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>`;
                document.getElementById('addAbastecimentoFields').addEventListener('click', () => generateAbastecimentoFields(document.getElementById('numAbastecimentos').value, document.getElementById('abastecimentosContainer')));

        } else {
            preparoAreaReportFieldsDiv.style.display = 'none';
        }

        if (observacoesRelatorioContainer) {
            observacoesRelatorioContainer.style.display = 'block';
        }

        if (selectedActivityKey !== "Colheita") {
            submitReportButton.style.display = 'block';
        }

    } catch (error) {
        osDetailsContainer.innerHTML = `<p class="error-message">Erro ao buscar detalhes: ${error.message}</p>`;
    }
}

function renderHarvestReportFields(equipmentType) {
    preparoAreaReportFieldsDiv.style.display = 'block';
    preparoAreaReportFieldsDiv.innerHTML = `<h3>Detalhes do Relatório (${equipmentType})</h3>`;

    let fieldsHtml = '';

    switch (equipmentType) {
        case 'Colhedeira':
            fieldsHtml = `
                <div class="form-line">
                    <label>Colhedeira - Identificação:</label>
                    <input type="text" id="MAQUINA" value="${document.getElementById('realizado_Colhedeira').value || ''}" readonly>
                </div>
                <div class="form-line">
                    <label for="horimetro_colhe_inicio">Horímetro Início:</label>
                    <input type="number" id="horimetro_colhe_inicio" step="0.01" required>
                </div>
                <div class="form-line">
                    <label for="horimetro_colhe_fim">Horímetro Término:</label>
                    <input type="number" id="horimetro_colhe_fim" step="0.01" required>
                </div>
                 <div class="form-line">
                    <label>Operador(es) Colhedeira:</label>
                    <input type="text" id="OPERADORES_MAQUINA" value="${document.getElementById('realizado_OperadoresColhedeira').value || ''}">
                </div>
                <div class="form-line">
                    <label for="PARADAS_IMPREVISTAS_COLHEDEIRA">Paradas Imprevistas:</label>
                    <input type="number" id="PARADAS_IMPREVISTAS_COLHEDEIRA" min="0" value="0">
                </div>
                <div class="form-line">
                    <label for="NUMERO_ABASTECIMENTO_COLHEDEIRA">Nº de Abastecimentos:</label>
                    <input type="number" id="NUMERO_ABASTECIMENTO_COLHEDEIRA" min="0" value="0">
                </div>
                <button type="button" class="activity-button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>
            `;
            break;
        case 'Caminhao':
            let caminhaoOptions = '';
            const caminhao1Element = document.getElementById('realizado_Caminhao1');
            const caminhao2Element = document.getElementById('realizado_Caminhao2');

            if (caminhao1Element && caminhao1Element.value) {
                caminhaoOptions += `<option value="1">${caminhao1Element.value}</option>`;
            }
            if (caminhao2Element && caminhao2Element.value) {
                caminhaoOptions += `<option value="2">${caminhao2Element.value}</option>`;
            }

            fieldsHtml = `
                <div class="form-line">
                    <label for="Caminhao_ID_Select">Caminhão - Identificação:</label>
                    <select id="Caminhao_ID_Select">${caminhaoOptions}</select>
                </div>
                <div class="form-line">
                    <label>Motorista:</label>
                    <input type="text" id="MOTORISTA_CAMINHAO" readonly>
                </div>
                <div class="form-line">
                    <label for="km_inicio">Quilometragem Início:</label>
                    <input type="number" id="km_inicio" step="0.1" required>
                </div>
                <div class="form-line">
                    <label for="km_fim">Quilometragem Término:</label>
                    <input type="number" id="km_fim" step="0.1" required>
                </div>
                <div class="form-line">
                    <label for="PARADAS_IMPREVISTAS_CAMINHAO">Paradas Imprevistas:</label>
                    <input type="number" id="PARADAS_IMPREVISTAS_CAMINHAO" min="0" value="0">
                </div>
                <div class="form-line">
                    <label for="NUMERO_ABASTECIMENTO_CAMINHAO">Nº de Abastecimentos:</label>
                    <input type="number" id="NUMERO_ABASTECIMENTO_CAMINHAO" min="0" value="0">
                </div>
                <button type="button" class="activity-button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>
            `;
            break;
        case 'Trator':
            fieldsHtml = `
                <div class="form-line">
                    <label>Trator - Identificação:</label>
                    <input type="text" id="TRATOR" value="${document.getElementById('realizado_Trator').value || ''}" readonly>
                </div>
                 <div class="form-line">
                    <label for="horimetro_trator_inicio">Horímetro Início:</label>
                    <input type="number" id="horimetro_trator_inicio" step="0.01" required>
                </div>
                <div class="form-line">
                    <label for="horimetro_trator_fim">Horímetro Término:</label>
                    <input type="number" id="horimetro_trator_fim" step="0.01" required>
                </div>
                <div class="form-line">
                    <label>Operador(es):</label>
                    <input type="text" id="OPERADORES" value="${document.getElementById('realizado_OperadoresTrator').value || ''}">
                </div>
                <div class="form-line">
                    <label>Implemento - Identificação:</label>
                    <input type="text" id="IMPLEMENTO" value="${document.getElementById('realizado_Implemento').value || ''}" readonly>
                </div>
                <div class="form-line">
                    <label for="PARADAS_IMPREVISTAS_TRATOR">Paradas Imprevistas:</label>
                    <input type="number" id="PARADAS_IMPREVISTAS_TRATOR" min="0" value="0">
                </div>
                <div class="form-line">
                    <label for="NUMERO_ABASTECIMENTO_TRATOR">Nº de Abastecimentos:</label>
                    <input type="number" id="NUMERO_ABASTECIMENTO_TRATOR" min="0" value="0">
                </div>
                <button type="button" class="activity-button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>
            `;
            break;
    }

    preparoAreaReportFieldsDiv.innerHTML += fieldsHtml;

    const addAbastecimentoBtn = preparoAreaReportFieldsDiv.querySelector('#addAbastecimentoFields');
    if(addAbastecimentoBtn) {
        addAbastecimentoBtn.addEventListener('click', () => {
            const numInput = preparoAreaReportFieldsDiv.querySelector('input[id^="NUMERO_ABASTECIMENTO"]');
            const container = preparoAreaReportFieldsDiv.querySelector('#abastecimentosContainer');
            generateHarvestAbastecimentoFields(equipmentType, numInput.value, container);
        });
    }

    if (equipmentType === 'Caminhao') {
        const select = document.getElementById('Caminhao_ID_Select');
        const motoristaInput = document.getElementById('MOTORISTA_CAMINHAO');
        const updateMotorista = () => {
            if (select.value) {
                const selectedIndex = select.value;
                const motoristaElement = document.getElementById(`realizado_Motorista${selectedIndex}`);
                motoristaInput.value = motoristaElement ? motoristaElement.value : '';
            }
        };
        select.addEventListener('change', updateMotorista);
        updateMotorista();
    }

    if (observacoesRelatorioContainer) observacoesRelatorioContainer.style.display = 'block';
    submitReportButton.style.display = 'block';
}


function generateHarvestAbastecimentoFields(equipmentType, numFields, container) {
    numFields = parseInt(numFields, 10) || 0;
    if (numFields > 10) {
        alert("Máximo de 10 abastecimentos permitidos.");
        numFields = 10;
        document.querySelector(`input[id^="NUMERO_ABASTECIMENTO"]`).value = 10;
    }
    if (numFields === 0) {
        container.innerHTML = '';
        return;
    }
    
    let header1, header2, id1, id2;
    if (equipmentType === 'Caminhao') {
        header1 = 'Quilometragem (km)';
        header2 = 'Litros (L)';
        id1 = 'km_abastecimento';
        id2 = 'combustivel_caminhao';
    } else {
        header1 = 'Horímetro (h)';
        header2 = 'Litros (L)';
        id1 = (equipmentType === 'Colhedeira') ? 'horimetro_colhe_abast' : 'horimetro_trator_abast';
        id2 = (equipmentType === 'Colhedeira') ? 'combustivel_colhedeira' : 'combustivel_trator';
    }

    let tableHtml = `<table class="abastecimentos-table"><thead><tr><th>Abastecimento</th><th>${header1}</th><th>${header2}</th></tr></thead><tbody>`;
    for (let i = 1; i <= numFields; i++) {
        tableHtml += `<tr><td>${i}</td>
            <td><input type="number" id="${id1}_${i}" step="0.01"></td>
            <td><input type="number" id="${id2}_${i}" step="0.01"></td>
        </tr>`;
    }
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}


function generateAbastecimentoFields(numFields, container) {
    numFields = parseInt(numFields);
    if (isNaN(numFields) || numFields < 0) numFields = 0;
    if (numFields > 10) {
        alert("Máximo de 10 abastecimentos permitidos.");
        numFields = 10;
        document.getElementById('numAbastecimentos').value = 10;
    }
    if (numFields === 0) {
        container.innerHTML = '';
        return;
    }
    let tableHtml = `<table class="abastecimentos-table"><thead><tr><th>Abastecimento</th><th>Horímetro (h)</th><th>Litros (L)</th></tr></thead><tbody>`;
    for (let i = 1; i <= numFields; i++) {
        tableHtml += `<tr><td>${i}</td><td><input type="number" id="abastecimento_horimetro_${i}" name="abastecimento_horimetro_${i}" step="0.01"></td><td><input type="number" id="abastecimento_litros_${i}" name="abastecimento_litros_${i}" step="0.01"></td></tr>`;
    }
    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

function sanitizeNumericInput(value) {
    if (typeof value === 'string') {
        return value.replace(',', '.');
    }
    return value;
}

async function submitReport() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const currentSubmitButton = (selectedActivityKey === 'Irrigacao') ? submitIrrigationReportButton : submitReportButton;

    // --- INÍCIO DO BLOCO DE VALIDAÇÃO ---
    let isValid = true;
    const formToValidate = (selectedActivityKey === 'Irrigacao') ?
        document.getElementById('irrigationForm') :
        formContainerDiv;

    const requiredInputs = formToValidate.querySelectorAll('[required]');

    for (const input of requiredInputs) {
        input.setCustomValidity('');
        if (!input.value.trim()) {
            input.setCustomValidity('Este campo é obrigatório.');
            input.reportValidity();
            isValid = false;
            break;
        }
    }

    if (!isValid) return;

    if (selectedActivityKey === "Colheita") {
        const equipmentType = document.querySelector('input[name="equipmentType"]:checked')?.value;
        if (!equipmentType) {
            alert('Por favor, selecione o tipo de equipamento para o relatório de colheita.');
            return;
        }

        let numAbastecimentos = 0;
        let horimetroInicio, horimetroFim, kmInicio, kmFim;

        switch (equipmentType) {
            case 'Colhedeira':
                horimetroInicio = parseFloat(sanitizeNumericInput(document.getElementById('horimetro_colhe_inicio').value));
                horimetroFim = parseFloat(sanitizeNumericInput(document.getElementById('horimetro_colhe_fim').value));
                if (horimetroFim <= horimetroInicio) {
                    alert('O horímetro final deve ser maior que o inicial.');
                    return;
                }
                numAbastecimentos = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_COLHEDEIRA').value, 10) || 0;
                for (let i = 1; i <= numAbastecimentos; i++) {
                    if (!document.getElementById(`horimetro_colhe_abast_${i}`).value || !document.getElementById(`combustivel_colhedeira_${i}`).value) {
                         alert(`Por favor, preencha os dados do abastecimento ${i}.`); return;
                    }
                }
                break;
            case 'Caminhao':
                kmInicio = parseFloat(sanitizeNumericInput(document.getElementById('km_inicio').value));
                kmFim = parseFloat(sanitizeNumericInput(document.getElementById('km_fim').value));
                 if (kmFim <= kmInicio) {
                    alert('A quilometragem final deve ser maior que a inicial.');
                    return;
                }
                numAbastecimentos = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_CAMINHAO').value, 10) || 0;
                 for (let i = 1; i <= numAbastecimentos; i++) {
                    if (!document.getElementById(`km_abastecimento_${i}`).value || !document.getElementById(`combustivel_caminhao_${i}`).value) {
                         alert(`Por favor, preencha os dados do abastecimento ${i}.`); return;
                    }
                }
                break;
            case 'Trator':
                horimetroInicio = parseFloat(sanitizeNumericInput(document.getElementById('horimetro_trator_inicio').value));
                horimetroFim = parseFloat(sanitizeNumericInput(document.getElementById('horimetro_trator_fim').value));
                 if (horimetroFim <= horimetroInicio) {
                    alert('O horímetro final deve ser maior que o inicial.');
                    return;
                }
                 numAbastecimentos = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_TRATOR').value, 10) || 0;
                 for (let i = 1; i <= numAbastecimentos; i++) {
                    if (!document.getElementById(`horimetro_trator_abast_${i}`).value || !document.getElementById(`combustivel_trator_${i}`).value) {
                         alert(`Por favor, preencha os dados do abastecimento ${i}.`); return;
                    }
                }
                break;
        }

    } else if (["PreparodeArea", "Plantio", "Pulverizacao", "Lancas"].includes(selectedActivityKey)) {
        const horimetroInicio = parseFloat(sanitizeNumericInput(document.getElementById('horimetroInicio').value));
        const horimetroFim = parseFloat(sanitizeNumericInput(document.getElementById('horimetroFim').value));
        if (horimetroFim <= horimetroInicio) {
            alert('O horímetro final deve ser maior que o inicial.');
            return;
        }
        const numAbastecimentos = parseInt(document.getElementById('numAbastecimentos').value, 10) || 0;
         for (let i = 1; i <= numAbastecimentos; i++) {
            if (!document.getElementById(`abastecimento_horimetro_${i}`).value || !document.getElementById(`abastecimento_litros_${i}`).value) {
                 alert(`Por favor, preencha os dados do abastecimento ${i}.`); return;
            }
         }
    }
    // --- FIM DO BLOCO DE VALIDAÇÃO ---


    const reportData = {
        activity: selectedActivityKey,
        userName: userName,
    };
    
    // Coleta de dados específica por atividade
    if (selectedActivityKey === 'Irrigacao') {
        const intensidadeInput = document.getElementById('irrigation_intensidade');
        const voltaInput = document.querySelector('input[name="irrigation_volta"]:checked');

        Object.assign(reportData, {
            operationId: document.getElementById('irrigationOperationIdDisplay').textContent,
            local: document.getElementById('irrigation_local').value,
            pivo: document.getElementById('irrigation_pivo').value,
            dataInicio: document.getElementById('irrigation_data_inicio').value,
            horaInicio: document.getElementById('irrigation_hora_inicio').value,
            dataTermino: document.getElementById('irrigation_data_termino').value,
            horaTermino: document.getElementById('irrigation_hora_termino').value,
            volta: voltaInput ? voltaInput.value : '',
            // CORREÇÃO: Envia apenas o número, o backend adicionará o '%' para o PDF
            intensidade: intensidadeInput ? intensidadeInput.value : '',
            operador: document.getElementById('irrigation_operador').value,
            paradas: document.getElementById('irrigation_paradas').value,
            observacao: document.getElementById('irrigation_observacao').value,
            isUpdate: currentIrrigationData.isUpdate,
            originalId: currentIrrigationData.originalId
        });
    } else {
        reportData.osId = currentOsDetails['ID da OS'];
        for (const key in currentOsDetails) {
            if (["Timestamp", "Nome do Usuário", "ID da OS"].includes(key)) continue;
            const cleanKey = keyMap[key] || key.replace(/[^a-zA-Z0-9]/g, '');
            const realizadoInput = document.getElementById(`realizado_${cleanKey}`);
            
            reportData[cleanKey] = currentOsDetails[key];
            if (realizadoInput) {
                reportData[`realizado_${cleanKey}`] = realizadoInput.disabled ? currentOsDetails[key] : realizadoInput.value;
            } else if(key.toLowerCase().includes('observa')) {
                reportData[cleanKey] = currentOsDetails[key];
            }
        }
        // CORREÇÃO: Esta linha foi movida para dentro do 'else' para não sobrescrever a observação da irrigação
        reportData.observacao = document.getElementById('observacoesRelatorio')?.value || '';
    }

    if (selectedActivityKey === "Colheita") {
        const equipmentType = document.querySelector('input[name="equipmentType"]:checked').value;
        reportData.equipmentType = equipmentType;

        switch (equipmentType) {
            case 'Colhedeira':
                reportData.horimetro_colhe_inicio = sanitizeNumericInput(document.getElementById('horimetro_colhe_inicio').value);
                reportData.horimetro_colhe_fim = sanitizeNumericInput(document.getElementById('horimetro_colhe_fim').value);
                reportData.OPERADORES_MAQUINA = document.getElementById('OPERADORES_MAQUINA').value;
                reportData.PARADAS_IMPREVISTAS_COLHEDEIRA = sanitizeNumericInput(document.getElementById('PARADAS_IMPREVISTAS_COLHEDEIRA').value);
                const numAbastColhedeira = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_COLHEDEIRA').value, 10) || 0;
                reportData.NUMERO_ABASTECIMENTO_COLHEDEIRA = numAbastColhedeira;
                for (let i = 1; i <= numAbastColhedeira; i++) {
                    reportData[`horimetro_colhe_abast_${i}`] = sanitizeNumericInput(document.getElementById(`horimetro_colhe_abast_${i}`).value);
                    reportData[`combustivel_colhedeira_${i}`] = sanitizeNumericInput(document.getElementById(`combustivel_colhedeira_${i}`).value);
                }
                break;
            case 'Caminhao':
                const select = document.getElementById('Caminhao_ID_Select');
                reportData.Caminhao_ID = select.options[select.selectedIndex].text;
                reportData.MOTORISTA_CAMINHAO = document.getElementById('MOTORISTA_CAMINHAO').value;
                reportData.km_inicio = sanitizeNumericInput(document.getElementById('km_inicio').value);
                reportData.km_fim = sanitizeNumericInput(document.getElementById('km_fim').value);
                reportData.PARADAS_IMPREVISTAS_CAMINHAO = document.getElementById('PARADAS_IMPREVISTAS_CAMINHAO').value;
                const numAbastCaminhao = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_CAMINHAO').value, 10) || 0;
                reportData.NUMERO_ABASTECIMENTO_CAMINHAO = numAbastCaminhao;
                for (let i = 1; i <= numAbastCaminhao; i++) {
                    reportData[`km_abastecimento_${i}`] = sanitizeNumericInput(document.getElementById(`km_abastecimento_${i}`).value);
                    reportData[`combustivel_caminhao_${i}`] = sanitizeNumericInput(document.getElementById(`combustivel_caminhao_${i}`).value);
                }
                break;
            case 'Trator':
                reportData.horimetro_trator_inicio = sanitizeNumericInput(document.getElementById('horimetro_trator_inicio').value);
                reportData.horimetro_trator_fim = sanitizeNumericInput(document.getElementById('horimetro_trator_fim').value);
                reportData.OPERADORES = document.getElementById('OPERADORES').value;
                reportData.PARADAS_IMPREVISTAS_TRATOR = sanitizeNumericInput(document.getElementById('PARADAS_IMPREVISTAS_TRATOR').value);
                const numAbastTrator = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_TRATOR').value, 10) || 0;
                reportData.NUMERO_ABASTECIMENTO_TRATOR = numAbastTrator;
                 for (let i = 1; i <= numAbastTrator; i++) {
                    reportData[`horimetro_trator_abast_${i}`] = sanitizeNumericInput(document.getElementById(`horimetro_trator_abast_${i}`).value);
                    reportData[`combustivel_trator_${i}`] = sanitizeNumericInput(document.getElementById(`combustivel_trator_${i}`).value);
                }
                break;
        }

    } else if (["PreparodeArea", "Plantio", "Pulverizacao", "Lancas"].includes(selectedActivityKey)) {
        reportData.horimetroInicio = sanitizeNumericInput(document.getElementById('horimetroInicio').value);
        reportData.horimetroFim = sanitizeNumericInput(document.getElementById('horimetroFim').value);
        reportData.paradasImprevistas = sanitizeNumericInput(document.getElementById('paradasImprevistas').value);
        const numAbastecimentos = parseInt(document.getElementById('numAbastecimentos').value, 10) || 0;
        reportData.numAbastecimentos = numAbastecimentos;
        if (numAbastecimentos > 0) {
            for (let i = 1; i <= numAbastecimentos; i++) {
                reportData[`abastecimento_horimetro_${i}`] = sanitizeNumericInput(document.getElementById(`abastecimento_horimetro_${i}`).value);
                reportData[`abastecimento_litros_${i}`] = sanitizeNumericInput(document.getElementById(`abastecimento_litros_${i}`).value);
            }
        }
    }
    
    loadingOverlay.style.display = 'flex';
    currentSubmitButton.disabled = true;

    try {
        const response = await fetch(reportAppsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(reportData).toString()
        });
        const result = await response.json();
        if (result.success && result.pdfUrl) {
            showSuccessModal(result.pdfUrl, result.folderUrl);
        } else {
            throw new Error(result.message || 'Erro desconhecido ao enviar.');
        }
    } catch (error) {
        console.warn('Falha ao enviar. Salvando relatório offline.', error);
        await saveReportOffline(reportData);
    } finally {
        loadingOverlay.style.display = 'none';
        currentSubmitButton.disabled = false;
    }
}


function showSuccessModal(pdfUrl, folderUrl) {
    const modal = document.getElementById('successModal');
    modal.style.display = 'flex';
    document.getElementById('pdfLink').href = pdfUrl;
    document.getElementById('folderLink').href = folderUrl;
    modal.querySelector('.close-button').onclick = () => {
        modal.style.display = 'none';
        showActivitySelection();
    };
}

async function saveReportOffline(reportData) {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).add(reportData);
        await tx.done;
        alert('Você está offline. O relatório foi salvo e será enviado quando houver conexão.');
        showActivitySelection();
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then(sw => sw.sync.register(SYNC_TAG));
        }
    } catch (dbError) {
        alert('Erro: Não foi possível salvar o relatório para envio posterior.');
    }
}

function initializeApp() {
    const nameModal = document.getElementById('nameModal');
    if (nameModal) nameModal.style.display = 'none';
    currentUserSpan.textContent = userName;
    renderActivityButtons();
    showActivitySelection();
}

function getOrSetUserName() {
    userName = localStorage.getItem("userName");
    if (!userName || userName.trim() === "") {
        document.getElementById('nameModal').style.display = 'flex';
    } else {
        initializeApp();
    }
}


function createAndShowIrrigationForm(isQuery = false, data = {}) {
    irrigationChoiceContainer.style.display = 'none';
    irrigationFormContainer.style.display = 'block';
    
    currentIrrigationData = { isUpdate: isQuery, originalId: data['ID da Operacao'] || '' };

    const pivos = {
        Sede: ['Pivo 15', 'Pivo 33', 'Pivo 60', 'Pivo 80'],
        Wieke: ['Pivo 17/19', 'Pivo 45'],
        Kakay: ['Pivo 100', 'Pivo 103', 'Pivo 135', 'Pivo 180']
    };

    const irrigationTitle = document.getElementById('irrigationTitle');
    const irrigationCurrentUser = document.getElementById('irrigationCurrentUser');
    const irrigationOperationIdDisplay = document.getElementById('irrigationOperationIdDisplay');
    const irrigationForm = document.getElementById('irrigationForm');
    
    irrigationTitle.textContent = isQuery ? 'Consulta/Edição de Irrigação' : 'Nova Operação de Irrigação';
    irrigationCurrentUser.textContent = userName;
    irrigationOperationIdDisplay.textContent = data['ID da Operacao'] || '';
    
    const formHtml = `
            <div class="form-line">
                <label for="irrigation_local">Local:</label>
                <select id="irrigation_local" required ${isQuery ? 'disabled' : ''}>
                    <option value="">Selecione...</option>
                    <option value="Sede" ${data.Local === 'Sede' ? 'selected' : ''}>Sede</option>
                    <option value="Wieke" ${data.Local === 'Wieke' ? 'selected' : ''}>Wieke</option>
                    <option value="Kakay" ${data.Local === 'Kakay' ? 'selected' : ''}>Kakay</option>
                </select>
            </div>
            <div class="form-line">
                <label for="irrigation_pivo">Pivô:</label>
                <select id="irrigation_pivo" required></select>
            </div>
             <div class="form-grid"> <div class="form-line">
                    <label for="irrigation_data_inicio">Data de Início:</label>
                    <input type="date" id="irrigation_data_inicio" value="${data['Data de Inicio'] ? new Date(data['Data de Inicio']).toISOString().split('T')[0] : ''}" required>
                </div>
                <div class="form-line">
                    <label for="irrigation_hora_inicio">Hora de Início:</label>
                    <input type="time" id="irrigation_hora_inicio" value="${data['Hora de Inicio'] || ''}" required>
                </div>
                <div class="form-line">
                    <label for="irrigation_data_termino">Data de Término:</label>
                    <input type="date" id="irrigation_data_termino" value="${data['Data de Termino'] ? new Date(data['Data de Termino']).toISOString().split('T')[0] : ''}">
                </div>
                <div class="form-line">
                    <label for="irrigation_hora_termino">Hora de Término:</label>
                    <input type="time" id="irrigation_hora_termino" value="${data['Hora de Termino'] || ''}">
                </div>
            </div>
             <div class="form-line-column">
                <label>Volta:</label>
                <div class="radio-group-container vertical">
                    ${['completa', 'quase completa', 'Metade', 'Menos da metade'].map(v => `
                        <div class="radio-item"><input type="radio" id="volta_${v.replace(/\s+/g, '')}" name="irrigation_volta" value="${v}" ${data.Volta === v ? 'checked' : ''}><label for="volta_${v.replace(/\s+/g, '')}">${v.charAt(0).toUpperCase() + v.slice(1)}</label></div>
                    `).join('')}
                </div>
            </div>
            <div class="form-line">
                <label for="irrigation_intensidade">Intensidade (%):</label>
                <input type="number" id="irrigation_intensidade" min="0" max="100" value="${data.Intensidade ? parseInt(data.Intensidade) : ''}" required>
            </div>
            <div class="form-line">
                <label for="irrigation_operador">Operador:</label>
                <input type="text" id="irrigation_operador" value="${data.Operador || userName}" required>
            </div>
            <div class="form-line">
                <label for="irrigation_paradas">Nº de Paradas Imprevistas:</label>
                <input type="number" id="irrigation_paradas" min="0" value="${data['Numero de Paradas Imprevistas'] || '0'}">
            </div>
            <div class="form-line full-width-label">
                <label for="irrigation_observacao">Observação:</label>
                <textarea id="irrigation_observacao" rows="3">${data.Observacao || ''}</textarea>
            </div>
    `;
    if (irrigationForm) irrigationForm.reset();
    irrigationForm.innerHTML = formHtml;
    
    submitIrrigationReportButton.style.display = 'block';

    const localSelect = document.getElementById('irrigation_local');
    const pivoSelect = document.getElementById('irrigation_pivo');
    const dataInicioInput = document.getElementById('irrigation_data_inicio');
    const opIdDisplay = document.getElementById('irrigationOperationIdDisplay');

    function updatePivos() {
        pivoSelect.innerHTML = '<option value="">Selecione...</option>';
        const selectedLocal = localSelect.value;
        if (pivos[selectedLocal]) {
            pivos[selectedLocal].forEach(pivo => {
                const isSelected = pivo === data.Pivo;
                pivoSelect.innerHTML += `<option value="${pivo}" ${isSelected ? 'selected' : ''}>${pivo}</option>`;
            });
        }
        updateOperationId();
    }
    
    function updateOperationId() {
        const local = localSelect.value;
        const pivo = pivoSelect.value.replace(/\D/g, '');
        const dataInicio = dataInicioInput.value;
        if (local && pivo && dataInicio && !isQuery) {
            const date = new Date(dataInicio);
            const d = String(date.getUTCDate()).padStart(2, '0');
            const m = String(date.getUTCMonth() + 1).padStart(2, '0');
            const a = String(date.getUTCFullYear()).slice(-2);
            opIdDisplay.textContent = `${local}${pivo}${d}${m}${a}`;
        }
    }
    
    localSelect.addEventListener('change', updatePivos);
    pivoSelect.addEventListener('change', updateOperationId);
    dataInicioInput.addEventListener('change', updateOperationId);

    updatePivos();
}

function handleNewIrrigationOp() {
    createAndShowIrrigationForm(false);
}

function handleQueryIrrigationOp() {
    irrigationChoiceContainer.style.display = 'none';
    irrigationFormContainer.style.display = 'block';
    submitIrrigationReportButton.style.display = 'none';

    document.getElementById('irrigationTitle').textContent = "Consulta de Irrigação";
    document.getElementById('irrigationCurrentUser').textContent = userName;
    document.getElementById('irrigationOperationIdDisplay').textContent = '';
    document.getElementById('irrigationForm').innerHTML = `
        <div class="form-line">
            <label for="query_local">Local:</label>
            <select id="query_local">
                <option value="">Selecione o local para consulta...</option>
                <option value="Sede">Sede</option>
                <option value="Wieke">Wieke</option>
                <option value="Kakay">Kakay</option>
            </select>
        </div>
        <div id="query_results_container"></div>
    `;
    
    document.getElementById('query_local').addEventListener('change', async (e) => {
        const location = e.target.value;
        const resultsContainer = document.getElementById('query_results_container');
        if (!location) {
            resultsContainer.innerHTML = '';
            return;
        }
        resultsContainer.innerHTML = `<p class="loading-message">Buscando operações...</p>`;
        
        try {
            const response = await fetch(`${reportAppsScriptUrl}?action=getIrrigationIdsByLocation&location=${location}`);
            const result = await response.json();

            if (result.error) throw new Error(result.message);
            if (result.data.length === 0) {
                 resultsContainer.innerHTML = `<p class="info-message">${result.message}</p>`;
                 return;
            }

            resultsContainer.innerHTML = `
                <div class="form-line">
                    <label for="query_id_select">ID da Operação:</label>
                    <select id="query_id_select">
                        <option value="">Selecione a operação...</option>
                        ${result.data.map(id => `<option value="${id}">${id}</option>`).join('')}
                    </select>
                </div>
                <button type="button" class="activity-button" id="editOpBtn" disabled>Habilitar Edição</button>
            `;

            const idSelect = document.getElementById('query_id_select');
            const editBtn = document.getElementById('editOpBtn');
            idSelect.onchange = () => { editBtn.disabled = !idSelect.value; };
            editBtn.onclick = async () => {
                const opId = idSelect.value;
                document.getElementById('irrigationForm').innerHTML = `<p class="loading-message">Carregando dados da operação...</p>`;
                try {
                    const dataResponse = await fetch(`${reportAppsScriptUrl}?action=getIrrigationDataById&id=${opId}`);
                    const dataResult = await dataResponse.json();
                    if(dataResult.error) throw new Error(dataResult.message);
                    createAndShowIrrigationForm(true, dataResult.data);
                } catch(err) {
                     document.getElementById('irrigationForm').innerHTML = `<p class="error-message">Erro ao carregar dados: ${err.message}</p>`;
                }
            };
        } catch(err) {
            resultsContainer.innerHTML = `<p class="error-message">Erro: ${err.message}</p>`;
        }
    });
}


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nameForm').addEventListener('submit', (event) => {
        event.preventDefault();
        const inputName = document.getElementById('nameInput').value;
        if (inputName && inputName.trim() !== "") {
            userName = inputName.trim();
            localStorage.setItem("userName", userName);
            initializeApp();
        }
    });

    getOrSetUserName();

    backToActivitiesBtn.addEventListener('click', showActivitySelection);
    backToActivitiesFromIrrigationBtn.addEventListener('click', showActivitySelection);
    backToIrrigationChoiceBtn.addEventListener('click', showIrrigationChoice);

    submitReportButton.addEventListener('click', submitReport);
    submitIrrigationReportButton.addEventListener('click', submitReport);

    
    formContainerDiv.addEventListener('click', (event) => {
        if (event.target && event.target.id === 'addAbastecimentoFields') {
             const numInput = formContainerDiv.querySelector('input[id^="numAbastecimentos"], input[id^="NUMERO_ABASTECIMENTO"]');
             const container = formContainerDiv.querySelector('#abastecimentosContainer');
             if(numInput && container){
                if(selectedActivityKey === "Colheita"){
                    const equipmentType = document.querySelector('input[name="equipmentType"]:checked').value;
                    generateHarvestAbastecimentoFields(equipmentType, numInput.value, container);
                } else {
                    generateAbastecimentoFields(numInput.value, container);
                }
             }
        }
    });

    formContainerDiv.addEventListener('input', (event) => {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
            event.target.setCustomValidity('');
        }
    });
    irrigationFormContainer.addEventListener('input', (event) => {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
            event.target.setCustomValidity('');
        }
    });
});