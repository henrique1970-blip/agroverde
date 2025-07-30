// ATENÇÃO: Cole aqui a URL do App da Web da sua planilha de "Ordem de Serviço"
const osAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

// ATENÇÃO: COLE AQUI A URL DE IMPLANTAÇÃO DO SEU NOVO APPS SCRIPT DE RELATÓRIO
const reportAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbxCQBDKLxf4imFLK4Mnns_xKzHQ8f7jc6ognFFHf5UY-3_jH5cLxzcxTYpx_S7oEwXk/exec';

let userName = '';
let selectedActivityKey = '';
let currentOsDetails = {};

// --- Bloco de funcionalidade offline ---
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
// --- Fim do bloco offline ---

const ACTIVITIES = {
    "PreparodeArea": "Preparo de Área",
    "TratamentodeSementes": "Tratamento de Sementes",
    "Plantio": "Plantio",
    "Pulverizacao": "Pulverização",
    "Colheita": "Colheita",
    "Lancas": "Lanças"
};

const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const osIdRadioContainer = document.getElementById('osIdRadioContainer');
const operationIdDisplay = document.getElementById('operationIdDisplay');
const osDetailsContainer = document.getElementById('osDetailsContainer');
const preparoAreaReportFieldsDiv = document.getElementById('preparoAreaReportFields');
const numAbastecimentosInput = document.getElementById('numAbastecimentos');
const abastecimentosContainer = document.getElementById('abastecimentosContainer');
const addAbastecimentoFieldsBtn = document.getElementById('addAbastecimentoFields');
const submitReportButton = document.getElementById('submitReportButton');
const activityTitleSpan = document.getElementById('activityTitle');
const currentUserSpan = document.getElementById('currentUser');

function showActivitySelection() {
    activitySelectionDiv.style.display = 'grid';
    formContainerDiv.style.display = 'none';
    osIdRadioContainer.innerHTML = '';
    osDetailsContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    submitReportButton.style.display = 'none';
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
    const ongoingButton = document.createElement('button');
    ongoingButton.id = 'ongoingOperations';
    ongoingButton.textContent = 'Operação em andamento';
    activitySelectionDiv.appendChild(ongoingButton);
}

async function renderOsSelectionForm(activityKey) {
    showForm();
    activityTitleSpan.textContent = ACTIVITIES[activityKey];
    osIdRadioContainer.innerHTML = `<p class="loading-message">Carregando Ordens de Serviço...</p>`;
    osDetailsContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    submitReportButton.style.display = 'none';
    try {
        const response = await fetch(`${osAppsScriptUrl}?activity=${activityKey}`);
        const osIds = await response.json();
        if (osIds.error) throw new Error(osIds.error);
        if (osIds.length === 0) {
            osIdRadioContainer.innerHTML = `<p class="error-message">Nenhuma Ordem de Serviço encontrada para esta atividade.</p>`;
            return;
        }
        osIdRadioContainer.innerHTML = osIds.map((id, index) => `
            <div class="radio-item">
                <input type="radio" id="os_${index}" name="osIdRadio" value="${id}">
                <label for="os_${index}">${id}</label>
            </div>`).join('');
        osIdRadioContainer.addEventListener('change', async (event) => {
            if (event.target.name === 'osIdRadio') {
                const selectedOsId = event.target.value;
                operationIdDisplay.textContent = `${selectedOsId}-OP`;
                await fetchAndDisplayOsData(selectedOsId);
            }
        });
    } catch (error) {
        osIdRadioContainer.innerHTML = `<p class="error-message">Erro ao carregar Ordens de Serviço: ${error.message}</p>`;
    }
}

function formatClientDate(dateInput) {
    if (!dateInput) return '';
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return dateInput;
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateInput;
    }
}

