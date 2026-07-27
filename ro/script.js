/* =========================================================================
 * Relatório de Operações — Fazenda Agro Verde
 *
 * Mudanças desta versão:
 *  - carregamento: cache stale-while-revalidate das OS (a tela abre com os
 *    dados da última visita e se atualiza sozinha), timeout e cancelamento
 *    de requisições, logo servida como imagem em vez de 92 KB de base64;
 *  - offline: o service worker passou a ser REGISTRADO (não era), a fila de
 *    envios pendentes é reprocessada sozinha e as OS ficam disponíveis para
 *    preencher relatórios sem sinal;
 *  - edição: relatórios já enviados podem ser consultados e corrigidos.
 * ========================================================================= */

// ATENÇÃO: URL do App da Web da planilha de "Ordem de Serviço"
const osAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

// ATENÇÃO: URL de implantação do Apps Script de Relatório
const reportAppsScriptUrl = 'https://script.google.com/macros/s/AKfycbznEdqNDvPH34VOE6EQ510BUkk3s5NtZyN8KRMKaCns--qerlsupNlUaQdil1tPdK5R/exec';

const GET_TIMEOUT_MS = 25000;      // consultas
const SUBMIT_TIMEOUT_MS = 180000;  // envio + geração do PDF no servidor
const OS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let userName = '';
let selectedActivityKey = '';
let currentOsDetails = {};
let currentIrrigationData = { isUpdate: false, originalId: '' };
let editingReport = null;   // { reportId, rowIndex, timestamp } quando editando
let appMode = 'novo';       // 'novo' | 'consulta'

// CORREÇÃO: O mapa de chaves foi expandido para garantir que todos os cabeçalhos,
// especialmente aqueles com acentos ou variações, sejam padronizados corretamente
// antes do envio. Isso resolve a raiz dos problemas de campos em branco.
const keyMap = {
    // Genéricos que podem ter acento/variação
    'Observacao':                  'Observacao',
    'Observação':                  'Observacao',
    'Trator':                      'Trator',
    'Área Total (ha)':             'reaTotalha',
    'Data de Inicio':              'DatadeInicio',
    'Data de Início':              'DatadeInicio',
    'Data de Término':             'DatadeTermino',
    'Data de Termino':             'DatadeTermino',
    'Talhões (Area)':              'TalhoesArea',
    'Talhoes (Area)':              'TalhoesArea',
    'Operador(es)':                'Operadores',
    // Pulverização & Lanças
    'Produto(s) e quantidade/ha':  'produtosQuantidade',
    'Produtos e quantidade/ha':    'produtosQuantidade',
    'Produtos e quantidades':      'produtosQuantidade',
    'Quantidade de produto/hectare': 'produtosQuantidade',
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

const ACTIVITIES = {
    "PreparodeArea": "Preparo de Área",
    "TratamentodeSementes": "Tratamento de Sementes",
    "Plantio": "Plantio",
    "Pulverizacao": "Pulverização",
    "Colheita": "Colheita",
    "Lancas": "Lanças",
    "Irrigacao": "Irrigação"
};

const SIMPLE_ACTIVITIES = ["PreparodeArea", "Plantio", "Pulverizacao", "Lancas"];


/* =========================================================================
 * 1. IndexedDB — fila de envios pendentes + cache das OS
 * ========================================================================= */

const DB_NAME = 'reportAgroDB';
const DB_VERSION = 2;
const STORE_PENDING = 'pendingReports';
const STORE_CACHE = 'osCache';
const SYNC_TAG = 'sync-report-data';

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_PENDING)) {
                db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains(STORE_CACHE)) {
                db.createObjectStore(STORE_CACHE, { keyPath: 'key' });
            }
        };
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
    return dbPromise;
}

// Envolve um IDBRequest numa Promise. O código antigo usava `await tx.done`,
// que não existe na API nativa — o await resolvia na hora e a transação podia
// nem ter sido gravada quando o "salvo com sucesso" aparecia na tela.
function idbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function idbTransactionDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transação abortada'));
    });
}

async function idbPut(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const result = idbRequest(tx.objectStore(storeName).put(value));
    await idbTransactionDone(tx);
    return result;
}

async function idbAdd(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const key = await idbRequest(tx.objectStore(storeName).add(value));
    await idbTransactionDone(tx);
    return key;
}

async function idbGet(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).get(key));
}

async function idbGetAll(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    return idbRequest(tx.objectStore(storeName).getAll());
}

async function idbDelete(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    idbRequest(tx.objectStore(storeName).delete(key));
    await idbTransactionDone(tx);
}


/* =========================================================================
 * 2. Rede — timeout, cancelamento e cache stale-while-revalidate
 * ========================================================================= */

const inFlight = new Map();   // evita disparar a mesma consulta duas vezes
const memoryCache = new Map();

async function apiFetch(url, options = {}, timeoutMs = GET_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload && payload.error && payload.error !== false) {
            throw new Error(payload.message || String(payload.error));
        }
        return payload;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('A conexão demorou demais para responder.');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

async function readCache(key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    try {
        const entry = await idbGet(STORE_CACHE, key);
        if (entry) memoryCache.set(key, entry);
        return entry || null;
    } catch (e) {
        return null;
    }
}

async function writeCache(key, data) {
    const entry = { key, data, savedAt: Date.now() };
    memoryCache.set(key, entry);
    try { await idbPut(STORE_CACHE, entry); } catch (e) { /* cota cheia: ignora */ }
}

/**
 * Entrega o valor do cache imediatamente (se houver) e, em paralelo, revalida
 * na rede. `onData(data, origem)` é chamado uma vez por origem — por isso a
 * lista de OS aparece na hora e se corrige sozinha alguns segundos depois.
 */
async function fetchWithCache(key, url, onData) {
    const cached = await readCache(key);
    let servedFromCache = false;

    if (cached) {
        servedFromCache = true;
        onData(cached.data, 'cache');
    }

    const fresh = inFlight.get(key) || apiFetch(url).finally(() => inFlight.delete(key));
    inFlight.set(key, fresh);

    try {
        const data = await fresh;
        await writeCache(key, data);
        if (!servedFromCache || JSON.stringify(data) !== JSON.stringify(cached.data)) {
            onData(data, 'rede');
        }
        return data;
    } catch (error) {
        if (servedFromCache) {
            // Já mostramos algo útil; só avisa que os dados podem estar velhos.
            const idade = Math.round((Date.now() - cached.savedAt) / 60000);
            onData(cached.data, 'cache-stale', idade);
            return cached.data;
        }
        throw error;
    }
}


/* =========================================================================
 * 3. Referências de DOM
 * ========================================================================= */

