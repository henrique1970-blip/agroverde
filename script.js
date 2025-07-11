// ** Importante: Substitua este URL pelo seu Apps Script Web App URL **
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz-5rT0uL3kvAdXKf8FFNwaN2X_nbWgXkC4kHiRqerF4KBT-3FjXC20Znzs5VONKnTgPw/exec';

const DB_NAME = 'osAgroDB';
const STORE_NAME = 'pendingOSData'; // Renomeado para refletir "Ordem de Serviço"
let db;

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
        { label: "Produtos e Dosagens/Proporções", name: "produtosDosagens", type: "textarea" },
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Operadores", name: "operadores", type: "text" },
        { label: "Observação", name: "observacao", type: "textarea" }
    ],
    "Plantio": [
        { label: "Cultura e Cultivar", name: "culturaCultivar", type: "text" },
        { label: "Quantidade/ha - Máximo", name: "qtdHaMax", type: "number" },
        { label: "Quantidade/ha - Mínimo", name: "qtdHaMin", type: "number" },
        { label: "Insumos a serem usados e quantidades", name: "insumos", type: "textarea" },
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
        { label: "Produto(s) e quantidade/ha", name: "produtosQtdHa", type: "textarea" },
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Máquina - Identificação", name: "maquina", type: "text" },
        { label: "Bico", name: "bico", type: "text" },
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
        { label: "Data de Início", name: "dataInicio", type: "date" },
        { label: "Data de Término", name: "dataTermino", type: "date" },
        { label: "Quantidade de produto/hectare", name: "qtdProdutoHectare", type: "number" },
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
const messageElement = document.getElementById('message');
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
    messageElement.textContent = 'Enviando dados...';
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
        messageElement.textContent = 'Erro ao enviar os dados. Tente novamente. ❌';
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
    // CORREÇÃO AQUI: Parênteses adicionais para agrupar (await getLocalData())
    if ((await getLocalData()).length === 0) {
        messageElement.textContent = 'Todos os dados pendentes sincronizados com sucesso! ✅';
    }
}

// --- Funções de UI Dinâmica ---

function showActivitySelection() {
    activitySelectionDiv.style.display = 'grid';
    formContainerDiv.style.display = 'none';
    backToActivitiesBtn.style.display = 'none';
    messageElement.textContent = ''; // Limpa a mensagem
}