async function fetchAndDisplayOsData(osId) {
    osDetailsContainer.innerHTML = `<p class="loading-message">Buscando detalhes da OS...</p>`;
    preparoAreaReportFieldsDiv.style.display = 'none';
    submitReportButton.style.display = 'none';
    try {
        const encodedOsId = encodeURIComponent(osId);
        const response = await fetch(`${osAppsScriptUrl}?activity=${selectedActivityKey}&osId=${encodedOsId}`);
        const osDetails = await response.json();
        if (osDetails.error) throw new Error(osDetails.error);
        currentOsDetails = osDetails;
        const fieldsToExclude = ["Timestamp", "Nome do Usuário", "ID da OS"];
        let tableHtml = `<div class="os-data-container"><h4>Confirme os dados da Operação:</h4><div class="os-data-grid"><div class="grid-header">Item</div><div class="grid-header">Dados da OS</div><div class="grid-header center">Sim</div><div class="grid-header center">Não</div><div class="grid-header" style="color: grey;">Realizado/Usado</div>`;
        for (const key in osDetails) {
            if (fieldsToExclude.includes(key) || osDetails[key] === null || osDetails[key] === undefined || String(osDetails[key]).trim() === '') continue;
            let value = osDetails[key];
            if (key === "Data de Inicio" || key === "Data de Termino") value = formatClientDate(value);
            const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
            tableHtml += `<div class="grid-item"><strong>${key}</strong></div><div class="grid-item">${value}</div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="sim" checked></div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="nao"></div><div class="grid-item"><input type="text" id="realizado_${cleanKey}" value="${value}" disabled></div>`;
        }
        tableHtml += `</div></div>`;
        osDetailsContainer.innerHTML = tableHtml;
        const dataGrid = osDetailsContainer.querySelector('.os-data-grid');
        if (dataGrid) {
            dataGrid.addEventListener('change', (event) => {
                if (event.target.type === 'radio') {
                    const cleanKey = event.target.name.replace('confirm_', '');
                    const realizadoInput = document.getElementById(`realizado_${cleanKey}`);
                    if (realizadoInput) realizadoInput.disabled = event.target.value !== 'nao';
                }
            });
        }
        if (selectedActivityKey === "PreparodeArea") {
            preparoAreaReportFieldsDiv.style.display = 'block';
            generateAbastecimentoFields(numAbastecimentosInput.value, abastecimentosContainer);
        } else {
            preparoAreaReportFieldsDiv.style.display = 'none';
        }
        submitReportButton.style.display = 'block';
    } catch (error) {
        osDetailsContainer.innerHTML = `<p class="error-message">Erro ao buscar detalhes da OS: ${error.message}</p>`;
    }
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

// --- Modal de sucesso ---
function showSuccessModal(pdfUrl, folderUrl) {
    const modal = document.getElementById('successModal');
    const pdfLink = document.getElementById('pdfLink');
    const folderLink = document.getElementById('folderLink');
    const closeButton = modal.querySelector('.close-button');
    pdfLink.href = pdfUrl;
    folderLink.href = folderUrl;
    modal.style.display = 'flex';
    const closeModal = () => {
        modal.style.display = 'none';
        showActivitySelection();
    };
    closeButton.onclick = closeModal;
    window.onclick = (event) => {
        if (event.target == modal) closeModal();
    };
}

// --- Função de Envio Principal ---
async function submitReport() {
    const reportData = {
        activity: selectedActivityKey,
        userName: userName,
        osId: currentOsDetails['ID da OS'],
        local: currentOsDetails['Local'],
        talhoes: currentOsDetails['Talhoes (Area)'],
        areaTotalHectares: currentOsDetails['Área Total (ha)'],
        dataInicio: currentOsDetails['Data de Inicio'],
        dataTermino: currentOsDetails['Data de Termino'],
        trator: currentOsDetails['Trator'] || '',
        operadores: currentOsDetails['Operador(es)'] || currentOsDetails['Operadores'] || '',
        implemento: currentOsDetails['Implemento'] || '',
        observacao: currentOsDetails['Observacao'] || '',
        horimetroInicio: document.getElementById('horimetroInicio')?.value,
        horimetroFim: document.getElementById('horimetroFim')?.value,
        paradasImprevistas: document.getElementById('paradasImprevistas')?.value,
        numAbastecimentos: document.getElementById('numAbastecimentos')?.value,
        observacoesRelatorio: document.getElementById('observacoesRelatorio')?.value,
    };
    const numAbastecimentos = parseInt(reportData.numAbastecimentos);
    if (selectedActivityKey === "PreparodeArea" && numAbastecimentos > 0) {
        for (let i = 1; i <= numAbastecimentos; i++) {
            reportData[`abastecimento_horimetro_${i}`] = document.getElementById(`abastecimento_horimetro_${i}`)?.value || '';
            reportData[`abastecimento_litros_${i}`] = document.getElementById(`abastecimento_litros_${i}`)?.value || '';
        }
    }
    if (selectedActivityKey === "PreparodeArea") {
        if (!reportData.horimetroInicio || !reportData.horimetroFim) {
            alert('Por favor, preencha o Horímetro Início e Fim da Operação.');
            return;
        }
        if (parseFloat(reportData.horimetroFim) < parseFloat(reportData.horimetroInicio)) {
            alert('O Horímetro Fim da Operação não pode ser menor que o Horímetro Início da Operação.');
            return;
        }
    }
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.style.display = 'flex';
    submitReportButton.disabled = true;
    submitReportButton.textContent = 'Enviando...';
    try {
        const response = await fetch(reportAppsScriptUrl, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(reportData).toString()
        });
        const result = await response.json();
        if (result.success && result.pdfUrl && result.folderUrl) {
            showSuccessModal(result.pdfUrl, result.folderUrl);
        } else if (result.success) {
            alert('Relatório enviado com sucesso, mas o link do PDF não foi gerado.');
            showActivitySelection();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.warn('Falha ao enviar. Salvando relatório offline.', error);
        await saveReportOffline(reportData);
    } finally {
        loadingOverlay.style.display = 'none';
        submitReportButton.disabled = false;
        submitReportButton.textContent = 'Enviar Relatório de Operação';
    }
}

// --- Funções de Sincronização e Armazenamento Offline ---
async function saveReportOffline(reportData) {
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        await store.add(reportData);
        alert('Você está offline. O relatório foi salvo e será enviado assim que a conexão for restabelecida.');
        showActivitySelection();
        await registerBackgroundSync();
    } catch (dbError) {
        console.error('Não foi possível salvar o relatório offline:', dbError);
        alert('Erro: Não foi possível salvar o relatório para envio posterior.');
    }
}

