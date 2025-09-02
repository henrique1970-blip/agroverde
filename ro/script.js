// ATENÇÃO: Cole aqui a URL do App da Web da sua planilha de "Ordem de Serviço"
const osAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

// ATENÇÃO: COLE AQUI A URL DE IMPLANTAÇÃO DO SEU NOVO APPS SCRIPT DE RELATÓRIO
const reportAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbznEdqNDvPH34VOE6EQ510BUkk3s5NtZyN8KRMKaCns--qerlsupNlUaQdil1tPdK5R/exec';

let userName = '';
let selectedActivityKey = '';
let currentOsDetails = {};

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
    "Lancas": "Lanças"
};


// Referências de elementos do DOM
const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const osIdRadioContainer = document.getElementById('osIdRadioContainer');
const operationIdDisplay = document.getElementById('operationIdDisplay');
const osDetailsContainer = document.getElementById('osDetailsContainer');
const harvestEquipmentSelectionContainer = document.getElementById('harvestEquipmentSelectionContainer'); // Novo container
const preparoAreaReportFieldsDiv = document.getElementById('preparoAreaReportFields');
const observacoesRelatorioContainer = document.getElementById('observacoesRelatorioContainer');
const submitReportButton = document.getElementById('submitReportButton');
const activityTitleSpan = document.getElementById('activityTitle');
const currentUserSpan = document.getElementById('currentUser');
const numAbastecimentosInput = document.getElementById('numAbastecimentos');
const abastecimentosContainer = document.getElementById('abastecimentosContainer');
const addAbastecimentoFieldsBtn = document.getElementById('addAbastecimentoFields');

function showActivitySelection() {
    activitySelectionDiv.style.display = 'grid';
    formContainerDiv.style.display = 'none';
}

function showForm() {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'block';
    currentUserSpan.textContent = userName;
}

function renderActivityButtons() {
    activitySelectionDiv.innerHTML = '';
    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.className = 'activity-button';
        button.textContent = ACTIVITIES[key];
        button.addEventListener('click', () => {
            selectedActivityKey = key;
            renderOsSelectionForm(key);
        });
        activitySelectionDiv.appendChild(button);
    }
}

async function renderOsSelectionForm(activityKey) {
    showForm();
    activityTitleSpan.textContent = ACTIVITIES[activityKey];
    osIdRadioContainer.innerHTML = `<p class="loading-message">Carregando Ordens de Serviço...</p>`;
    osDetailsContainer.innerHTML = '';
    harvestEquipmentSelectionContainer.innerHTML = '';
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
    return new Intl.DateTimeFormat('pt-BR').format(date);
}

function formatClientNumber(numInput) {
    if (numInput === null || numInput === undefined || numInput === '') return '';
    const num = parseFloat(String(numInput).replace(',', '.'));
    if (isNaN(num)) return numInput;
    return num.toFixed(1).replace('.', ',');
}

// NOVA FUNÇÃO: Renderiza a seleção de equipamento para a Colheita
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