const activitySelectionDiv = document.getElementById('activitySelection');
const activityButtonsDiv = document.getElementById('activityButtons');
const modeHint = document.getElementById('modeHint');
const reportListContainer = document.getElementById('reportListContainer');
const reportListTitle = document.getElementById('reportListTitle');
const reportListResults = document.getElementById('reportListResults');
const formContainerDiv = document.getElementById('formContainer');
const irrigationContainer = document.getElementById('irrigationContainer');
const backToActivitiesBtn = document.getElementById('backToActivities');
const backFromReportListBtn = document.getElementById('backFromReportList');
const osSelectionBlock = document.getElementById('osSelectionBlock');
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
const editingNotice = document.getElementById('editingNotice');
const irrigationChoiceContainer = document.getElementById('irrigationChoiceContainer');
const irrigationFormContainer = document.getElementById('irrigationFormContainer');
const backToActivitiesFromIrrigationBtn = document.getElementById('backToActivitiesFromIrrigation');
const backToIrrigationChoiceBtn = document.getElementById('backToIrrigationChoice');
const offlineBanner = document.getElementById('offlineBanner');
const pendingBanner = document.getElementById('pendingBanner');
const pendingBannerText = document.getElementById('pendingBannerText');
const syncNowButton = document.getElementById('syncNowButton');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const loadingHint = document.getElementById('loadingHint');

const SCREENS = ['activitySelection', 'reportListContainer', 'formContainer', 'irrigationContainer'];

function showScreen(screenId) {
    SCREENS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const screenToShow = document.getElementById(screenId);
    if (screenToShow) screenToShow.style.display = 'block';
    window.scrollTo(0, 0);
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/* =========================================================================
 * 4. Telas iniciais
 * ========================================================================= */

function showActivitySelection() {
    editingReport = null;
    currentOsDetails = {};
    showScreen('activitySelection');
    osIdRadioContainer.innerHTML = '';
    osDetailsContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    harvestEquipmentSelectionContainer.innerHTML = '';
    submitReportButton.style.display = 'none';
    submitReportButton.textContent = 'Enviar Relatório de Operação';
    editingNotice.hidden = true;
    osSelectionBlock.style.display = 'block';
}

function setMode(mode) {
    appMode = mode;
    document.querySelectorAll('.mode-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    modeHint.textContent = mode === 'novo'
        ? 'Escolha a atividade para registrar um novo relatório.'
        : 'Escolha a atividade para consultar ou corrigir um relatório já enviado.';
}

function renderActivityButtons() {
    activityButtonsDiv.innerHTML = '';
    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'activity-button';
        button.textContent = ACTIVITIES[key];

        if (key === "Irrigacao") {
            button.classList.add('full-width', 'orange-button');
        }

        button.addEventListener('click', () => {
            selectedActivityKey = key;
            editingReport = null;
            if (key === "Irrigacao") {
                showScreen('irrigationContainer');
                showIrrigationChoice(appMode === 'consulta');
            } else if (appMode === 'consulta') {
                openReportList(key);
            } else {
                showScreen('formContainer');
                renderOsSelectionForm(key);
            }
        });
        activityButtonsDiv.appendChild(button);
    }
}


/* =========================================================================
 * 5. Fluxo "Nova operação"
 * ========================================================================= */

async function renderOsSelectionForm(activityKey) {
    showScreen('formContainer');
    activityTitleSpan.textContent = ACTIVITIES[activityKey];
    currentUserSpan.textContent = userName;
    editingNotice.hidden = true;
    osSelectionBlock.style.display = 'block';
    osIdRadioContainer.innerHTML = `<p class="loading-message">Carregando Ordens de Serviço...</p>`;
    osDetailsContainer.innerHTML = '';
    operationIdDisplay.textContent = '';
    harvestEquipmentSelectionContainer.innerHTML = '';
    preparoAreaReportFieldsDiv.innerHTML = '';
    preparoAreaReportFieldsDiv.style.display = 'none';
    observacoesRelatorioContainer.style.display = 'none';
    submitReportButton.style.display = 'none';

    try {
        await fetchWithCache(
            `osIds:${activityKey}`,
            `${osAppsScriptUrl}?activity=${encodeURIComponent(activityKey)}`,
            (osIds, origin, idadeMin) => renderOsIdList(osIds, origin, idadeMin)
        );
    } catch (error) {
        osIdRadioContainer.innerHTML = `<p class="error-message">Erro ao carregar OS: ${escapeHtml(error.message)}${
            navigator.onLine ? '' : '<br>Você está sem conexão e esta atividade ainda não foi aberta neste aparelho.'
        }</p>`;
    }
}

function renderOsIdList(osIds, origin, idadeMin) {
    if (!Array.isArray(osIds) || osIds.length === 0) {
        osIdRadioContainer.innerHTML = `<p class="error-message">Nenhuma OS encontrada para esta atividade.</p>`;
        return;
    }

    // Preserva a escolha do usuário quando a revalidação chega depois.
    const selecionado = osIdRadioContainer.querySelector('input[name="osIdRadio"]:checked');
    const valorSelecionado = selecionado ? selecionado.value : null;

    let aviso = '';
    if (origin === 'cache') aviso = `<p class="loading-message">Lista salva no aparelho — atualizando...</p>`;
    if (origin === 'cache-stale') aviso = `<p class="info-message">Sem conexão. Lista de ${idadeMin} min atrás.</p>`;

    osIdRadioContainer.innerHTML = aviso + osIds.map((id, index) => `
        <div class="radio-item">
            <input type="radio" id="os_${index}" name="osIdRadio" value="${escapeHtml(id)}"${
                String(id) === valorSelecionado ? ' checked' : ''}>
            <label for="os_${index}">${escapeHtml(id)}</label>
        </div>`).join('');
}

// Um único listener delegado, registrado uma vez — antes um novo era somado ao
// container a cada troca de atividade, disparando N buscas para um clique só.
osIdRadioContainer.addEventListener('change', event => {
    if (event.target.name === 'osIdRadio') {
        operationIdDisplay.textContent = `${event.target.value}-OP`;
        fetchAndDisplayOsData(event.target.value);
    }
});

function formatClientDate(dateInput) {
    if (!dateInput) return '';
    // Datas que voltam da edição já vêm em dd/MM/yyyy. Passá-las por
    // new Date() as leria como MM/dd/yyyy — 12/08 viraria 8 de dezembro.
    if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput.trim())) {
        return dateInput.trim();
    }
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

const NUMERIC_OS_KEYS = ["Área Total (ha)", "Capacidade do tanque", "Vazão (L/ha)", "Pressão",
                         "Dose/ha", "Dose/tanque", "Vazão", "Pressao", "Vazao (L/ha)"];

/** Monta a grade "Confirme os dados da Operação". Usada tanto no fluxo novo
 *  quanto na edição, para que as duas telas nunca divirjam. */