async function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const sw = await navigator.serviceWorker.ready;
            await sw.sync.register(SYNC_TAG);
            console.log('Sincronização em segundo plano registrada com a tag:', SYNC_TAG);
        } catch (syncError) {
            console.error('Não foi possível registrar a sincronização em segundo plano:', syncError);
        }
    }
}

async function syncPendingReports() {
    console.log('Tentando sincronizar relatórios pendentes...');
    try {
        const db = await openDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const pendingReports = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        if (pendingReports.length === 0) {
            console.log('Nenhum relatório pendente para sincronizar.');
            return;
        }
        console.log(`Enviando ${pendingReports.length} relatório(s) pendente(s).`);
        for (const report of pendingReports) {
            try {
                const response = await fetch(reportAppsScriptUrl, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams(report).toString()
                });
                const result = await response.json();
                if (result.success) {
                    console.log(`Relatório ID (offline) ${report.id} enviado com sucesso.`);
                    const deleteTransaction = db.transaction(STORE_NAME, 'readwrite');
                    await deleteTransaction.objectStore(STORE_NAME).delete(report.id);
                } else {
                    console.error(`Falha ao enviar relatório ID ${report.id}:`, result.message);
                }
            } catch (fetchError) {
                console.error(`Erro de rede ao tentar enviar o relatório ID ${report.id}. Tentará novamente mais tarde.`, fetchError);
                break;
            }
        }
    } catch (dbError) {
        console.error('Erro ao acessar o IndexedDB para sincronização:', dbError);
    }
}

function getOrSetUserName() {
    userName = localStorage.getItem("userName");
    while (!userName || userName.trim() === "") {
        let inputName = prompt("Olá! Por favor, digite seu nome para registrar as operações:");
        if (inputName && inputName.trim() !== "") {
            userName = inputName.trim();
            localStorage.setItem("userName", userName);
        } else {
            alert("A identificação é obrigatória para continuar.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    getOrSetUserName();
    renderActivityButtons();
    showActivitySelection();
    backToActivitiesBtn.addEventListener('click', showActivitySelection);
    submitReportButton.addEventListener('click', submitReport);
    addAbastecimentoFieldsBtn.addEventListener('click', () => generateAbastecimentoFields(numAbastecimentosInput.value, abastecimentosContainer));
    
    // --- Ativadores de Sincronização ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'SYNC_PENDING_REPORTS') {
                syncPendingReports();
            }
        });
    }
    syncPendingReports();
    window.addEventListener('online', syncPendingReports);
});