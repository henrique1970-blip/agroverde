const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';
const PDF_FOLDER_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754"; // ID da pasta de PDFs

const DB_NAME = 'osAgroDB';
const STORE_NAME = 'pendingOSData';
let db;
let userName = '';
const MAX_PRODUCTS = 20; // ALTERADO: O valor máximo de produtos agora é 20

// --- DADOS E CONFIGURAÇÕES ---
const ACTIVITIES = {"PreparodeArea":"Preparo de Área","TratamentodeSementes":"Tratamento de Sementes","Plantio":"Plantio","Pulverizacao":"Pulverização","Colheita":"Colheita","Lancas":"Lanças"};
const LOCATIONS_AND_FIELDS = {"AgroVerde":{"P33":32.5,"P15":14.85,"P60":60.57,"P80":80.95,"Hendrik Jan":11.96,"Baaie":18.68, "SOBRAS P33, P15, P60":41.01,"TH 5 SOBRAS PIVO 80":30.04},"Sador":{"Área 20/21":143.86,"Área 22":88.64,"Área 23":56.42,"Área 24":34.96,"Área 25":45.34,"Área 26/27":50.83,"Área 28":14.85,"Área 29":26.1, "Área 18":29.5},"Wieke":{"Barracão":21.04,"P45":50.06,"P17":19.88,"Sobra P45":6.94},"CantoVerde":{"Canto Verde":145.95},"João Paulista":{"Área 31/32/33":224.63,"Área 30":81.18},"Sergio":{"Sergio 46/47":121.44},"Chaparral":{"Fazenda Naturalícia (Chaparral)":282.11},"Cachoeirinha":{"Fazenda Cachoeirinha":290.95},"Kakay":{"P100":102.77,"P103":104.41,"P135":142.42,"P180":213.77,"Sobra 61":44.93,"Sobra 62":51.89,"Sobra 63":21.6,"Sobra 64":59.09,"Sobra 65":11.21,"Área 68":137.00,"Área 69":17.00},"Guimarães":{"Área 54":38.72,"Área 55":76.11},"Maribondo":{"Maribondo":199.92,"M104_1":44.28,"M104_2":20.79},"Fazenda Marcio":{"Área 80":68.1,"Área 81":80.36,"Área 81B":53.34,"Área 82":96.75,"Área 83":57.92,"Área 84":29.91,"Área 85/87":242.97,"Área 86A":188.03,"Área 86B":68.22,"Área 88":56.58,"Área 88B":24.18,"Área 89":66.33,"Área 90":68.3,"Área 91":13.97},"Custódio":{"Custódio 100":61.13,"Custódio 101":53.4}};
const FORM_FIELDS = {"PreparodeArea":[{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Trator - identificação",name:"trator",type:"text"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"TratamentodeSementes":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Quantidade de Sementes (Kg)",name:"qtdSementesKg",type:"number"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e Dosagens",name:"productsContainer",type:"div"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Operadores",name:"operadores",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Plantio":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Quantidade/ha - Máximo",name:"qtdHaMax",type:"number"},{label:"Quantidade/ha - Mínimo",name:"qtdHaMin",type:"number"},{label:"Número de Insumos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Insumos (a serem usados e quantidades)",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Trator - identificação",name:"trator",type:"text"},{label:"Implemento",name:"implemento",type:"text"},{label:"Plantas por metro",name:"plantasPorMetro",type:"number"},{label:"Espaçamento entre plantas",name:"espacamentoPlantas",type:"number"},{label:"Peso de mil sementes (PMS)",name:"pms",type:"number"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Pulverizacao":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e quantidade/ha",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Bico",name:"bico",type:"text"},{label:"Capacidade do tanque",name:"capacidadeTanque",type:"number"},{label:"Vazão (L/ha)",name:"vazaoLHa",type:"number"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Pressão",name:"pressao",type:"number"},{label:"Dose/ha",name:"doseHa",type:"number"},{label:"Dose/tanque",name:"doseTanque",type:"number"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Colheita":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Produtividade estimada",name:"produtividadeEstimada",type:"number"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Colhedeira - Identificação",name:"maquina",type:"text"},{label:"Operador(es) Colhedeira",name:"operadoresMaquina",type:"text"},{label:"Número de Caminhões",name:"numTrucks",type:"number",min:0,max:MAX_PRODUCTS},{label:"Caminhões e Motoristas",name:"trucksContainer",type:"div"},{label:"Trator - marca modelo e número",name:"trator",type:"text"},{label:"Operador(es) Trator",name:"operadoresTrator",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Lancas":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e quantidade/hectare",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}]};