function renderOsDataGrid(osDetails) {
    const fieldsToExclude = ["Timestamp", "Nome do Usuário", "ID da OS"];
    let tableHtml = `<div class="os-data-container"><h4>Confirme os dados da Operação:</h4>` +
        `<div class="os-data-grid">` +
        `<div class="grid-header">Item</div><div class="grid-header">Dados da OS</div>` +
        `<div class="grid-header center">Sim</div><div class="grid-header center">Não</div>` +
        `<div class="grid-header" style="color: grey;">Realizado/Usado</div>`;

    for (const key in osDetails) {
        if (fieldsToExclude.includes(key) || key.toLowerCase().includes('observa') || !osDetails[key]) continue;

        const cleanKey = keyMap[key] || key.replace(/[^a-zA-Z0-9]/g, '');
        const isDate = key.includes("Data");
        const value = isDate ? formatClientDate(osDetails[key])
                    : (NUMERIC_OS_KEYS.includes(key) ? formatClientNumber(osDetails[key]) : osDetails[key]);

        tableHtml +=
            `<div class="grid-item" data-label="Item"><strong>${escapeHtml(key)}</strong></div>` +
            `<div class="grid-item" data-label="Dados da OS">${escapeHtml(value)}</div>` +
            `<div class="grid-item center" data-label="Sim"><input type="radio" name="confirm_${cleanKey}" value="sim" checked></div>` +
            `<div class="grid-item center" data-label="Não"><input type="radio" name="confirm_${cleanKey}" value="nao"></div>` +
            `<div class="grid-item" data-label="Realizado/Usado"><input type="text" id="realizado_${cleanKey}" value="${escapeHtml(value)}" ${isDate ? 'readonly' : ''} disabled></div>`;
    }

    const osObservacaoKey = Object.keys(osDetails).find(k => k.toLowerCase().includes('observa'));
    if (osObservacaoKey && osDetails[osObservacaoKey]) {
        tableHtml += `<div class="grid-item" style="grid-column: 1 / -1;"><strong>Observação da OS:</strong> ${escapeHtml(osDetails[osObservacaoKey])}</div>`;
    }
    tableHtml += `</div></div>`;
    osDetailsContainer.innerHTML = tableHtml;

    osDetailsContainer.querySelector('.os-data-grid').addEventListener('change', event => {
        if (event.target.type === 'radio' && event.target.name.startsWith('confirm_')) {
            const cleanKey = event.target.name.replace('confirm_', '');
            const input = document.getElementById(`realizado_${cleanKey}`);
            if (input) input.disabled = event.target.value !== 'nao';
        }
    });
}

function renderReportFieldsForActivity(activityKey) {
    if (activityKey === "Colheita") {
        preparoAreaReportFieldsDiv.style.display = 'none';
        renderHarvestEquipmentSelection();
    } else if (SIMPLE_ACTIVITIES.includes(activityKey)) {
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
    } else {
        preparoAreaReportFieldsDiv.style.display = 'none';
    }

    observacoesRelatorioContainer.style.display = 'block';
    if (activityKey !== "Colheita") submitReportButton.style.display = 'block';
}

async function fetchAndDisplayOsData(osId) {
    osDetailsContainer.innerHTML = `<p class="loading-message">Buscando detalhes da OS...</p>`;
    harvestEquipmentSelectionContainer.innerHTML = '';
    const obsField = document.getElementById('observacoesRelatorio');
    if (obsField) obsField.value = '';

    try {
        let primeiraRenderizacao = true;
        await fetchWithCache(
            `osDetails:${selectedActivityKey}:${osId}`,
            `${osAppsScriptUrl}?activity=${encodeURIComponent(selectedActivityKey)}&osId=${encodeURIComponent(osId)}`,
            osDetails => {
                currentOsDetails = osDetails;
                renderOsDataGrid(osDetails);
                // Só monta os campos do relatório na primeira vez: uma
                // revalidação silenciosa não pode apagar o que já foi digitado.
                if (primeiraRenderizacao) {
                    renderReportFieldsForActivity(selectedActivityKey);
                    primeiraRenderizacao = false;
                }
            }
        );
    } catch (error) {
        osDetailsContainer.innerHTML = `<p class="error-message">Erro ao buscar detalhes: ${escapeHtml(error.message)}</p>`;
    }
}

function renderHarvestEquipmentSelection(selecionado) {
    const opcoes = [['Colhedeira', 'Colhedeira'], ['Caminhao', 'Caminhão'], ['Trator', 'Trator']];
    harvestEquipmentSelectionContainer.innerHTML = `
        <label>Selecione o Equipamento do Relatório:</label>
        <div class="radio-group-container">
            ${opcoes.map(([valor, rotulo]) => `
            <div class="radio-item">
                <input type="radio" id="equip_${valor}" name="equipmentType" value="${valor}"${selecionado === valor ? ' checked' : ''}>
                <label for="equip_${valor}">${rotulo}</label>
            </div>`).join('')}
        </div>`;

    harvestEquipmentSelectionContainer.onchange = e => {
        if (e.target.name === 'equipmentType') renderHarvestReportFields(e.target.value);
    };
}

function valorRealizado(cleanKey) {
    const el = document.getElementById(`realizado_${cleanKey}`);
    return el ? (el.value || '') : '';
}