// FUNÇÃO ATUALIZADA: Renderiza os campos de relatório específicos para cada equipamento da Colheita
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
                <button type="button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>
            `;
            break;
        case 'Caminhao':
            // *** INÍCIO DA CORREÇÃO PARA O PROBLEMA DO CAMINHÃO ***
            let caminhaoOptions = '';
            const caminhao1Element = document.getElementById('realizado_Caminhao1');
            const caminhao2Element = document.getElementById('realizado_Caminhao2');

            // Verifica se o elemento existe antes de tentar ler seu valor
            if (caminhao1Element && caminhao1Element.value) {
                caminhaoOptions += `<option value="1">${caminhao1Element.value}</option>`;
            }
            if (caminhao2Element && caminhao2Element.value) {
                caminhaoOptions += `<option value="2">${caminhao2Element.value}</option>`;
            }
            // *** FIM DA CORREÇÃO ***

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
                <button type="button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
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
                <button type="button" id="addAbastecimentoFields">Adicionar Abastecimentos</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>
            `;
            break;
    }

    preparoAreaReportFieldsDiv.innerHTML += fieldsHtml;

    // Adiciona event listeners para os novos botões/campos
    const addAbastecimentoBtn = preparoAreaReportFieldsDiv.querySelector('#addAbastecimentoFields');
    if(addAbastecimentoBtn) {
        addAbastecimentoBtn.addEventListener('click', () => {
            const numInput = preparoAreaReportFieldsDiv.querySelector('input[id^="NUMERO_ABASTECIMENTO"]');
            const container = preparoAreaReportFieldsDiv.querySelector('#abastecimentosContainer');
            generateHarvestAbastecimentoFields(equipmentType, numInput.value, container);
        });
    }

    // Lógica específica para o dropdown de caminhão
    if (equipmentType === 'Caminhao') {
        const select = document.getElementById('Caminhao_ID_Select');
        const motoristaInput = document.getElementById('MOTORISTA_CAMINHAO');
        const updateMotorista = () => {
            if (select.value) { // Garante que há uma opção selecionada
                const selectedIndex = select.value; // "1" ou "2"
                const motoristaElement = document.getElementById(`realizado_Motorista${selectedIndex}`);
                motoristaInput.value = motoristaElement ? motoristaElement.value : '';
            }
        };
        select.addEventListener('change', updateMotorista);
        updateMotorista(); // Chama uma vez para preencher o valor inicial
    }

    if (observacoesRelatorioContainer) observacoesRelatorioContainer.style.display = 'block';
    submitReportButton.style.display = 'block';
}


