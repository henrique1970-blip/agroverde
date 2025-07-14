// ** Importante: Substitua este URL pelo seu Apps Script Web App URL **
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz-5rT0uL3kvAdXKf8FFNwaN2X_nbWgXkC4kHiRqerF4KBT-3FjXC20Znzs5VONKnTgPw/exec';


const DB_NAME = 'osAgroDB';
const STORE_NAME = 'pendingOSData';
let db;

// Variável global para armazenar o nome do usuário
let userName = '';

// Constante para o número máximo de produtos/insumos
const MAX_PRODUCTS = 5; // Deve ser o mesmo valor definido no appsScript.js

// --- Dados Fixos (Configurações) ---
const ACTIVITIES = {
    "PreparodeArea": "Preparo de Área",
    "TratamentodeSementes": "Tratamento de Sementes",
    "Plantio": "Plantio",
    "Pulverizacao": "Pulverização",
    "Colheita": "Colheita",
    "Lancas": "Lanças"
};

const LOCATIONS_AND_FIELDS = {
    "Fazenda Agro Verde": {
        "P33": 32.5, "P15": 14.85, "P60": 60.57, "P80": 80.95,
        "Hendrik Jan": 11.96, "Área 18": 29.05,
        "SOBRAS P33, P15, P60": 41.01, "TH 5 SOBRAS PIVO 80": 30.04
    },
    "Fazenda Catingueiro (Sador)": {
        "Área 20/21": 143.86, "Área 22": 88.64, "Área 23": 56.42,
        "Área 24": 34.96, "Área 25": 45.34, "Área 26/27": 50.83,
        "Área 28": 14.85, "Área 29": 26.10
    },
    "Wieke": {
        "Barracão": 21.04, "P45": 50.06, "P17": 19.88,
        "Sobra P45": 6.94
    },
    "Canto Verde": { "Canto Verde": 145.95 },
    "João Paulista": {
        "Área 31/32/33": 224.63, "Área 30": 81.18
    },
    "Sergio 46/47": { "Sergio 46/47": 121.44 },
    "Fazenda Naturalícia (Chaparral)": { "Fazenda Naturalícia (Chaparral)": 282.11 },
    "Fazenda Cachoeirinha": { "Fazenda Cachoeirinha": 290.95 },
    "Kakay": {
        "P100": 102.77, "P103": 104.41, "P135": 142.42, "P180": 213.77,
        "Sobra 61": 44.93, "Sobra 62": 51.89, "Sobra 63": 21.60,
        "Sobra 64": 59.09, "Sobra 65": 11.21
    },
    "Guimarães": {
        "Área 54": 38.72, "Área 55": 76.11
    },
    "Maribondo": {
        "Maribondo": 199.92, "M104_1": 44.28, "M104_2": 20.79
    },
    "Fazenda Marcio": {
        "Área 80": 68.1, "Área 81": 80.36, "Área 81B": 53.34,
        "Área 82": 96.75, "Área 83": 57.92, "Área 84": 29.91,
        "Área 85/87": 242.97, "Área 86A": 188.03, "Área 86B": 68.22,
        "Área 88": 56.58, "Área 88B": 24.18, "Área 89": 66.33,
        "Área 90": 68.30, "Área 91": 13.97
    },
    "Fazenda Campína (Custódio)": {
        "Custódio 100": 61.13, "Custódio 101": 53.4
    }
};