function renderHarvestReportFields(equipmentType) {
    preparoAreaReportFieldsDiv.style.display = 'block';

    let fieldsHtml = '';
    switch (equipmentType) {
        case 'Colhedeira':
            fieldsHtml = `
                <div class="form-line">
                    <label>Colhedeira - Identificação:</label>
                    <input type="text" id="MAQUINA" value="${escapeHtml(valorRealizado('Colhedeira'))}" readonly>
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
                    <input type="text" id="OPERADORES_MAQUINA" value="${escapeHtml(valorRealizado('OperadoresColhedeira'))}">
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
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>`;
            break;

        case 'Caminhao': {
            let caminhaoOptions = '';
            const c1 = valorRealizado('Caminhao1');
            const c2 = valorRealizado('Caminhao2');
            if (c1) caminhaoOptions += `<option value="1">${escapeHtml(c1)}</option>`;
            if (c2) caminhaoOptions += `<option value="2">${escapeHtml(c2)}</option>`;

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
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>`;
            break;
        }

        case 'Trator':
            fieldsHtml = `
                <div class="form-line">
                    <label>Trator - Identificação:</label>
                    <input type="text" id="TRATOR" value="${escapeHtml(valorRealizado('Trator'))}" readonly>
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
                    <input type="text" id="OPERADORES" value="${escapeHtml(valorRealizado('OperadoresTrator'))}">
                </div>
                <div class="form-line">
                    <label>Implemento - Identificação:</label>
                    <input type="text" id="IMPLEMENTO" value="${escapeHtml(valorRealizado('Implemento'))}" readonly>
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
                <div id="abastecimentosContainer" class="abastecimentos-table-wrapper"></div>`;
            break;
    }

    preparoAreaReportFieldsDiv.innerHTML = `<h3>Detalhes do Relatório (${escapeHtml(equipmentType)})</h3>` + fieldsHtml;

    if (equipmentType === 'Caminhao') {
        const select = document.getElementById('Caminhao_ID_Select');
        const motoristaInput = document.getElementById('MOTORISTA_CAMINHAO');
        const updateMotorista = () => {
            if (select.value) motoristaInput.value = valorRealizado(`Motorista${select.value}`);
        };
        select.addEventListener('change', updateMotorista);
        updateMotorista();
    }

    observacoesRelatorioContainer.style.display = 'block';
    submitReportButton.style.display = 'block';
}


/* =========================================================================
 * 6. Tabelas de abastecimento
 * ========================================================================= */

const ABASTECIMENTO_IDS = {
    Colhedeira: { h: 'horimetro_colhe_abast', l: 'combustivel_colhedeira', header: 'Horímetro (h)' },
    Caminhao:   { h: 'km_abastecimento',      l: 'combustivel_caminhao',   header: 'Quilometragem (km)' },
    Trator:     { h: 'horimetro_trator_abast', l: 'combustivel_trator',    header: 'Horímetro (h)' },
    Simples:    { h: 'abastecimento_horimetro', l: 'abastecimento_litros', header: 'Horímetro (h)' }
};

function renderAbastecimentoTable(tipo, numFields, container, valores) {
    const cfg = ABASTECIMENTO_IDS[tipo] || ABASTECIMENTO_IDS.Simples;
    numFields = parseInt(numFields, 10);
    if (isNaN(numFields) || numFields < 0) numFields = 0;
    if (numFields > 10) {
        alert("Máximo de 10 abastecimentos permitidos.");
        numFields = 10;
        const numInput = formContainerDiv.querySelector('#numAbastecimentos, input[id^="NUMERO_ABASTECIMENTO"]');
        if (numInput) numInput.value = 10;
    }
    if (numFields === 0) {
        container.innerHTML = '';
        return;
    }

    let rows = '';
    for (let i = 1; i <= numFields; i++) {
        const v = (valores && valores[i - 1]) || {};
        rows += `<tr><td>${i}</td>` +
            `<td><input type="number" id="${cfg.h}_${i}" step="0.01" value="${escapeHtml(v.h || '')}"></td>` +
            `<td><input type="number" id="${cfg.l}_${i}" step="0.01" value="${escapeHtml(v.l || '')}"></td></tr>`;
    }
    container.innerHTML = `<table class="abastecimentos-table"><thead><tr>` +
        `<th>Abastecimento</th><th>${cfg.header}</th><th>Litros (L)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function tipoAbastecimentoAtual() {
    if (selectedActivityKey !== 'Colheita') return 'Simples';
    const equip = document.querySelector('input[name="equipmentType"]:checked');
    return equip ? equip.value : 'Simples';
}


/* =========================================================================
 * 7. Coleta, validação e envio
 * ========================================================================= */

function sanitizeNumericInput(value) {
    return typeof value === 'string' ? value.replace(',', '.') : value;
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function numAbastecimentosAtual(equipmentType) {
    const id = equipmentType
        ? `NUMERO_ABASTECIMENTO_${equipmentType === 'Caminhao' ? 'CAMINHAO' : equipmentType.toUpperCase()}`
        : 'numAbastecimentos';
    return parseInt(val(id), 10) || 0;
}

function validarRelatorio() {
    const formToValidate = (selectedActivityKey === 'Irrigacao')
        ? document.getElementById('irrigationForm')
        : formContainerDiv;

    for (const input of formToValidate.querySelectorAll('[required]')) {
        input.setCustomValidity('');
        if (!String(input.value).trim()) {
            input.setCustomValidity('Este campo é obrigatório.');
            input.reportValidity();
            return false;
        }
    }

    if (selectedActivityKey === 'Irrigacao') return true;

    const cmpMaior = (inicioId, fimId, rotulo) => {
        const inicio = parseFloat(sanitizeNumericInput(val(inicioId)));
        const fim = parseFloat(sanitizeNumericInput(val(fimId)));
        if (fim <= inicio) { alert(`${rotulo} final deve ser maior que o inicial.`); return false; }
        return true;
    };

    const checarAbastecimentos = (tipo, n) => {
        const cfg = ABASTECIMENTO_IDS[tipo];
        for (let i = 1; i <= n; i++) {
            if (!val(`${cfg.h}_${i}`) || !val(`${cfg.l}_${i}`)) {
                alert(`Por favor, preencha os dados do abastecimento ${i}.`);
                return false;
            }
        }
        return true;
    };

    if (selectedActivityKey === "Colheita") {
        const equipmentType = document.querySelector('input[name="equipmentType"]:checked')?.value;
        if (!equipmentType) {
            alert('Por favor, selecione o tipo de equipamento para o relatório de colheita.');
            return false;
        }
        if (equipmentType === 'Colhedeira' && !cmpMaior('horimetro_colhe_inicio', 'horimetro_colhe_fim', 'O horímetro')) return false;
        if (equipmentType === 'Caminhao' && !cmpMaior('km_inicio', 'km_fim', 'A quilometragem')) return false;
        if (equipmentType === 'Trator' && !cmpMaior('horimetro_trator_inicio', 'horimetro_trator_fim', 'O horímetro')) return false;
        return checarAbastecimentos(equipmentType, numAbastecimentosAtual(equipmentType));
    }

    if (SIMPLE_ACTIVITIES.includes(selectedActivityKey)) {
        if (!cmpMaior('horimetroInicio', 'horimetroFim', 'O horímetro')) return false;
        return checarAbastecimentos('Simples', numAbastecimentosAtual(null));
    }

    return true;
}

function coletarDadosRelatorio() {
    const reportData = { activity: selectedActivityKey, userName };

    if (editingReport) {
        reportData.isUpdate = 'true';
        reportData.reportId = editingReport.reportId || '';
        reportData.rowIndex = editingReport.rowIndex || '';
        reportData.originalTimestamp = editingReport.timestamp || '';
    }

    if (selectedActivityKey === 'Irrigacao') {
        const voltaInput = document.querySelector('input[name="irrigation_volta"]:checked');
        Object.assign(reportData, {
            operationId: document.getElementById('irrigationOperationIdDisplay').textContent,
            local: val('irrigation_local'),
            pivo: val('irrigation_pivo'),
            dataInicio: val('irrigation_data_inicio'),
            horaInicio: val('irrigation_hora_inicio'),
            dataTermino: val('irrigation_data_termino'),
            horaTermino: val('irrigation_hora_termino'),
            volta: voltaInput ? voltaInput.value : '',
            intensidade: val('irrigation_intensidade'),
            operador: val('irrigation_operador'),
            paradas: val('irrigation_paradas'),
            observacao: val('irrigation_observacao'),
            isUpdate: currentIrrigationData.isUpdate,
            originalId: currentIrrigationData.originalId
        });
        return reportData;
    }

    reportData.osId = currentOsDetails['ID da OS'];
    for (const key in currentOsDetails) {
        if (["Timestamp", "Nome do Usuário", "ID da OS"].includes(key)) continue;
        const cleanKey = keyMap[key] || key.replace(/[^a-zA-Z0-9]/g, '');
        const realizadoInput = document.getElementById(`realizado_${cleanKey}`);

        reportData[cleanKey] = currentOsDetails[key];
        if (realizadoInput) {
            reportData[`realizado_${cleanKey}`] = realizadoInput.disabled ? currentOsDetails[key] : realizadoInput.value;
        }
    }
    reportData.observacao = val('observacoesRelatorio');

    if (selectedActivityKey === "Colheita") {
        const equipmentType = document.querySelector('input[name="equipmentType"]:checked').value;
        reportData.equipmentType = equipmentType;
        const n = numAbastecimentosAtual(equipmentType);
        const cfg = ABASTECIMENTO_IDS[equipmentType];

        if (equipmentType === 'Colhedeira') {
            reportData.horimetro_colhe_inicio = sanitizeNumericInput(val('horimetro_colhe_inicio'));
            reportData.horimetro_colhe_fim = sanitizeNumericInput(val('horimetro_colhe_fim'));
            reportData.OPERADORES_MAQUINA = val('OPERADORES_MAQUINA');
            reportData.PARADAS_IMPREVISTAS_COLHEDEIRA = sanitizeNumericInput(val('PARADAS_IMPREVISTAS_COLHEDEIRA'));
            reportData.NUMERO_ABASTECIMENTO_COLHEDEIRA = n;
        } else if (equipmentType === 'Caminhao') {
            const select = document.getElementById('Caminhao_ID_Select');
            reportData.Caminhao_ID = select.selectedIndex >= 0 ? select.options[select.selectedIndex].text : '';
            reportData.MOTORISTA_CAMINHAO = val('MOTORISTA_CAMINHAO');
            reportData.km_inicio = sanitizeNumericInput(val('km_inicio'));
            reportData.km_fim = sanitizeNumericInput(val('km_fim'));
            reportData.PARADAS_IMPREVISTAS_CAMINHAO = sanitizeNumericInput(val('PARADAS_IMPREVISTAS_CAMINHAO'));
            reportData.NUMERO_ABASTECIMENTO_CAMINHAO = n;
        } else if (equipmentType === 'Trator') {
            reportData.horimetro_trator_inicio = sanitizeNumericInput(val('horimetro_trator_inicio'));
            reportData.horimetro_trator_fim = sanitizeNumericInput(val('horimetro_trator_fim'));
            reportData.OPERADORES = val('OPERADORES');
            reportData.PARADAS_IMPREVISTAS_TRATOR = sanitizeNumericInput(val('PARADAS_IMPREVISTAS_TRATOR'));
            reportData.NUMERO_ABASTECIMENTO_TRATOR = n;
        }

        for (let i = 1; i <= n; i++) {
            reportData[`${cfg.h}_${i}`] = sanitizeNumericInput(val(`${cfg.h}_${i}`));
            reportData[`${cfg.l}_${i}`] = sanitizeNumericInput(val(`${cfg.l}_${i}`));
        }

    } else if (SIMPLE_ACTIVITIES.includes(selectedActivityKey)) {
        reportData.horimetroInicio = sanitizeNumericInput(val('horimetroInicio'));
        reportData.horimetroFim = sanitizeNumericInput(val('horimetroFim'));
        reportData.paradasImprevistas = sanitizeNumericInput(val('paradasImprevistas'));
        const n = numAbastecimentosAtual(null);
        reportData.numAbastecimentos = n;
        for (let i = 1; i <= n; i++) {
            reportData[`abastecimento_horimetro_${i}`] = sanitizeNumericInput(val(`abastecimento_horimetro_${i}`));
            reportData[`abastecimento_litros_${i}`] = sanitizeNumericInput(val(`abastecimento_litros_${i}`));
        }
    }

    return reportData;
}

function postReport(reportData) {
    return apiFetch(reportAppsScriptUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(reportData).toString()
    }, SUBMIT_TIMEOUT_MS);
}

let loadingTimer = null;

function showLoading(texto) {
    loadingText.textContent = texto;
    loadingHint.textContent = '';
    loadingOverlay.style.display = 'flex';

    // O PDF é montado no servidor e leva alguns segundos: mostrar o relógio
    // correndo evita que o operador ache que travou e reenvie.
    const inicio = Date.now();
    clearInterval(loadingTimer);
    loadingTimer = setInterval(() => {
        const s = Math.round((Date.now() - inicio) / 1000);
        loadingHint.textContent = s < 8 ? `${s}s` : `${s}s — gerando o PDF, aguarde...`;
    }, 1000);
}

function hideLoading() {
    clearInterval(loadingTimer);
    loadingTimer = null;
    loadingOverlay.style.display = 'none';
}

async function submitReport() {
    if (!validarRelatorio()) return;

    const currentSubmitButton = (selectedActivityKey === 'Irrigacao') ? submitIrrigationReportButton : submitReportButton;
    const reportData = coletarDadosRelatorio();
    const editando = !!editingReport;

    // Sem rede, nem tenta: guarda direto e libera o operador na hora.
    if (!navigator.onLine) {
        if (editando) {
            alert('A correção de um relatório já enviado precisa de conexão. Tente novamente quando houver sinal.');
            return;
        }
        await saveReportOffline(reportData);
        return;
    }

    showLoading(editando ? 'Atualizando relatório...' : 'Enviando relatório...');
    currentSubmitButton.disabled = true;

    try {
        const result = await postReport(reportData);
        if (result.success && result.pdfUrl) {
            invalidarCacheRelatorios(selectedActivityKey);
            showSuccessModal(result.pdfUrl, result.folderUrl, editando);
        } else if (result.success) {
            invalidarCacheRelatorios(selectedActivityKey);
            alert(result.message || 'Dados registrados.');
            showActivitySelection();
        } else {
            throw new Error(result.message || 'Erro desconhecido ao enviar.');
        }
    } catch (error) {
        console.warn('Falha ao enviar.', error);
        if (editando) {
            alert(`Não foi possível atualizar o relatório: ${error.message}`);
        } else {
            await saveReportOffline(reportData);
        }
    } finally {
        hideLoading();
        currentSubmitButton.disabled = false;
    }
}

function showSuccessModal(pdfUrl, folderUrl, editando) {
    const modal = document.getElementById('successModal');
    document.getElementById('successTitle').textContent = editando ? 'Relatório Atualizado!' : 'Relatório Enviado!';
    document.getElementById('pdfLink').href = pdfUrl;
    document.getElementById('folderLink').href = folderUrl;
    modal.style.display = 'flex';

    const fechar = () => {
        modal.style.display = 'none';
        showActivitySelection();
    };
    modal.querySelector('.close-button').onclick = fechar;
}


/* =========================================================================
 * 8. Offline — fila de envios pendentes
 * ========================================================================= */

async function saveReportOffline(reportData) {
    try {
        await idbAdd(STORE_PENDING, { ...reportData, savedAt: Date.now() });
        await atualizarBannerPendentes();
        alert('Relatório salvo no aparelho. Ele será enviado automaticamente quando houver conexão.');
        showActivitySelection();

        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register(SYNC_TAG);
            } catch (e) { /* Background Sync indisponível: o evento 'online' cobre */ }
        }
    } catch (dbError) {
        console.error(dbError);
        alert('Erro: não foi possível salvar o relatório para envio posterior.');
    }
}

let sincronizando = false;

async function flushPendingReports(manual) {
    if (sincronizando || !navigator.onLine) return;

    let pendentes;
    try { pendentes = await idbGetAll(STORE_PENDING); } catch (e) { return; }
    if (!pendentes.length) {
        if (manual) alert('Não há relatórios pendentes.');
        return;
    }

    sincronizando = true;
    if (manual) showLoading(`Enviando ${pendentes.length} relatório(s) pendente(s)...`);

    let enviados = 0;
    let falhou = false;
    for (const item of pendentes) {
        const { id, savedAt, ...reportData } = item;
        try {
            const result = await postReport(reportData);
            if (result.success) {
                await idbDelete(STORE_PENDING, id);
                enviados++;
            } else {
                falhou = true;
            }
        } catch (e) {
            falhou = true;
            break;  // provavelmente caiu a conexão de novo: tenta depois
        }
    }

    sincronizando = false;
    if (manual) hideLoading();
    await atualizarBannerPendentes();

    if (enviados > 0) {
        const msg = `${enviados} relatório(s) pendente(s) enviado(s) com sucesso.`;
        if (manual || document.visibilityState === 'visible') alert(msg);
        [...new Set(pendentes.map(p => p.activity))].forEach(invalidarCacheRelatorios);
    } else if (manual && falhou) {
        alert('Não foi possível enviar agora. Os relatórios continuam salvos no aparelho.');
    }
}

async function atualizarBannerPendentes() {
    let pendentes = [];
    try { pendentes = await idbGetAll(STORE_PENDING); } catch (e) { /* ignora */ }
    if (pendentes.length === 0) {
        pendingBanner.hidden = true;
        return;
    }
    pendingBanner.hidden = false;
    pendingBannerText.textContent = pendentes.length === 1
        ? '1 relatório aguardando envio.'
        : `${pendentes.length} relatórios aguardando envio.`;
    syncNowButton.disabled = !navigator.onLine;
}

function atualizarBannerConexao() {
    offlineBanner.hidden = navigator.onLine;
    atualizarBannerPendentes();
}


/* =========================================================================
 * 9. Consulta e edição de relatórios já enviados
 * ========================================================================= */

function invalidarCacheRelatorios(activityKey) {
    const key = `reports:${activityKey}`;
    memoryCache.delete(key);
    idbDelete(STORE_CACHE, key).catch(() => {});
}

async function openReportList(activityKey) {
    selectedActivityKey = activityKey;
    showScreen('reportListContainer');
    reportListTitle.textContent = ACTIVITIES[activityKey];
    reportListResults.innerHTML = `<p class="loading-message">Buscando relatórios enviados...</p>`;

    if (!navigator.onLine) {
        reportListResults.innerHTML = `<p class="error-message">A consulta de relatórios enviados precisa de conexão.</p>`;
        return;
    }

    try {
        const result = await apiFetch(
            `${reportAppsScriptUrl}?action=listReports&activity=${encodeURIComponent(activityKey)}&limit=60`
        );
        renderReportList(result.data || []);
    } catch (error) {
        reportListResults.innerHTML = `<p class="error-message">Erro ao consultar: ${escapeHtml(error.message)}</p>`;
    }
}

function renderReportList(reports) {
    if (!reports.length) {
        reportListResults.innerHTML = `<p class="info-message">Nenhum relatório enviado para esta atividade.</p>`;
        return;
    }

    reportListResults.innerHTML = `<ul class="report-list">${reports.map(r => `
        <li>
            <div class="report-info">
                <strong>OS ${escapeHtml(r.osId)}${r.equipmentType ? ' — ' + escapeHtml(r.equipmentType) : ''}</strong>
                <span class="report-meta">${escapeHtml(formatClientDateTime(r.timestamp))} · ${escapeHtml(r.userName || '')}${
                    r.local ? ' · ' + escapeHtml(r.local) : ''}</span>
            </div>
            <div class="report-actions">
                ${r.pdfUrl ? `<a class="pdf" href="${escapeHtml(r.pdfUrl)}" target="_blank" rel="noopener">PDF</a>` : ''}
                <button type="button" data-report-id="${escapeHtml(r.reportId)}" data-row="${escapeHtml(r.rowIndex)}">Editar</button>
            </div>
        </li>`).join('')}</ul>`;

    reportListResults.querySelectorAll('button[data-report-id]').forEach(btn => {
        btn.addEventListener('click', () => loadReportForEdit(btn.dataset.reportId, btn.dataset.row));
    });
}

function formatClientDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

async function loadReportForEdit(reportId, rowIndex) {
    reportListResults.innerHTML = `<p class="loading-message">Carregando relatório...</p>`;
    try {
        const result = await apiFetch(
            `${reportAppsScriptUrl}?action=getReport&activity=${encodeURIComponent(selectedActivityKey)}` +
            `&reportId=${encodeURIComponent(reportId || '')}&rowIndex=${encodeURIComponent(rowIndex || '')}`
        );
        renderEditForm(result.data);
    } catch (error) {
        reportListResults.innerHTML = `<p class="error-message">Erro ao carregar: ${escapeHtml(error.message)}</p>`;
    }
}

/**
 * Reconstrói o formulário a partir da linha gravada na planilha. O backend já
 * devolve os dados na mesma nomenclatura usada no envio (planejado/realizado/
 * relatorio), então aqui só é preciso preencher os campos.
 */
function renderEditForm(report) {
    editingReport = { reportId: report.reportId, rowIndex: report.rowIndex, timestamp: report.timestamp };

    showScreen('formContainer');
    activityTitleSpan.textContent = ACTIVITIES[selectedActivityKey];
    currentUserSpan.textContent = userName;
    editingNotice.hidden = false;
    editingNotice.innerHTML = `Editando o relatório da <strong>OS ${escapeHtml(report.osId)}</strong> enviado em ` +
        `${escapeHtml(formatClientDateTime(report.timestamp))} por ${escapeHtml(report.userName || '—')}. ` +
        `Ao enviar, a linha da planilha é atualizada e um novo PDF é gerado no lugar do anterior.`;

    // A OS já está definida: esconde a lista de seleção.
    osSelectionBlock.style.display = 'none';
    operationIdDisplay.textContent = `${report.osId}-OP`;

    // 1. Grade "dados da OS": os rótulos vêm do backend e batem com o keyMap.
    currentOsDetails = { 'ID da OS': report.osId };
    Object.keys(report.labels).forEach(clientKey => {
        const label = report.labels[clientKey];
        const planejado = report.planejado[clientKey];
        if (planejado !== '' && planejado !== null && planejado !== undefined) {
            currentOsDetails[label] = planejado;
        }
    });
    if (report.observacaoOs) currentOsDetails['Observação'] = report.observacaoOs;
    renderOsDataGrid(currentOsDetails);

    // 2. Marca "Não" nos itens em que o realizado divergiu do planejado.
    Object.keys(report.labels).forEach(clientKey => {
        const input = document.getElementById(`realizado_${clientKey}`);
        if (!input) return;
        const realizado = report.realizado[clientKey];
        if (realizado === '' || realizado === null || realizado === undefined) return;
        const realizadoTexto = formatarParaCampo(report.labels[clientKey], realizado);
        if (realizadoTexto !== input.value) {
            const radioNao = document.querySelector(`input[name="confirm_${clientKey}"][value="nao"]`);
            if (radioNao) {
                radioNao.checked = true;
                input.disabled = false;
            }
            input.value = realizadoTexto;
        }
    });

    // 3. Campos do relatório.
    const rel = report.relatorio || {};
    if (selectedActivityKey === 'Colheita') {
        const equip = report.equipmentType || 'Colhedeira';
        renderHarvestEquipmentSelection(equip);
        renderHarvestReportFields(equip);
        preencherCamposColheita(equip, rel);
    } else if (SIMPLE_ACTIVITIES.includes(selectedActivityKey)) {
        renderReportFieldsForActivity(selectedActivityKey);
        setVal('horimetroInicio', rel.horimetroInicio);
        setVal('horimetroFim', rel.horimetroFim);
        setVal('paradasImprevistas', rel.paradasImprevistas);
        setVal('numAbastecimentos', rel.numAbastecimentos || 0);
        renderAbastecimentoTable('Simples', rel.numAbastecimentos || 0,
            document.getElementById('abastecimentosContainer'), rel.abastecimentos);
    } else {
        renderReportFieldsForActivity(selectedActivityKey);
    }

    observacoesRelatorioContainer.style.display = 'block';
    setVal('observacoesRelatorio', rel.observacao || '');
    submitReportButton.style.display = 'block';
    submitReportButton.textContent = 'Salvar Alterações e Gerar Novo PDF';
}

function preencherCamposColheita(equip, rel) {
    if (equip === 'Colhedeira') {
        setVal('horimetro_colhe_inicio', rel.horimetro_colhe_inicio);
        setVal('horimetro_colhe_fim', rel.horimetro_colhe_fim);
        setVal('OPERADORES_MAQUINA', rel.OPERADORES_MAQUINA);
        setVal('PARADAS_IMPREVISTAS_COLHEDEIRA', rel.PARADAS_IMPREVISTAS_COLHEDEIRA);
        setVal('NUMERO_ABASTECIMENTO_COLHEDEIRA', rel.numAbastecimentos || 0);
    } else if (equip === 'Caminhao') {
        const select = document.getElementById('Caminhao_ID_Select');
        if (select) {
            const idx = Array.from(select.options).findIndex(o => o.text === rel.Caminhao_ID);
            if (idx >= 0) select.selectedIndex = idx;
            select.dispatchEvent(new Event('change'));
        }
        setVal('MOTORISTA_CAMINHAO', rel.MOTORISTA_CAMINHAO);
        setVal('km_inicio', rel.km_inicio);
        setVal('km_fim', rel.km_fim);
        setVal('PARADAS_IMPREVISTAS_CAMINHAO', rel.PARADAS_IMPREVISTAS_CAMINHAO);
        setVal('NUMERO_ABASTECIMENTO_CAMINHAO', rel.numAbastecimentos || 0);
    } else if (equip === 'Trator') {
        setVal('horimetro_trator_inicio', rel.horimetro_trator_inicio);
        setVal('horimetro_trator_fim', rel.horimetro_trator_fim);
        setVal('OPERADORES', rel.OPERADORES);
        setVal('PARADAS_IMPREVISTAS_TRATOR', rel.PARADAS_IMPREVISTAS_TRATOR);
        setVal('NUMERO_ABASTECIMENTO_TRATOR', rel.numAbastecimentos || 0);
    }
    renderAbastecimentoTable(equip, rel.numAbastecimentos || 0,
        preparoAreaReportFieldsDiv.querySelector('#abastecimentosContainer'), rel.abastecimentos);
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
}

function formatarParaCampo(label, valor) {
    if (label.includes('Data')) return formatClientDate(valor);
    if (NUMERIC_OS_KEYS.includes(label)) return formatClientNumber(valor);
    return String(valor);
}


/* =========================================================================
 * 10. Irrigação
 * ========================================================================= */

function showIrrigationChoice(abrirConsulta) {
    irrigationChoiceContainer.style.display = 'block';
    irrigationFormContainer.style.display = 'none';
    submitIrrigationReportButton.style.display = 'none';

    irrigationChoiceContainer.innerHTML = `
        <h3>Irrigação</h3>
        <div class="activity-buttons">
            <button type="button" id="newIrrigationButton" class="activity-button orange-button">Nova Operação</button>
            <button type="button" id="queryIrrigationButton" class="activity-button">Consulta Operação</button>
        </div>`;

    document.getElementById('newIrrigationButton').addEventListener('click', handleNewIrrigationOp);
    document.getElementById('queryIrrigationButton').addEventListener('click', handleQueryIrrigationOp);

    if (abrirConsulta) handleQueryIrrigationOp();
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

    const irrigationForm = document.getElementById('irrigationForm');
    document.getElementById('irrigationTitle').textContent = isQuery ? 'Consulta/Edição de Irrigação' : 'Nova Operação de Irrigação';
    document.getElementById('irrigationCurrentUser').textContent = userName;
    const opIdDisplay = document.getElementById('irrigationOperationIdDisplay');
    opIdDisplay.textContent = data['ID da Operacao'] || '';

    const toDateInput = v => v ? new Date(v).toISOString().split('T')[0] : '';

    irrigationForm.innerHTML = `
        <div class="form-line">
            <label for="irrigation_local">Local:</label>
            <select id="irrigation_local" required ${isQuery ? 'disabled' : ''}>
                <option value="">Selecione...</option>
                ${['Sede', 'Wieke', 'Kakay'].map(l =>
                    `<option value="${l}" ${data.Local === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
        </div>
        <div class="form-line">
            <label for="irrigation_pivo">Pivô:</label>
            <select id="irrigation_pivo" required></select>
        </div>
        <div class="form-line">
            <label for="irrigation_data_inicio">Data de Início:</label>
            <input type="date" id="irrigation_data_inicio" value="${toDateInput(data['Data de Inicio'])}" required>
        </div>
        <div class="form-line">
            <label for="irrigation_hora_inicio">Hora de Início:</label>
            <input type="time" id="irrigation_hora_inicio" value="${escapeHtml(data['Hora de Inicio'] || '')}" required>
        </div>
        <div class="form-line">
            <label for="irrigation_data_termino">Data de Término:</label>
            <input type="date" id="irrigation_data_termino" value="${toDateInput(data['Data de Termino'])}">
        </div>
        <div class="form-line">
            <label for="irrigation_hora_termino">Hora de Término:</label>
            <input type="time" id="irrigation_hora_termino" value="${escapeHtml(data['Hora de Termino'] || '')}">
        </div>
        <div class="form-line-column">
            <label>Volta:</label>
            <div class="radio-group-container vertical">
                ${['completa', 'quase completa', 'Metade', 'Menos da metade'].map(v => `
                    <div class="radio-item">
                        <input type="radio" id="volta_${v.replace(/\s+/g, '')}" name="irrigation_volta" value="${v}" ${data.Volta === v ? 'checked' : ''}>
                        <label for="volta_${v.replace(/\s+/g, '')}">${v.charAt(0).toUpperCase() + v.slice(1)}</label>
                    </div>`).join('')}
            </div>
        </div>
        <div class="form-line">
            <label for="irrigation_intensidade">Intensidade (%):</label>
            <input type="number" id="irrigation_intensidade" min="0" max="100" value="${data.Intensidade ? parseInt(data.Intensidade) : ''}" required>
        </div>
        <div class="form-line">
            <label for="irrigation_operador">Operador:</label>
            <input type="text" id="irrigation_operador" value="${escapeHtml(data.Operador || userName)}" required>
        </div>
        <div class="form-line">
            <label for="irrigation_paradas">Nº de Paradas Imprevistas:</label>
            <input type="number" id="irrigation_paradas" min="0" value="${escapeHtml(data['Numero de Paradas Imprevistas'] || '0')}">
        </div>
        <div class="form-line full-width-label">
            <label for="irrigation_observacao">Observação:</label>
            <textarea id="irrigation_observacao" rows="3">${escapeHtml(data.Observacao || '')}</textarea>
        </div>`;

    submitIrrigationReportButton.style.display = 'block';

    const localSelect = document.getElementById('irrigation_local');
    const pivoSelect = document.getElementById('irrigation_pivo');
    const dataInicioInput = document.getElementById('irrigation_data_inicio');

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

    function updatePivos() {
        pivoSelect.innerHTML = '<option value="">Selecione...</option>' +
            (pivos[localSelect.value] || []).map(p =>
                `<option value="${p}" ${p === data.Pivo ? 'selected' : ''}>${p}</option>`).join('');
        updateOperationId();
    }

    localSelect.addEventListener('change', updatePivos);
    pivoSelect.addEventListener('change', updateOperationId);
    dataInicioInput.addEventListener('change', updateOperationId);
    updatePivos();
}

function handleNewIrrigationOp() {
    selectedActivityKey = 'Irrigacao';
    createAndShowIrrigationForm(false);
}

function handleQueryIrrigationOp() {
    selectedActivityKey = 'Irrigacao';
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
        <div id="query_results_container"></div>`;

    document.getElementById('query_local').addEventListener('change', async e => {
        const location = e.target.value;
        const resultsContainer = document.getElementById('query_results_container');
        if (!location) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = `<p class="loading-message">Buscando operações...</p>`;

        try {
            const result = await apiFetch(`${reportAppsScriptUrl}?action=getIrrigationIdsByLocation&location=${encodeURIComponent(location)}`);
            if (!result.data || result.data.length === 0) {
                resultsContainer.innerHTML = `<p class="info-message">${escapeHtml(result.message || 'Nenhuma operação encontrada.')}</p>`;
                return;
            }

            resultsContainer.innerHTML = `
                <div class="form-line">
                    <label for="query_id_select">ID da Operação:</label>
                    <select id="query_id_select">
                        <option value="">Selecione a operação...</option>
                        ${result.data.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('')}
                    </select>
                </div>
                <button type="button" class="activity-button" id="editOpBtn" disabled>Habilitar Edição</button>`;

            const idSelect = document.getElementById('query_id_select');
            const editBtn = document.getElementById('editOpBtn');
            idSelect.onchange = () => { editBtn.disabled = !idSelect.value; };
            editBtn.onclick = async () => {
                document.getElementById('irrigationForm').innerHTML = `<p class="loading-message">Carregando dados da operação...</p>`;
                try {
                    const dataResult = await apiFetch(`${reportAppsScriptUrl}?action=getIrrigationDataById&id=${encodeURIComponent(idSelect.value)}`);
                    createAndShowIrrigationForm(true, dataResult.data);
                } catch (err) {
                    document.getElementById('irrigationForm').innerHTML = `<p class="error-message">Erro ao carregar dados: ${escapeHtml(err.message)}</p>`;
                }
            };
        } catch (err) {
            resultsContainer.innerHTML = `<p class="error-message">Erro: ${escapeHtml(err.message)}</p>`;
        }
    });
}


/* =========================================================================
 * 11. Service worker
 * ========================================================================= */

function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // Caminho relativo: a aplicação é publicada em /agroverde/ro/, e o
    // caminho absoluto '/service-worker.js' nunca chegava a ser encontrado.
    navigator.serviceWorker.register('service-worker.js').then(registration => {
        registration.addEventListener('updatefound', () => {
            const novo = registration.installing;
            if (!novo) return;
            novo.addEventListener('statechange', () => {
                if (novo.state === 'installed' && navigator.serviceWorker.controller) {
                    novo.postMessage({ type: 'SKIP_WAITING' });
                }
            });
        });
    }).catch(err => console.warn('Service worker não registrado:', err));

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SYNC_PENDING_REPORTS') flushPendingReports(false);
        if (event.data && event.data.type === 'PENDING_SYNCED') atualizarBannerPendentes();
    });

    let recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recarregando) return;
        recarregando = true;
        window.location.reload();
    });
}


