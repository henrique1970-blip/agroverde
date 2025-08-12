// ATENÇÃO: Cole aqui a URL do App da Web da sua planilha de "Ordem de Serviço"
const osAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

// ATENÇÃO: COLE AQUI A URL DE IMPLANTAÇÃO DO SEU NOVO APPS SCRIPT DE RELATÓRIO
const reportAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbxCQBDKLxf4imFLK4Mnns_xKzHQ8f7jc6ognFFHf5UY-3_jH5cLxzcxTYpx_S7oEwXk/exec';

let userName = '';
let selectedActivityKey = '';
let currentOsDetails = {};

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

async function fetchAndDisplayOsData(osId) {
    osDetailsContainer.innerHTML = `<p class="loading-message">Buscando detalhes da OS...</p>`;
    document.getElementById('observacoesRelatorio').value = '';

    try {
        const response = await fetch(`${osAppsScriptUrl}?activity=${selectedActivityKey}&osId=${encodeURIComponent(osId)}`);
        const osDetails = await response.json();
        if (osDetails.error) throw new Error(osDetails.error);
        currentOsDetails = osDetails;

        const fieldsToExclude = ["Timestamp", "Nome do Usuário", "ID da OS"];
        let tableHtml = `<div class="os-data-container"><h4>Confirme os dados da Operação:</h4><div class="os-data-grid"><div class="grid-header">Item</div><div class="grid-header">Dados da OS</div><div class="grid-header center">Sim</div><div class="grid-header center">Não</div><div class="grid-header" style="color: grey;">Realizado/Usado</div>`;

        for (const key in osDetails) {
            if (fieldsToExclude.includes(key) || key.toLowerCase().includes('observa') || !osDetails[key]) continue;
            const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
            const value = (key.includes("Data")) ? formatClientDate(osDetails[key]) : osDetails[key];
            tableHtml += `<div class="grid-item"><strong>${key}</strong></div><div class="grid-item">${value}</div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="sim" checked></div><div class="grid-item center"><input type="radio" name="confirm_${cleanKey}" value="nao"></div><div class="grid-item"><input type="text" id="realizado_${cleanKey}" value="${osDetails[key]}" disabled></div>`;
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

        if (selectedActivityKey === "PreparodeArea") {
            preparoAreaReportFieldsDiv.style.display = 'block';
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

        submitReportButton.style.display = 'block';
    } catch (error) {
        osDetailsContainer.innerHTML = `<p class="error-message">Erro ao buscar detalhes: ${error.message}</p>`;
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

async function submitReport() {
    const reportData = {
        activity: selectedActivityKey,
        userName: userName,
        osId: currentOsDetails['ID da OS'],
        horimetroInicio: document.getElementById('horimetroInicio')?.value || '',
        horimetroFim: document.getElementById('horimetroFim')?.value || '',
        paradasImprevistas: document.getElementById('paradasImprevistas')?.value || '',
        numAbastecimentos: document.getElementById('numAbastecimentos')?.value || '',
    };

    for (const key in currentOsDetails) {
        if (["Timestamp", "Nome do Usuário", "ID da OS"].includes(key)) continue;
        const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
        const realizadoInput = document.getElementById(`realizado_${cleanKey}`);
        
        reportData[cleanKey] = currentOsDetails[key];
        if (realizadoInput) {
             reportData[`realizado_${cleanKey}`] = realizadoInput.disabled ? currentOsDetails[key] : realizadoInput.value;
        } else if(key.toLowerCase().includes('observa')) {
            reportData[cleanKey] = currentOsDetails[key];
        }
    }
    
    reportData.observacao = document.getElementById('observacoesRelatorio')?.value || '';

    // --- LÓGICA DE COLETA DOS DADOS DE ABASTECIMENTO RESTAURADA ---
    if (selectedActivityKey === "PreparodeArea") {
        const numAbastecimentos = parseInt(reportData.numAbastecimentos);
        if (numAbastecimentos > 0) {
            for (let i = 1; i <= numAbastecimentos; i++) {
                reportData[`abastecimento_horimetro_${i}`] = document.getElementById(`abastecimento_horimetro_${i}`)?.value || '';
                reportData[`abastecimento_litros_${i}`] = document.getElementById(`abastecimento_litros_${i}`)?.value || '';
            }
        }

        if (!reportData.horimetroInicio || !reportData.horimetroFim) {
            return alert('Preencha o Horímetro Início e Fim.');
        }
        if (parseFloat(reportData.horimetroFim) < parseFloat(reportData.horimetroInicio)) {
            return alert('Horímetro Fim não pode ser menor que o Início.');
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
    addAbastecimentoFieldsBtn.addEventListener('click', () => generateAbastecimentoFields(numAbastecimentosInput.value, abastecimentosContainer));
});