// --- Estrutura dos Campos do Formulário por Atividade ---
const FORM_FIELDS = {
    "PreparodeArea": [
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Operador(es)", name: "operadores", type: "text" },
        { label: "Implemento - Identificação", name: "implemento", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "TratamentodeSementes": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        { label: "Quantidade de Sementes (Kg)", name: "qtdSementesKg", type: "number" },
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        // Campos para produtos/insumos
        { label: "Número de Produtos", name: "numProducts", type: "number", min: 0, max: MAX_PRODUCTS },
        { label: "Produtos", name: "productsContainer", type: "div" }, // Placeholder para campos dinâmicos
        // Fim dos campos de produtos/insumos
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Operadores", name: "operadores", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "Plantio": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        { label: "Quantidade/ha - Máximo", name: "qtdHaMax", type: "number" },
        { label: "Quantidade/ha - Mínimo", name: "qtdHaMin", type: "number" },
        // Campos para produtos/insumos
        { label: "Número de Insumos", name: "numProducts", type: "number", min: 0, max: MAX_PRODUCTS },
        { label: "Insumos", name: "productsContainer", type: "div" }, // Placeholder para campos dinâmicos
        // Fim dos campos de produtos/insumos
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Trator - identificação", name: "trator", type: "text" },
        { label: "Implemento", name: "implemento", type: "text" },
        { label: "Plantas por metro", name: "plantasPorMetro", type: "number" },
        { label: "Espaçamento entre plantas", name: "espacamentoPlantas", type: "number" },
        { label: "Peso de mil sementes (PMS)", name: "pms", type: "number" },
        { label: "Operador(es)", name: "operadores", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "Pulverizacao": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        // Campos para produtos/insumos
        { label: "Número de Produtos", name: "numProducts", type: "number", min: 0, max: MAX_PRODUCTS },
        { label: "Produtos", name: "productsContainer", type: "div" }, // Placeholder para campos dinâmicos
        // Fim dos campos de produtos/insumos
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Bico", name: "bico", "type": "text" },
        { label: "Capacidade do tanque", name: "capacidadeTanque", type: "number" },
        { label: "Vazão (L/ha)", name: "vazaoLHa", type: "number" },
        { label: "Operador(es)", name: "operadores", type: "text" },
        { label: "Pressão", name: "pressao", type: "number" },
        { label: "Dose/ha", name: "doseHa", type: "number" },
        { label: "Dose/tanque", name: "doseTanque", type: "number" },
        { label: "Implemento - Identificação", name: "implemento", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "Colheita": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        { label: "Produtividade estimada", name: "produtividadeEstimada", type: "number" },
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Operador(es) Máquina", name: "operadoresMaquina", type: "text" },
        { label: "Caminhão (caminhões) - identificação", name: "caminhao", type: "text" },
        { label: "Motorista(s)", name: "motoristas", type: "text" },
        { label: "Trator - marca modelo e número", name: "trator", type: "text" },
        { label: "Operador(es) Trator", name: "operadoresTrator", type: "text" },
        { label: "Implemento - Identificação", name: "implemento", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "Lancas": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        // Campos para produtos/insumos
        { label: "Número de Produtos", name: "numProducts", type: "number", min: 0, max: MAX_PRODUCTS },
        { label: "Produtos", name: "productsContainer", type: "div" }, // Placeholder para campos dinâmicos
        // Fim dos campos de produtos/insumos
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Operador(es)", name: "operadores", type: "text" },
        { label: "Implemento - Identificação", name: "implemento", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ]
};


// --- Elementos DOM (Declarações Globais) ---
const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const messageElement = document.getElementById('message'); // Mensagem global (topo da página)
const connectionStatusElement = document.getElementById('connectionStatus');

let currentActivityKey = null; // Armazena a chave da atividade atual (ex: "PreparodeArea")

// --- Funções de IndexedDB ---

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function(event) {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = function(event) {
            console.error('Erro ao abrir IndexedDB:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function saveDataLocally(data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.add(data);

        request.onsuccess = function() {
            console.log('Dados salvos localmente:', data);
            resolve();
        };

        request.onerror = function(event) {
            console.error('Erro ao salvar dados localmente:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function getLocalData() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function(event) {
            console.error('Erro ao obter dados locais:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function deleteLocalData(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = function() {
            console.log('Dados locais deletados:', id);
            resolve();
        };

        request.onerror = function(event) {
            console.error('Erro ao deletar dados locais:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

// --- Funções de Envio para Apps Script ---

async function sendToAppsScript(data) {
    // A mensagem "Enviando dados..." agora será controlada pelo formMessageElement
    try {
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors', // Necessário para evitar erros CORS com Apps Script
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data).toString()
        });
        // Como usamos 'no-cors', a resposta será opaca. Não podemos ler o corpo da resposta.
        // Apenas confirmamos que a requisição foi feita.
        console.log('Requisição para Apps Script enviada (resposta opaca).');
        return true; // Consideramos sucesso se a requisição foi feita
    } catch (error) {
        console.error('Erro ao enviar os dados para Apps Script:', error);
        // A mensagem de erro agora será controlada pelo formMessageElement
        return false;
    }
}

// --- Lógica de Sincronização ---

async function attemptSync() {
    const pendingData = await getLocalData();

    if (pendingData.length === 0) {
        messageElement.textContent = 'Nenhum dado pendente para sincronizar.';
        return;
    }

    messageElement.textContent = `Sincronizando ${pendingData.length} item(s) pendente(s)...`;

    for (const item of pendingData) {
        const success = await sendToAppsScript(item.data);
        if (success) {
            await deleteLocalData(item.id);
            messageElement.textContent = `Item ${item.id} sincronizado.`;
        } else {
            // Se falhar, para a sincronização e tenta novamente mais tarde
            messageElement.textContent = `Falha ao sincronizar item ${item.id}. Será tentado novamente.`;
            break; // Importante: para de tentar se um item falha para evitar loop infinito
        }
    }
    // Verifica novamente se ainda há dados pendentes após a tentativa de sincronização
    if ((await getLocalData()).length === 0) {
        messageElement.textContent = 'Todos os dados pendentes sincronizados com sucesso! ✅';
    }
}

// Nova função: Exibe mensagem se há dados pendentes (chamada ao carregar o app)
async function displayPendingDataMessage() {
    const pendingData = await getLocalData();
    if (pendingData.length > 0) {
        messageElement.textContent = `Há ${pendingData.length} ordem(ns) de serviço pendente(s) para sincronização.`;
        messageElement.style.backgroundColor = '#fffacd'; // Amarelo claro para destaque
        messageElement.style.color = '#8a6d3b';
        setTimeout(() => { // Limpa a mensagem após um tempo, a menos que a sincronização ocorra
            if (messageElement.textContent.includes('pendente(s)')) { // Só limpa se ainda for a mensagem de pendente
                messageElement.textContent = '';
                messageElement.style.backgroundColor = '';
                messageElement.style.color = '';
            }
        }, 5000); // Mensagem visível por 5 segundos
    }
}


// --- Funções de UI Dinâmica ---

function showActivitySelection() {
    activitySelectionDiv.style.display = 'grid';
    formContainerDiv.style.display = 'none';
    backToActivitiesBtn.style.display = 'none';
    // messageElement.textContent = ''; // Limpa a mensagem global (pode ser necessário se não for feito na sincronização)
    // messageElement.style.backgroundColor = ''; // Remove cor de fundo
    // messageElement.style.color = ''; // Remove cor de texto
}

function showForm() {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'block';
    backToActivitiesBtn.style.display = 'block';
    // messageElement.textContent = ''; // Limpa a mensagem global (pode ser necessário se não for feito na sincronização)
    // messageElement.style.backgroundColor = ''; // Remove cor de fundo
    // messageElement.style.color = ''; // Remove cor de texto
}

function renderActivityButtons() {
    activitySelectionDiv.innerHTML = ''; // Limpa botões existentes
    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.className = 'activity-button';
        button.textContent = ACTIVITIES[key];
        button.dataset.activityKey = key; // Armazena a chave para fácil acesso
        button.addEventListener('click', () => {
            currentActivityKey = key;
            renderForm(key);
            showForm();
        });
        activitySelectionDiv.appendChild(button);
    }
}

// Nova função: Exibe a OS ID gerada (mantida conforme o seu desejo)
function generateOsId(userName, localName) {
    const userChar = userName ? userName.charAt(0).toUpperCase() : 'X';
    const localPart = localName ? localName.split(' ')[0].toUpperCase().replace(/[^A-Z0-9]/gi, '').substring(0, 5) : '';
    const randomNum = Math.floor(100 + Math.random() * 900); // Número de 3 dígitos

    return `${userChar}-${localPart}-${randomNum}`;
}

// Nova função para atualizar a área total
function updateTotalArea(talhoesListElement) {
    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    let total = 0;
    const selectedCheckboxes = talhoesListElement.querySelectorAll('input[name="talhoes"]:checked');

    selectedCheckboxes.forEach(checkbox => {
        // Extrai a área do valor do checkbox (ex: "P33 (32.5 ha)" -> 32.5)
        const match = checkbox.value.match(/\(([\d.]+) ha\)/);
        if (match && match[1]) {
            total += parseFloat(match[1]);
        }
    });

    totalAreaDisplay.textContent = `TOTAL (ha): ${total.toFixed(2)}`;
}


function renderForm(activityKey) {
    console.log('Rendering form for activity:', activityKey);
    const formFields = FORM_FIELDS[activityKey];
    if (!formFields) {
        formContainerDiv.innerHTML = `<p>Formulário para "${ACTIVITIES[activityKey]}" não encontrado.</p>`;
        return;
    }

    // Define a label do campo 'Local' dinamicamente
    const localLabelText = (activityKey === "TratamentodeSementes") ? "Local de destino:" : "Local da Atividade:";

    let formHtml = `
        <h2>${ACTIVITIES[activityKey]}</h2>
        <form id="dynamicForm">
            <input type="hidden" id="userNameField" name="userName" value="${userName}">
            
            <input type="hidden" id="osIdField" name="osId" value="">
            
            <p class="form-info-display">Registrando como: <strong>${userName || 'N/A'}</strong></p>
            <p class="form-info-display">ID da Ordem de Serviço: <strong id="displayedOsId">Aguardando seleção do local...</strong></p>

            <label for="local">${localLabelText} <span class="required">*</span></label>
            <select id="local" name="local" required>
                <option value="">Selecione o Local</option>
    `;
    for (const locationName in LOCATIONS_AND_FIELDS) {
        formHtml += `<option value="${locationName}">${locationName}</option>`;
    }
    formHtml += `
            </select>

            <div id="talhoesSelection" style="display: none;">
                <label>Talhões (e suas áreas em hectares): <span class="required">*</span></label>
                <div class="checkbox-group">
                    <input type="checkbox" id="allTalhoes" name="allTalhoes">
                    <label for="allTalhoes">Todos</label>
                </div>
                <div id="talhoesList" class="talhoes-list">
                    </div>
                <div id="totalAreaDisplay" class="total-area-display">TOTAL (ha): 0.00</div>
            </div>
    `;

    formFields.forEach(field => {
        const isRequired = field.name !== 'observacao' && field.name !== 'productsContainer' && field.name !== 'numProducts'; // Observacao e containers não são obrigatórios

        if (field.name === "productsContainer") {
            formHtml += `<div id="productsContainer"></div>`; // Placeholder para os campos dinâmicos de produtos
        } else if (field.name === "numProducts") {
             formHtml += `<label for="${field.name}">${field.label}: <span class="required">*</span></label>`;
             formHtml += `<input type="${field.type}" id="${field.name}" name="${field.name}" min="${field.min || 0}" max="${field.max || ''}" value="0" ${isRequired ? 'required' : ''}>`;
        }
        else if (field.type === "textarea") {
            formHtml += `<label for="${field.name}">${field.label}: ${isRequired ? '<span class="required">*</span>' : ''}</label>`;
            formHtml += `<textarea id="${field.name}" name="${field.name}" ${isRequired ? 'required' : ''}></textarea>`;
        } else {
            formHtml += `<label for="${field.name}">${field.label}: ${isRequired ? '<span class="required">*</span>' : ''}</label>`;
            formHtml += `<input type="${field.type}" id="${field.name}" name="${field.name}" ${field.type === 'number' ? 'step="any"' : ''} ${isRequired ? 'required' : ''}>`;
        }
    });

    // Div para a mensagem de status do formulário
    formHtml += `<div id="formMessage" class="form-message" style="display: none;"></div>`;
    formHtml += `<button type="submit">Registrar Ordem de Serviço</button></form>`;
    formContainerDiv.innerHTML = formHtml; // HTML do formulário injetado aqui

    // IMPORTANT: Get references to dynamically created elements AFTER they are in the DOM
    const localSelect = document.getElementById('local');
    const talhoesSelectionDiv = document.getElementById('talhoesSelection');
    const talhoesListDiv = document.getElementById('talhoesList');
    const allTalhoesCheckbox = document.getElementById('allTalhoes');
    const dynamicForm = document.getElementById('dynamicForm');
    const totalAreaDisplay = document.getElementById('totalAreaDisplay'); // Get reference to the total display

    // Referências para os novos campos de produto/insumo
    const numProductsInput = document.getElementById('numProducts');
    const productsContainerDiv = document.getElementById('productsContainer');


    localSelect.addEventListener('change', () => {
        const selectedLocation = localSelect.value;
        console.log('Local selected:', selectedLocation);
        if (selectedLocation) {
            renderTalhoesCheckboxes(selectedLocation, talhoesListDiv, allTalhoesCheckbox);
            talhoesSelectionDiv.style.display = 'block';
            updateTotalArea(talhoesListDiv); // Update total when location changes

            const newOsId = generateOsId(userName, selectedLocation);
            document.getElementById('osIdField').value = newOsId;
            document.getElementById('displayedOsId').textContent = newOsId;

        } else {
            talhoesSelectionDiv.style.display = 'none';
            talhoesListDiv.innerHTML = '';
            updateTotalArea(talhoesListDiv); // Clear total when no location selected

            document.getElementById('osIdField').value = '';
            document.getElementById('displayedOsId').textContent = 'Aguardando seleção do local...';
        }
    });

    // Event listener para o campo numProducts para renderizar os campos de produto/insumo
    if (numProductsInput && productsContainerDiv) {
        numProductsInput.addEventListener('input', () => {
            renderProductFields(parseInt(numProductsInput.value) || 0, productsContainerDiv, activityKey);
        });
        // Renderiza os campos iniciais (se o valor padrão for 0, nada será exibido)
        renderProductFields(parseInt(numProductsInput.value) || 0, productsContainerDiv, activityKey);
    }


    // Event listener for the "Todos" checkbox
    allTalhoesCheckbox.addEventListener('change', () => {
        const checkboxes = talhoesListDiv.querySelectorAll('input[name="talhoes"]');
        checkboxes.forEach(cb => {
            cb.checked = allTalhoesCheckbox.checked;
        });
        updateTotalArea(talhoesListDiv); // Update total when "Todos" changes
    });

    dynamicForm.addEventListener('submit', handleFormSubmit);
}

// Função para renderizar campos dinâmicos de produto/insumo
function renderProductFields(num, container, activityKey) {
    container.innerHTML = ''; // Limpa campos existentes
    const productLabel = (activityKey === "Plantio") ? "Insumo" : "Produto";

    for (let i = 1; i <= num; i++) {
        const productGroupDiv = document.createElement('div');
        productGroupDiv.className = 'product-group'; // Para estilização futura se precisar

        productGroupDiv.innerHTML = `
            <h3>${productLabel} ${i}</h3>
            <label for="product_name_${i}">${productLabel} ${i} Nome: <span class="required">*</span></label>
            <input type="text" id="product_name_${i}" name="product_name_${i}" required>

            <label for="product_dosage_${i}">${productLabel} ${i} Dosagem: <span class="required">*</span></label>
            <input type="text" id="product_dosage_${i}" name="product_dosage_${i}" required>
        `;
        container.appendChild(productGroupDiv);
    }
}

// Modify renderTalhoesCheckboxes to accept the DOM elements as arguments
function renderTalhoesCheckboxes(locationName, talhoesListElement, allTalhoesCheckboxElement) {
    talhoesListElement.innerHTML = ''; // Limpa talhões existentes
    const talhoes = LOCATIONS_AND_FIELDS[locationName];
    if (talhoes) {
        for (const talhaoName in talhoes) {
            const area = talhoes[talhaoName];
            const div = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `talhao-${talhaoName.replace(/\s+/g, '-')}`; // Cria um ID único e válido
            input.name = 'talhoes';
            input.value = `${talhaoName} (${area} ha)`; // Valor a ser salvo

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = `${talhaoName} (${area} ha)`;

            div.appendChild(input);
            div.appendChild(label);
            talhoesListElement.appendChild(div);

            // Add event listener to individual talhão checkbox
            input.addEventListener('change', () => updateTotalArea(talhoesListElement));
        }
    }
    allTalhoesCheckboxElement.checked = false; // Reseta o "Todos"
}

async function handleFormSubmit(event) {
    event.preventDefault();
    console.log('Form submission started.');

    const form = event.target;
    const formData = new FormData(form);
    const formMessageElement = document.getElementById('formMessage'); // Referência à nova caixa de mensagem

    // --- Lógica de Validação ---
    let isValid = true;
    let errorMessage = '';

    // Valida o campo 'local'
    const selectedLocal = formData.get('local');
    if (!selectedLocal) {
        isValid = false;
        errorMessage += 'Por favor, selecione o Local da Atividade.\n';
    }

    // Valida os talhões APENAS se um local foi selecionado
    if (selectedLocal) {
        const selectedTalhoes = [];
        const talhaoCheckboxes = form.querySelectorAll('input[name="talhoes"]:checked');
        talhaoCheckboxes.forEach(cb => selectedTalhoes.push(cb.value));
        
        if (selectedTalhoes.length === 0) {
            isValid = false;
            errorMessage += 'Por favor, selecione pelo menos um Talhão.\n';
        }
    }

    // Valida o ID da OS (que é gerado no cliente)
    const osId = formData.get('osId');
    if (!osId || osId === '' || osId === 'N/A' || osId === 'Aguardando seleção do local...') {
        isValid = false;
        errorMessage += 'O ID da Ordem de Serviço não foi gerado. Por favor, selecione o local novamente.\n';
    }

    // Valida outros campos dinâmicos (exceto 'observacao' e campos ocultos)
    FORM_FIELDS[currentActivityKey].forEach(field => {
        // Exclui validação para 'observacao', 'userName', 'osId', e containers dinâmicos
        if (field.name !== 'observacao' && field.name !== 'userName' && field.name !== 'osId' && field.name !== 'productsContainer') {
            const fieldValue = formData.get(field.name);
            // Verifica se o campo está vazio ou contém apenas espaços em branco
            if (!fieldValue || String(fieldValue).trim() === '') {
                // Validação específica para campos numéricos que podem ser 0, mas não vazios
                if (field.type === 'number' && (fieldValue === null || fieldValue === '' || isNaN(Number(fieldValue)))) {
                     isValid = false;
                     errorMessage += `Por favor, preencha o campo "${field.label}" com um número válido.\n`;
                } else if (field.type !== 'number') { // Para outros tipos, se vazio, é erro
                    isValid = false;
                    errorMessage += `Por favor, preencha o campo "${field.label}".\n`;
                }
            }
        }
    });

    // Validação específica para os campos de produtos/insumos
    if (["TratamentodeSementes", "Plantio", "Lancas", "Pulverizacao"].includes(currentActivityKey)) {
        const numProducts = parseInt(formData.get('numProducts')) || 0;
        for (let i = 1; i <= numProducts; i++) {
            const productName = formData.get(`product_name_${i}`);
            const productDosage = formData.get(`product_dosage_${i}`);

            if (!productName || productName.trim() === '') {
                isValid = false;
                errorMessage += `Por favor, preencha o Nome do Produto/Insumo ${i}.\n`;
            }
            if (!productDosage || productDosage.trim() === '') {
                isValid = false;
                errorMessage += `Por favor, preencha a Dosagem do Produto/Insumo ${i}.\n`;
            }
        }
    }


    if (!isValid) {
        console.log('Form validation failed. Error message:', errorMessage);
        formMessageElement.textContent = 'Erro de validação:\n' + errorMessage;
        formMessageElement.style.display = 'block';
        formMessageElement.style.backgroundColor = '#f8d7da'; // Vermelho claro para erro
        formMessageElement.style.color = '#721c24';
        setTimeout(() => {
            formMessageElement.textContent = '';
            formMessageElement.style.display = 'none';
            formMessageElement.style.backgroundColor = '';
            formMessageElement.style.color = '';
        }, 8000); // Mensagem visível por 8 segundos
        return; // Impede o envio do formulário
    }
    // --- Fim da Lógica de Validação ---

    const data = {
        osId: osId, // Mantém o ID gerado no cliente
        activity: currentActivityKey,
        userName: userName
    };

    data.local = selectedLocal;

    const finalSelectedTalhoes = [];
    form.querySelectorAll('input[name="talhoes"]:checked').forEach(cb => finalSelectedTalhoes.push(cb.value));
    data.talhoes = finalSelectedTalhoes.join('; ');

    FORM_FIELDS[currentActivityKey].forEach(field => {
        // Ignora campos que não são para serem enviados diretamente (como productsContainer)
        if (field.name !== 'productsContainer' && field.name !== 'osId' && field.name !== 'userName') {
            data[field.name] = formData.get(field.name);
        }
    });

    // Adiciona os campos de produtos/insumos dinamicamente ao objeto 'data'
    if (["TratamentodeSementes", "Plantio", "Lancas", "Pulverizacao"].includes(currentActivityKey)) {
        const numProducts = parseInt(formData.get('numProducts')) || 0;
        for (let i = 1; i <= MAX_PRODUCTS; i++) { // Percorre até o MAX_PRODUCTS para garantir que as colunas sejam preenchidas ou vazias
            const productName = formData.get(`product_name_${i}`);
            const productDosage = formData.get(`product_dosage_${i}`);
            
            data[`product_name_${i}`] = productName || ""; // Garante que mesmo vazios sejam enviados para criar a coluna na planilha
            data[`product_dosage_${i}`] = productDosage || ""; // Garante que mesmo vazios sejam enviados
        }
    }

    console.log('Final data object before sending:', data);

    formMessageElement.textContent = 'Enviando dados...';
    formMessageElement.style.display = 'block';
    formMessageElement.style.backgroundColor = '#e6f7ff'; // Azul claro para info
    formMessageElement.style.color = '#0056b3';


    if (navigator.onLine) {
        console.log('Attempting to send data online.');
        const success = await sendToAppsScript(data);
        if (success) {
            console.log('Online send successful.');
            formMessageElement.textContent = `Ordem de serviço ${osId} registrada com sucesso! ✅`;
            formMessageElement.style.backgroundColor = '#d4edda'; // Verde para sucesso
            formMessageElement.style.color = '#155724';
            form.reset();
            setTimeout(showActivitySelection, 2000);
        } else {
            console.log('Online send failed, saving locally.');
            await saveDataLocally({ data: data });
            formMessageElement.textContent = `Falha ao enviar online. Ordem de serviço ${osId} salva localmente para sincronização futura. 💾`;
            formMessageElement.style.backgroundColor = '#fffacd'; // Amarelo para aviso
            formMessageElement.style.color = '#8a6d3b';
            form.reset();
            setTimeout(() => { // Limpa a mensagem após 5 segundos
                formMessageElement.textContent = '';
                formMessageElement.style.display = 'none';
                formMessageElement.style.backgroundColor = '';
                formMessageElement.style.color = '';
            }, 5000);
        }
    } else {
        console.log('Currently offline, saving locally.');
        await saveDataLocally({ data: data });
        formMessageElement.textContent = `Offline. Ordem de serviço ${osId} salva localmente para sincronização futura. 💾`;
        formMessageElement.style.backgroundColor = '#fffacd'; // Amarelo para aviso
        formMessageElement.style.color = '#8a6d3b';
        form.reset();
        setTimeout(() => { // Limpa a mensagem após 5 segundos
            formMessageElement.textContent = '';
            formMessageElement.style.display = 'none';
            formMessageElement.style.backgroundColor = '';
            formMessageElement.style.color = '';
        }, 5000);
    }

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-os-data');
            console.log('Evento de sincronização em segundo plano para OS registrado.');
        } catch (error) {
            console.warn('Falha ao registrar sync em segundo plano para OS:', error);
        }
    }
}

function updateConnectionStatus() {
    if (navigator.onLine) {
        connectionStatusElement.textContent = 'Status: Online';
        connectionStatusElement.className = 'status-message status-online';
    } else {
        connectionStatusElement.textContent = 'Status: Offline (dados serão sincronizados)';
        connectionStatusElement.className = 'status-message status-offline';
    }
}

// --- Funções de Inicialização e Lógica do Usuário ---

// Função para obter ou pedir o nome do usuário
function getOrSetUserName() {
    userName = localStorage.getItem('userName');
    if (!userName) {
        let inputName = prompt('Olá! Por favor, digite seu nome para registrar as ordens de serviço:');
        if (inputName) {
            userName = inputName.trim();
            localStorage.setItem('userName', userName);
        } else {
            userName = 'Usuário Anônimo';
            alert('Nome não fornecido. Você será registrado como "Usuário Anônimo".');
        }
    }
    console.log('Final userName after getOrSetUserName:', userName);
}


// --- Event Listeners e Inicialização ---

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded event fired.');
    await openDatabase();
    getOrSetUserName();

    displayPendingDataMessage();

    renderActivityButtons();
    showActivitySelection();

    updateConnectionStatus();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SYNC_PENDING_DATA') {
                console.log('App: Recebeu SYNC_PENDING_DATA mensagem do Service Worker.');
                attemptSync();
            }
        });
    }

    window.addEventListener('online', () => {
        console.log('Browser is online.');
        updateConnectionStatus();
        attemptSync();
    });
    window.addEventListener('offline', () => {
        console.log('Browser is offline.');
        updateConnectionStatus();
    });

    backToActivitiesBtn.addEventListener('click', showActivitySelection);

    if (navigator.onLine) {
        console.log('Initial online check: attempting sync.');
        attemptSync();
    }
});