const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const connectionStatusElement = document.getElementById('connectionStatus');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
let currentActivityKey = null;

// --- Funções de Banco de Dados Local (IndexedDB) ---
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = e => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = e => { db = e.target.result; resolve(db); };
        request.onerror = e => reject(e.target.errorCode);
    });
}

function saveDataLocally(data) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not open");
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.add(data);
        request.onsuccess = resolve;
        request.onerror = e => reject(e.target.error);
    });
}

function getLocalData() {
    return new Promise((resolve, reject) => {
        if (!db) return reject("DB not open");
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = e => reject(e.target.error);
    });
}

function deleteLocalData(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = resolve;
        request.onerror = e => reject(e.target.error);
    });
}

// --- Funções de Rede e Sincronização ---
async function sendDataToServer(data) {
    try {
        const response = await fetch(appsScriptUrl, { method: 'POST', body: new URLSearchParams(data) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        return { success: false, message: `Erro de comunicação: ${error.message}` };
    }
}

async function attemptSync() {
    const pendingData = await getLocalData();
    if (pendingData.length === 0) return;

    showNotification(`Sincronizando ${pendingData.length} OS pendente(s)...`, true);
    let lastSuccessfulResult = null;

    for (const item of pendingData) {
        const result = await sendDataToServer(item.data);
        if (result.success) {
            await deleteLocalData(item.id);
            lastSuccessfulResult = result;
        } else {
            showNotification(`Falha ao sincronizar. Tentando novamente mais tarde.`, false);
            return;
        }
    }
    
    if ((await getLocalData()).length === 0 && lastSuccessfulResult) {
        const successMessage = `Sincronização concluída! ✅ <br><a href="${lastSuccessfulResult.folderUrl}" target="_blank">Ver Pasta de Ordens de Serviço</a>`;
        showNotification(successMessage, false);
    }
}

// --- Funções de UI ---
function showNotification(message, isPulsing = false) {
    modalContent.innerHTML = message;
    modalContent.classList.toggle('pulsing', isPulsing);
    modalOverlay.style.display = 'flex';
}

function hideNotification() {
    modalOverlay.style.display = 'none';
    modalContent.innerHTML = '';
    modalContent.classList.remove('pulsing');
}

function showActivitySelection() {
    activitySelectionDiv.style.display = 'grid';
    formContainerDiv.style.display = 'none';
    backToActivitiesBtn.style.display = 'none';
    formContainerDiv.innerHTML = '';
}

function showForm() {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'block';
    backToActivitiesBtn.style.display = 'block';
}

function renderActivityButtons() {
    activitySelectionDiv.innerHTML = '';
    
    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.className = 'activity-button';
        button.textContent = ACTIVITIES[key];
        button.dataset.activityKey = key;
        button.addEventListener('click', () => {
            hideNotification();
            currentActivityKey = key;
            renderForm(key);
            showForm();
        });
        activitySelectionDiv.appendChild(button);
    }
    
    const viewOrdersButton = document.createElement('a');
    viewOrdersButton.id = 'viewIssuedOrders';
    viewOrdersButton.className = 'activity-button';
    viewOrdersButton.href = `https://drive.google.com/drive/folders/${PDF_FOLDER_ID}`;
    viewOrdersButton.textContent = 'Ordens emitidas';
    viewOrdersButton.target = '_blank';
    activitySelectionDiv.appendChild(viewOrdersButton);
}

function generateOsId(userName, localName) {
    const userChar = userName ? userName.charAt(0).toUpperCase() : 'X';

    // --- LÓGICA ALTERADA PARA PEGAR A ÚLTIMA PALAVRA DO LOCAL ---
    // 1. Remove o texto entre parênteses (ex: "(Custódio)") e espaços extras.
    let processedLocalName = localName ? localName.replace(/\s*\(.*\)\s*$/, '').trim() : ''; 
    
    // 2. Divide o nome processado em um array de palavras.
    const words = processedLocalName.split(' ');
    
    // 3. Pega a última palavra do array.
    const lastWord = words[words.length - 1]; 
    
    // 4. Formata a última palavra (maiúsculas, 5 caracteres, sem especiais).
    const localPart = lastWord ? lastWord.toUpperCase().replace(/[^A-Z0-9]/gi, '').substring(0, 5) : ''; 
    // --- FIM DA ALTERAÇÃO ---

    const randomNum = Math.floor(100 + Math.random() * 900);
    const letras = "abcdefghijklmnopqrstuvwxyz";
    const caracteres = "!@#$%&*-";
    const letraAleatoria = letras.charAt(Math.floor(Math.random() * letras.length));
    const caracterAleatorio = caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    return `${userChar}-${localPart}-${randomNum}${letraAleatoria}${caracterAleatorio}`;
}

function updateTotalArea(talhoesListElement) {
    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    let total = 0;
    const selectedCheckboxes = talhoesListElement.querySelectorAll('input[name="talhoes"]:checked');
    selectedCheckboxes.forEach(checkbox => {
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
        formContainerDiv.innerHTML = `<p>Formulário não encontrado.</p>`;
        return;
    }

    let formHtml = `<form id="dynamicForm"><h2>${ACTIVITIES[activityKey]}</h2><input type="hidden" name="userName" value="${userName}"><input type="hidden" name="osId" value=""><p class="form-info-display">Registrando como: <strong>${userName || "N/A"}</strong></p><p class="form-info-display">ID da Ordem de Serviço: <strong id="displayedOsId">Aguardando local...</strong></p><label for="local">Local da Atividade: <span class="required">*</span></label><select id="local" name="local" required><option value="">Selecione o Local</option>`;
    for (const locationName in LOCATIONS_AND_FIELDS) {
        formHtml += `<option value="${locationName}">${locationName}</option>`;
    }
    formHtml += `</select><div id="talhoesSelection" style="display: none;"><label>Talhões (ha): <span class="required">*</span></label><div class="checkbox-group"><input type="checkbox" id="allTalhoes"><label for="allTalhoes">Todos</label></div><div id="talhoesList" class="talhoes-list"></div><div id="totalAreaDisplay" class="total-area-display">TOTAL (ha): 0.00</div></div>`;
    
    formFields.forEach(field => {
        const isRequired = field.name !== 'observacao' && !field.name.includes('Container') && !field.name.includes('Products') && !field.name.includes('Trucks');
        if (field.type === "textarea") {
            formHtml += `<label for="${field.name}">${field.label}:</label><textarea id="${field.name}" name="${field.name}"></textarea>`;
        } else if (field.name.includes('Container')) {
            formHtml += `<div id="${field.name}"></div>`;
        } else {
            // ALTERAÇÃO: Adicionado step="0.01" para campos numéricos
            const stepAttribute = field.type === 'number' ? 'step="0.01"' : '';
            formHtml += `<label for="${field.name}">${field.label}:${isRequired ? ' <span class="required">*</span>' : ''}</label><input type="${field.type}" id="${field.name}" name="${field.name}" ${stepAttribute} ${field.min ? `min="${field.min}"` : ''} ${field.max ? `max="${field.max}"` : ''} value="${field.type === 'number' ? '0' : ''}" ${isRequired ? 'required' : ''}>`;
        }
    });
    formHtml += `<button type="submit">Registrar Ordem de Serviço</button></form>`;
    formContainerDiv.innerHTML = formHtml;
    
    // Adiciona os listeners de eventos após o formulário ser renderizado
    const localSelect = document.getElementById('local');
    const allTalhoesCheckbox = document.getElementById('allTalhoes');
    const dynamicForm = document.getElementById('dynamicForm');
    
    localSelect.addEventListener('change', () => {
        const selectedLocation = localSelect.value;
        const osIdInput = dynamicForm.querySelector('input[name="osId"]');
        const displayedOsId = document.getElementById('displayedOsId');
        const talhoesSelectionDiv = document.getElementById('talhoesSelection');
        const talhoesListDiv = document.getElementById('talhoesList');
        if (selectedLocation) {
            renderTalhoesCheckboxes(selectedLocation, talhoesListDiv, allTalhoesCheckbox);
            talhoesSelectionDiv.style.display = 'block';
            updateTotalArea(talhoesListDiv);
            const newOsId = generateOsId(userName, selectedLocation);
            osIdInput.value = newOsId;
            displayedOsId.textContent = newOsId;
        } else {
            talhoesSelectionDiv.style.display = 'none';
            talhoesListDiv.innerHTML = '';
            updateTotalArea(talhoesListDiv);
            osIdInput.value = '';
            displayedOsId.textContent = 'Aguardando local...';
        }
    });
    
    const numProductsInput = document.getElementById('numProducts');
    if (numProductsInput) {
        numProductsInput.addEventListener('input', () => renderProductFields(parseInt(numProductsInput.value) || 0, document.getElementById('productsContainer'), activityKey));
    }

    // Listener para o número de caminhões na Colheita
    const numTrucksInput = document.getElementById('numTrucks');
    if (numTrucksInput) {
        numTrucksInput.addEventListener('input', () => renderTruckFields(parseInt(numTrucksInput.value) || 0, document.getElementById('trucksContainer')));
    }
    
    allTalhoesCheckbox.addEventListener('change', () => {
        const talhoesListDiv = document.getElementById('talhoesList');
        talhoesListDiv.querySelectorAll('input[name="talhoes"]').forEach(cb => { cb.checked = allTalhoesCheckbox.checked; });
        updateTotalArea(talhoesListDiv);
    });
    
    dynamicForm.addEventListener('submit', handleFormSubmit);
}

function renderProductFields(num, container, activityKey) {
    container.innerHTML = '';
    const productLabel = activityKey === "Plantio" ? "Insumo" : "Produto";
    for (let i = 1; i <= num; i++) {
        container.innerHTML += `<div class="product-group"><h3>${productLabel} ${i}</h3><label for="product_name_${i}">${productLabel} ${i} Nome:<span class="required">*</span></label><input type="text" id="product_name_${i}" name="product_name_${i}" required><label for="product_dosage_${i}">${productLabel} ${i} Dosagem:<span class="required">*</span></label><input type="text" id="product_dosage_${i}" name="product_dosage_${i}" required></div>`;
    }
}

// Nova função para renderizar campos de caminhão e motorista
function renderTruckFields(num, container) {
    container.innerHTML = '';
    for (let i = 1; i <= num; i++) {
        container.innerHTML += `<div class="truck-group"><h3>Caminhão ${i}</h3><label for="truck_id_${i}">Identificação Caminhão ${i}:<span class="required">*</span></label><input type="text" id="truck_id_${i}" name="truck_id_${i}" required><label for="truck_driver_${i}">Motorista(s) Caminhão ${i}:<span class="required">*</span></label><input type="text" id="truck_driver_${i}" name="truck_driver_${i}" required></div>`;
    }
}

function renderTalhoesCheckboxes(locationName, talhoesListElement, allTalhoesCheckboxElement) {
    talhoesListElement.innerHTML = '';
    const talhoes = LOCATIONS_AND_FIELDS[locationName];
    if (talhoes) {
        for (const talhaoName in talhoes) {
            const area = talhoes[talhaoName];
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="talhao-${talhaoName.replace(/\s+/g, '-')}" name="talhoes" value="${talhaoName} (${area} ha)"><label for="talhao-${talhaoName.replace(/\s+/g, '-')}">${talhaoName} (${area} ha)</label>`;
            div.querySelector('input').addEventListener('change', () => updateTotalArea(talhoesListElement));
            talhoesListElement.appendChild(div);
        }
    }
    allTalhoesCheckboxElement.checked = false;
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const data = { activity: currentActivityKey, userName: userName };
    for (let pair of formData.entries()) { data[pair[0]] = pair[1]; }
    
    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    if (totalAreaDisplay) data.areaTotalHectares = totalAreaDisplay.textContent.replace('TOTAL (ha):', '').trim();
    
    const finalSelectedTalhoes = [];
    form.querySelectorAll('input[name="talhoes"]:checked').forEach(cb => finalSelectedTalhoes.push(cb.value));
    data.talhoes = finalSelectedTalhoes.join('; ');

    const numProducts = parseInt(formData.get('numProducts') || '0', 10);
    for (let i = 1; i <= MAX_PRODUCTS; i++) {
        data[`nome_produto_${i}`] = (i <= numProducts) ? (formData.get(`product_name_${i}`) || "") : "";
        data[`dose_produto_${i}`] = (i <= numProducts) ? (formData.get(`product_dosage_${i}`) || "") : "";
    }

    // Coleta dados de caminhões e motoristas
    if (currentActivityKey === "Colheita") {
        const numTrucks = parseInt(formData.get('numTrucks') || '0', 10);
        for (let i = 1; i <= MAX_PRODUCTS; i++) { // Reutilizando MAX_PRODUCTS como um limite razoável
            data[`identificacao_caminhao_${i}`] = (i <= numTrucks) ? (formData.get(`truck_id_${i}`) || "") : "";
            data[`motorista_caminhao_${i}`] = (i <= numTrucks) ? (formData.get(`truck_driver_${i}`) || "") : "";
        }
    }

    showNotification('Enviando dados e criando OS...', true);

    if (navigator.onLine) {
        const result = await sendDataToServer(data);
        if (result.success) {
            const successMessage = `OS registrada com sucesso! ✅ <br>
                <a href="${result.pdfUrl}" target="_blank">Abrir PDF da OS</a><br>
                <a href="${result.folderUrl}" target="_blank">Ver Pasta de Ordens de Serviço</a>`;
            showNotification(successMessage, false);
            
            form.reset();
            if (document.getElementById('talhoesList')) {
                updateTotalArea(document.getElementById('talhoesList'));
            }
            // Limpa os campos dinâmicos de produtos/caminhões
            if (document.getElementById('productsContainer')) {
                document.getElementById('productsContainer').innerHTML = '';
            }
            if (document.getElementById('trucksContainer')) {
                document.getElementById('trucksContainer').innerHTML = '';
            }
            
            modalContent.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    setTimeout(() => {
                        hideNotification();
                        showActivitySelection();
                    }, 200);
                });
            });

        } else {
             await saveDataLocally({ data });
             showNotification(`Falha ao enviar: ${result.message}. Dados salvos localmente. 💾`, false);
        }
    } else {
        await saveDataLocally({ data });
        showNotification(`Offline. Dados salvos localmente para sincronização. 💾`, false);
        form.reset();
        if (document.getElementById('talhoesList')) {
            updateTotalArea(document.getElementById('talhoesList'));
        }
        // Limpa os campos dinâmicos de produtos/caminhões
        if (document.getElementById('productsContainer')) {
            document.getElementById('productsContainer').innerHTML = '';
        }
        if (document.getElementById('trucksContainer')) {
            document.getElementById('trucksContainer').innerHTML = '';
        }
    }

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-os-data'));
    }
}

function updateConnectionStatus() {
    const statusEl = document.getElementById("connectionStatus");
    statusEl.className = "status-message";
    if (navigator.onLine) {
        statusEl.textContent = "Status: Online";
        statusEl.classList.add("status-online");
    } else {
        statusEl.textContent = "Status: Offline";
        statusEl.classList.add("status-offline");
    }
}

function getOrSetUserName() {
    userName = localStorage.getItem("userName");
    if (!userName) {
        let inputName = prompt("Olá! Por favor, digite seu nome para registrar as ordens de serviço:");
        userName = (inputName && inputName.trim()) ? inputName.trim() : "Usuário Anônimo";
        localStorage.setItem("userName", userName);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    getOrSetUserName();
    await openDatabase();
    renderActivityButtons();
    showActivitySelection();
    updateConnectionStatus();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'SYNC_PENDING_DATA') attemptSync();
        });
    }

    window.addEventListener('online', () => {
        updateConnectionStatus();
        attemptSync();
    });
    window.addEventListener('offline', updateConnectionStatus);
    backToActivitiesBtn.addEventListener('click', () => {
        hideNotification();
        showActivitySelection();
    });

    if (navigator.onLine) {
        attemptSync();
    }
    
    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) {
            // Só fecha se a mensagem não for de "enviando"
            if (!modalContent.classList.contains('pulsing')) {
                hideNotification();
            }
        }
    });
});