function showForm() {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'block';
    backToActivitiesBtn.style.display = 'block';
    messageElement.textContent = ''; // Limpa a mensagem
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
    const formFields = FORM_FIELDS[activityKey];
    if (!formFields) {
        formContainerDiv.innerHTML = `<p>Formulário para "${ACTIVITIES[activityKey]}" não encontrado.</p>`;
        return;
    }

    let formHtml = `
        <h2>${ACTIVITIES[activityKey]}</h2>
        <form id="dynamicForm">
            <label for="local">Local da Atividade:</label>
            <select id="local" name="local" required>
                <option value="">Selecione o Local</option>
    `;
    for (const locationName in LOCATIONS_AND_FIELDS) {
        formHtml += `<option value="${locationName}">${locationName}</option>`;
    }
    formHtml += `
            </select>

            <div id="talhoesSelection" style="display: none;">
                <label>Talhões (e suas áreas em hectares):</label>
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
        formHtml += `<label for="${field.name}">${field.label}:</label>`;
        if (field.type === "textarea") {
            formHtml += `<textarea id="${field.name}" name="${field.name}"></textarea>`;
        } else {
            formHtml += `<input type="${field.type}" id="${field.name}" name="${field.name}" ${field.type === 'number' ? 'step="any"' : ''} ${field.required ? 'required' : ''}>`;
        }
    });

    formHtml += `<button type="submit">Registrar Ordem de Serviço</button></form>`;
    formContainerDiv.innerHTML = formHtml; // HTML do formulário injetado aqui

    // IMPORTANT: Get references to dynamically created elements AFTER they are in the DOM
    const localSelect = document.getElementById('local');
    const talhoesSelectionDiv = document.getElementById('talhoesSelection');
    const talhoesListDiv = document.getElementById('talhoesList');
    const allTalhoesCheckbox = document.getElementById('allTalhoes');
    const dynamicForm = document.getElementById('dynamicForm');
    const totalAreaDisplay = document.getElementById('totalAreaDisplay'); // Get reference to the total display

    localSelect.addEventListener('change', () => {
        const selectedLocation = localSelect.value;
        if (selectedLocation) {
            renderTalhoesCheckboxes(selectedLocation, talhoesListDiv, allTalhoesCheckbox);
            talhoesSelectionDiv.style.display = 'block';
            updateTotalArea(talhoesListDiv); // Update total when location changes
        } else {
            talhoesSelectionDiv.style.display = 'none';
            talhoesListDiv.innerHTML = '';
            updateTotalArea(talhoesListDiv); // Clear total when no location selected
        }
    });

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

    const form = event.target;
    const formData = new FormData(form);
    const data = {
        activity: currentActivityKey // Adiciona a atividade aos dados a serem enviados
    };

    // Pega o local
    data.local = formData.get('local');

    // Pega os talhões selecionados
    const selectedTalhoes = [];
    const talhaoCheckboxes = form.querySelectorAll('input[name="talhoes"]:checked');
    talhaoCheckboxes.forEach(cb => selectedTalhoes.push(cb.value));
    data.talhoes = selectedTalhoes.join('; '); // Junta os talhões em uma string

    // Pega os outros campos dinâmicos
    FORM_FIELDS[currentActivityKey].forEach(field => {
        data[field.name] = formData.get(field.name);
    });

    messageElement.textContent = 'Enviando dados...';

    if (navigator.onLine) {
        const success = await sendToAppsScript(data);
        if (success) {
            messageElement.textContent = 'Ordem de serviço registrada com sucesso! ✅';
            form.reset(); // Limpa o formulário
            // Opcional: Voltar para seleção de atividade após sucesso online
            setTimeout(showActivitySelection, 2000);
        } else {
            // Se online mas falhou o envio (ex: Apps Script inacessível), salva localmente
            await saveDataLocally({ data: data });
            messageElement.textContent = 'Falha ao enviar online. Dados salvos localmente para sincronização futura. 💾';
            form.reset();
        }
    } else {
        // Se offline, salva diretamente no IndexedDB
        await saveDataLocally({ data: data });
        messageElement.textContent = 'Offline. Dados salvos localmente para sincronização futura. 💾';
        form.reset();
    }

    // Tenta registrar um evento de sincronização em segundo plano (se suportado)
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-os-data'); // Tag específica para OS
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

// --- Event Listeners e Inicialização ---

document.addEventListener('DOMContentLoaded', async () => {
    await openDatabase(); // Abre o banco de dados ao carregar a página
    renderActivityButtons(); // Mostra os botões de seleção de atividade
    showActivitySelection(); // Garante que a tela inicial seja a seleção de atividade

    updateConnectionStatus(); // Atualiza o status da conexão

    // --- Service Worker Message Listener ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SYNC_PENDING_DATA') {
                console.log('App: Recebeu SYNC_PENDING_DATA mensagem do Service Worker.');
                attemptSync(); // Chama a função de sincronização
            }
        });
    }

    // Adiciona listeners para mudanças de conexão
    window.addEventListener('online', () => {
        updateConnectionStatus();
        attemptSync(); // Tenta sincronizar quando a conexão volta
    });
    window.addEventListener('offline', updateConnectionStatus);

    // Adiciona listener para o botão "Voltar para Atividades"
    backToActivitiesBtn.addEventListener('click', showActivitySelection);

    // Tenta sincronizar dados pendentes ao carregar a página (se online)
    if (navigator.onLine) {
        attemptSync();
    }
});