/* =========================================================================
 * 12. Inicialização
 * ========================================================================= */

function initializeApp() {
    document.getElementById('nameModal').style.display = 'none';
    currentUserSpan.textContent = userName;
    renderActivityButtons();
    setMode('novo');
    showActivitySelection();
    atualizarBannerConexao();
    flushPendingReports(false);
}

function getOrSetUserName() {
    userName = localStorage.getItem("userName") || '';
    if (!userName.trim()) {
        document.getElementById('nameModal').style.display = 'flex';
    } else {
        initializeApp();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nameForm').addEventListener('submit', event => {
        event.preventDefault();
        const inputName = document.getElementById('nameInput').value.trim();
        if (inputName) {
            userName = inputName;
            localStorage.setItem("userName", userName);
            initializeApp();
        }
    });

    getOrSetUserName();
    registrarServiceWorker();

    document.querySelectorAll('.mode-button').forEach(btn => {
        btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    backToActivitiesBtn.addEventListener('click', showActivitySelection);
    backFromReportListBtn.addEventListener('click', showActivitySelection);
    backToActivitiesFromIrrigationBtn.addEventListener('click', showActivitySelection);
    backToIrrigationChoiceBtn.addEventListener('click', () => showIrrigationChoice(false));

    submitReportButton.addEventListener('click', submitReport);
    submitIrrigationReportButton.addEventListener('click', submitReport);
    syncNowButton.addEventListener('click', () => flushPendingReports(true));

    formContainerDiv.addEventListener('click', event => {
        if (event.target && event.target.id === 'addAbastecimentoFields') {
            const numInput = formContainerDiv.querySelector('#numAbastecimentos, input[id^="NUMERO_ABASTECIMENTO"]');
            const container = formContainerDiv.querySelector('#abastecimentosContainer');
            if (numInput && container) renderAbastecimentoTable(tipoAbastecimentoAtual(), numInput.value, container);
        }
    });

    const limparValidacao = event => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) event.target.setCustomValidity('');
    };
    formContainerDiv.addEventListener('input', limparValidacao);
    irrigationFormContainer.addEventListener('input', limparValidacao);

    window.addEventListener('online', () => {
        atualizarBannerConexao();
        flushPendingReports(false);
    });
    window.addEventListener('offline', atualizarBannerConexao);
    atualizarBannerConexao();
});