async function fetchAndDisplayOsData(osId) {
    osDetailsContainer.innerHTML = `<p class="loading-message">Buscando detalhes da OS...</p>`;
    harvestEquipmentSelectionContainer.innerHTML = ''; // Limpa a seleção de equipamento
    document.getElementById('observacoesRelatorio').value = '';

    try {
        const response = await fetch(`${osAppsScriptUrl}?activity=${selectedActivityKey}&osId=${encodeURIComponent(osId)}`);
        const osDetails = await response.json();
        if (osDetails.error) throw new Error(osDetails.error);
        currentOsDetails = osDetails;

        // Renderiza os dados comuns da OS
        const fieldsToExclude = ["Timestamp", "Nome do Usuário", "ID da OS"];
        let tableHtml = `<div class="os-data-container"><h4>Confirme os dados da Operação:</h4><div class="os-data-grid"><div class="grid-header">Item</div><div class="grid-header">Dados da OS</div><div class="grid-header center">Sim</div><div class="grid-header center">Não</div><div class="grid-header" style="color: grey;">Realizado/Usado</div>`;
        const numericKeys = ["Área Total (ha)", "Capacidade do tanque", "Vazão (L/ha)", "Pressão", "Dose/ha", "Dose/tanque", "Vazão", "Pressao", "Vazao (L/ha)"];
        for (const key in osDetails) {
            if (fieldsToExclude.includes(key) || key.toLowerCase().includes('observa') || !osDetails[key]) continue;
            
            const cleanKey = keyMap[key] || key.replace(/[^a-zA-Z0-9]/g, '');
            let value = key.includes("Data") ? formatClientDate(osDetails[key]) : (numericKeys.includes(key) ? formatClientNumber(osDetails[key]) : osDetails[key]);
            
            tableHtml += `<div class="grid-item"><strong>${key}</strong></div><div class="grid-item">${value}</div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="sim" checked></div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="nao"></div><div class="grid-item"><input type="text" id="realizado_${cleanKey}" value="${value}" disabled></div>`;
        }
        const osObservacaoKey = Object.keys(osDetails).find(k => k.toLowerCase().includes('observa'));
        if (osObservacaoKey && osDetails[osObservacaoKey]) {
            tableHtml += `<div class="grid-item"><strong>Observação da OS</strong></div><div class="grid-item" style="grid-column: 2 / -1; font-style: italic;">${osDetails[osObservacaoKey]}</div>`;
        }
        tableHtml += `</div></div>`;
        osDetailsContainer.innerHTML = tableHtml;

        osDetailsContainer.querySelector('.os-data-grid').addEventListener('change', (event) => {
            if (event.target.type === 'radio' && event.target.name.startsWith('confirm_')) {
                const cleanKey = event.target.name.replace('confirm_', '');
                document.getElementById(`realizado_${cleanKey}`).disabled = event.target.value !== 'nao';
            }
        });

        // Lógica de exibição de campos de relatório
        if (selectedActivityKey === "Colheita") {
            preparoAreaReportFieldsDiv.style.display = 'none'; // Esconde até selecionar equipamento
            renderHarvestEquipmentSelection(); // Mostra a seleção de equipamento
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
                <button type="button" id="addAbastecimentoFields">Adicionar/Atualizar Campos de Abastecimento</button>
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>`;
                document.getElementById('addAbastecimentoFields').addEventListener('click', () => generateAbastecimentoFields(document.getElementById('numAbastecimentos').value, document.getElementById('abastecimentosContainer')));

        } else {
            preparoAreaReportFieldsDiv.style.display = 'none';
        }

        if (observacoesRelatorioContainer) {
            const label = observacoesRelatorioContainer.querySelector('label');
            const textarea = observacoesRelatorioContainer.querySelector('textarea');
            observacoesRelatorioContainer.style.display = 'block';
            observacoesRelatorioContainer.style.width = '100%';
            observacoesRelatorioContainer.querySelector('.form-line').style.flexDirection = 'column';
            label.style.textAlign = 'left';
            label.style.width = '100%';
            textarea.style.width = '100%';
        }

        if (selectedActivityKey !== "Colheita") {
            submitReportButton.style.display = 'block';
        }

    } catch (error) {
        osDetailsContainer.innerHTML = `<p class="error-message">Erro ao buscar detalhes: ${error.message}</p>`;
    }
}

// NOVA FUNÇÃO: Gera campos de abastecimento específicos para a Colheita
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
    } else { // Colhedeira e Trator usam horímetro
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
    // --- INÍCIO DO BLOCO DE VALIDAÇÃO ---
    const requiredFields = [];
    let isValid = true;

    // Função auxiliar para validar um campo e mostrar o balão de erro
    function validateField(id, message) {
        const field = document.getElementById(id);
        if (field) {
            field.setCustomValidity(''); // Limpa mensagens antigas
            if (!field.value.trim()) {
                field.setCustomValidity(message);
                field.reportValidity();
                isValid = false;
                return false; // Interrompe na primeira falha
            }
        }
        return true;
    }
    
    if (selectedActivityKey === "Colheita") {
        const equipmentType = document.querySelector('input[name="equipmentType"]:checked')?.value;
        if (!equipmentType) {
            alert('Por favor, selecione o tipo de equipamento para o relatório de colheita.');
            return;
        }

        switch (equipmentType) {
            case 'Colhedeira':
                requiredFields.push({ id: 'horimetro_colhe_inicio', msg: 'Horímetro inicial é obrigatório.' });
                requiredFields.push({ id: 'horimetro_colhe_fim', msg: 'Horímetro de término é obrigatório.' });
                const numAbastColhedeira = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_COLHEDEIRA').value, 10) || 0;
                for (let i = 1; i <= numAbastColhedeira; i++) {
                    requiredFields.push({ id: `horimetro_colhe_abast_${i}`, msg: `Horímetro do abastecimento ${i} é obrigatório.` });
                    requiredFields.push({ id: `combustivel_colhedeira_${i}`, msg: `Litros do abastecimento ${i} é obrigatório.` });
                }
                break;
            case 'Caminhao':
                requiredFields.push({ id: 'km_inicio', msg: 'KM inicial é obrigatório.' });
                requiredFields.push({ id: 'km_fim', msg: 'KM de término é obrigatório.' });
                const numAbastCaminhao = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_CAMINHAO').value, 10) || 0;
                for (let i = 1; i <= numAbastCaminhao; i++) {
                    requiredFields.push({ id: `km_abastecimento_${i}`, msg: `KM do abastecimento ${i} é obrigatório.` });
                    requiredFields.push({ id: `combustivel_caminhao_${i}`, msg: `Litros do abastecimento ${i} é obrigatório.` });
                }
                break;
            case 'Trator':
                requiredFields.push({ id: 'horimetro_trator_inicio', msg: 'Horímetro inicial é obrigatório.' });
                requiredFields.push({ id: 'horimetro_trator_fim', msg: 'Horímetro de término é obrigatório.' });
                const numAbastTrator = parseInt(document.getElementById('NUMERO_ABASTECIMENTO_TRATOR').value, 10) || 0;
                for (let i = 1; i <= numAbastTrator; i++) {
                    requiredFields.push({ id: `horimetro_trator_abast_${i}`, msg: `Horímetro do abastecimento ${i} é obrigatório.` });
                    requiredFields.push({ id: `combustivel_trator_${i}`, msg: `Litros do abastecimento ${i} é obrigatório.` });
                }
                break;
        }
    } else if (["PreparodeArea", "Plantio", "Pulverizacao", "Lancas"].includes(selectedActivityKey)) {
         requiredFields.push({ id: 'horimetroInicio', msg: 'Horímetro inicial é obrigatório.' });
         requiredFields.push({ id: 'horimetroFim', msg: 'Horímetro de término é obrigatório.' });
         const numAbastecimentos = parseInt(document.getElementById('numAbastecimentos').value, 10) || 0;
         for (let i = 1; i <= numAbastecimentos; i++) {
            requiredFields.push({ id: `abastecimento_horimetro_${i}`, msg: `Horímetro do abastecimento ${i} é obrigatório.` });
            requiredFields.push({ id: `abastecimento_litros_${i}`, msg: `Litros do abastecimento ${i} é obrigatório.` });
         }
    }

    for (const field of requiredFields) {
        if (!validateField(field.id, field.msg)) {
            return; // Para a execução se um campo for inválido
        }
    }

    if (!isValid) return; // Segurança extra para parar o envio
    // --- FIM DO BLOCO DE VALIDAÇÃO ---


    const reportData = {
        activity: selectedActivityKey,
        userName: userName,
        osId: currentOsDetails['ID da OS'],
    };

    // Adiciona dados comuns da OS ao relatório
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
    reportData.observacao = document.getElementById('observacoesRelatorio')?.value || '';

    // Lógica específica para cada tipo de atividade
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
                reportData.PARADAS_IMPREVISTAS_CAMINHAO = document.getElementById('PARADAS_IMPREVISTAS_CAMINHAO').value; // <-- ADICIONADO PARA COLHEITA
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
                reportData.NUMERO_ABASTECimento_TRATOR = numAbastTrator;
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

    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.style.display = 'flex';
    submitReportButton.disabled = true;

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
        submitReportButton.disabled = false;
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
    submitReportButton.addEventListener('click', submitReport);
    
    // Adiciona o listener ao container que existe desde o início
    preparoAreaReportFieldsDiv.addEventListener('click', (event) => {
        if (event.target && event.target.id === 'addAbastecimentoFields') {
             const numInput = preparoAreaReportFieldsDiv.querySelector('input[id^="numAbastecimentos"]');
             const container = preparoAreaReportFieldsDiv.querySelector('#abastecimentosContainer');
             generateAbastecimentoFields(numInput.value, container);
        }
    });

    // Listener para limpar balões de erro ao digitar
    formContainerDiv.addEventListener('input', (event) => {
        if (event.target.tagName === 'INPUT') {
            event.target.setCustomValidity('');
        }
    });
});