/* =========================================================================
 * Fazenda Agro Verde — Ordem de Serviço (PWA)
 *
 * Alterações desta versão:
 *  1. Carregamento e PDF   — envio não bloqueante, reaproveitamento de conexão,
 *                            timeout + reenvio automático, sem duplicar OS.
 *  2. Offline              — Service Worker com caminho relativo (o registro
 *                            antigo em '/service-worker.js' nunca funcionou no
 *                            GitHub Pages), fila persistente (outbox) e cache
 *                            local das OS já emitidas.
 *  3. Edição               — tela "Editar OS", que carrega a OS da planilha
 *                            (ou do cache local, se offline), reabre o
 *                            formulário preenchido e regrava/regera o PDF.
 * ========================================================================= */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';
const PDF_FOLDER_ID = "13lV62jPEHN76jMl_rEr0IEzy12YwK754";

const DB_NAME = 'osAgroDB';
const DB_VERSION = 2;
const STORE_OUTBOX = 'outbox';          // OS aguardando envio (ou reenvio)
const STORE_CACHE = 'osCache';          // OS conhecidas, para editar offline
const STORE_LEGACY = 'pendingOSData';   // fila da versão anterior (migrada)
const SYNC_TAG = 'sync-os-data';

const POST_TIMEOUT_MS = 90000;  // geração do PDF no Apps Script costuma levar 10-30 s
const GET_TIMEOUT_MS = 25000;
const MAX_PRODUCTS = 20;

let db = null;
let userName = '';
let currentActivityKey = null;
let currentEditingOsId = null;   // preenchido quando o formulário está em modo edição
let flushing = false;
let flushTimer = null;
let flushDelay = 15000;

// --- DADOS E CONFIGURAÇÕES ---
const ACTIVITIES = {"PreparodeArea":"Preparo de Área","TratamentodeSementes":"Tratamento de Sementes","Plantio":"Plantio","Pulverizacao":"Pulverização","Colheita":"Colheita","Lancas":"Lanças"};
const LOCATIONS_AND_FIELDS = {"AgroVerde":{"P33":32.5,"P15":14.85,"P60":60.57,"P80":80.95,"Hendrik Jan":11.96,"Baaie":18.68, "SOBRAS P33, P15, P60":41.01,"TH 5 SOBRAS PIVO 80":30.04},"Sador":{"Área 20/21":143.86,"Área 22":88.64,"Área 23":56.42,"Área 24":34.96,"Área 25":45.34,"Área 26/27":50.83,"Área 28":14.85,"Área 29":26.1, "Área 18":29.5},"Wieke":{"Barracão":21.04,"P45":50.06,"P17":19.88,"Sobra P45":6.94},"CantoVerde":{"Canto Verde":145.95},"João Paulista":{"Área 31/32/33":224.63,"Área 30":81.18},"Sergio":{"Sergio 46/47":121.44},"Chaparral":{"Fazenda Naturalícia (Chaparral)":282.11},"Cachoeirinha":{"Fazenda Cachoeirinha":290.95},"Kakay":{"P100":102.77,"P103":104.41,"P135":142.42,"P180":213.77,"Sobra 61":44.93,"Sobra 62":51.89,"Sobra 63":21.6,"Sobra 64":59.09,"Sobra 65":11.21,"Área 68":137.00,"Área 69":17.00},"Guimarães":{"Área 54":38.72,"Área 55":76.11},"Maribondo":{"Maribondo":199.92,"M104_1":44.28,"M104_2":20.79},"Fazenda Marcio":{"Área 80":68.1,"Área 81":80.36,"Área 81B":53.34,"Área 82":96.75,"Área 83":57.92,"Área 84":29.91,"Área 85/87":242.97,"Área 86A":188.03,"Área 86B":68.22,"Área 88":56.58,"Área 88B":24.18,"Área 89":66.33,"Área 90":68.3,"Área 91":13.97},"Custódio":{"Custódio 100":61.13,"Custódio 101":53.4}, "Vanderleia": {" V-110": 191.26,"V-111": 55.67,"V-113": 157.43,"V-114": 111.41,"V-115": 137.79,"V-116": 116.49,"V-Nilo": 117.36,"V-milho1": 15.22,"V-milho2": 4.10}};
const FORM_FIELDS = {"PreparodeArea":[{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Trator - identificação",name:"trator",type:"text"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"TratamentodeSementes":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Quantidade de Sementes (Kg)",name:"qtdSementesKg",type:"number"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e Dosagens",name:"productsContainer",type:"div"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Operadores",name:"operadores",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Plantio":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Quantidade/ha - Máximo",name:"qtdHaMax",type:"number"},{label:"Quantidade/ha - Mínimo",name:"qtdHaMin",type:"number"},{label:"Número de Insumos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Insumos (a serem usados e quantidades)",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Trator - identificação",name:"trator",type:"text"},{label:"Implemento",name:"implemento",type:"text"},{label:"Plantas por metro",name:"plantasPorMetro",type:"number"},{label:"Espaçamento entre plantas",name:"espacamentoPlantas",type:"number"},{label:"Peso de mil sementes (PMS)",name:"pms",type:"number"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Pulverizacao":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e quantidade/ha",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Bico",name:"bico",type:"text"},{label:"Capacidade do tanque",name:"capacidadeTanque",type:"number"},{label:"Vazão (L/ha)",name:"vazaoLHa",type:"number"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Pressão",name:"pressao",type:"number"},{label:"Dose/ha",name:"doseHa",type:"number"},{label:"Dose/tanque",name:"doseTanque",type:"number"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Colheita":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Produtividade estimada",name:"produtividadeEstimada",type:"number"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Colhedeira - Identificação",name:"maquina",type:"text"},{label:"Operador(es) Colhedeira",name:"operadoresMaquina",type:"text"},{label:"Número de Caminhões",name:"numTrucks",type:"number",min:0,max:MAX_PRODUCTS},{label:"Caminhões e Motoristas",name:"trucksContainer",type:"div"},{label:"Trator - marca modelo e número",name:"trator",type:"text"},{label:"Operador(es) Trator",name:"operadoresTrator",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}],"Lancas":[{label:"Cultura e Cultivar",name:"culturaCultivar",type:"text"},{label:"Número de Produtos",name:"numProducts",type:"number",min:0,max:MAX_PRODUCTS},{label:"Produtos e quantidade/hectare",name:"productsContainer",type:"div"},{label:"Data de Início",name:"dataInicio",type:"date"},{label:"Data de Término",name:"dataTermino",type:"date"},{label:"Máquina - Identificação",name:"maquina",type:"text"},{label:"Operador(es)",name:"operadores",type:"text"},{label:"Implemento - Identificação",name:"implemento",type:"text"},{label:"Observação",name:"observacao",type:"textarea"}]};

const activitySelectionDiv = document.getElementById('activitySelection');
const formContainerDiv = document.getElementById('formContainer');
const editScreenDiv = document.getElementById('editScreen');
const osListDiv = document.getElementById('osList');
const osSearchInput = document.getElementById('osSearch');
const editHint = document.getElementById('editHint');
const backButton = document.getElementById('backButton');
const connectionStatusElement = document.getElementById('connectionStatus');
const pendingBadge = document.getElementById('pendingBadge');
const modalOverlay = document.getElementById('modal-overlay');
const modalContent = document.getElementById('modal-content');
const toastArea = document.getElementById('toastArea');

// =========================================================================
// Banco local (IndexedDB)
// =========================================================================
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = e => {
            const database = e.target.result;
            const tx = e.target.transaction;

            if (!database.objectStoreNames.contains(STORE_OUTBOX)) {
                database.createObjectStore(STORE_OUTBOX, { keyPath: 'osId' });
            }
            if (!database.objectStoreNames.contains(STORE_CACHE)) {
                const cacheStore = database.createObjectStore(STORE_CACHE, { keyPath: 'osId' });
                cacheStore.createIndex('updatedAt', 'updatedAt');
            }

            // Migra a fila antiga (v1) para o outbox, sem perder nada do que já
            // estava salvo no celular do operador.
            if (database.objectStoreNames.contains(STORE_LEGACY)) {
                const legacy = tx.objectStore(STORE_LEGACY);
                const outbox = tx.objectStore(STORE_OUTBOX);
                legacy.getAll().onsuccess = ev => {
                    (ev.target.result || []).forEach(item => {
                        const data = item && item.data ? item.data : null;
                        if (!data) return;
                        const osId = data.osId || `LEGADO-${item.id}`;
                        data.osId = osId;
                        outbox.put({
                            osId,
                            activity: data.activity || '',
                            mode: 'create',
                            data,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            tries: 0,
                            lastError: ''
                        });
                    });
                    legacy.clear();
                };
            }
        };

        request.onsuccess = e => { db = e.target.result; resolve(db); };
        request.onerror = e => reject(e.target.error);
    });
}

function idbRequest(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
        if (!db) return reject(new Error('Banco local indisponível'));
        const tx = db.transaction([storeName], mode);
        const req = fn(tx.objectStore(storeName));
        req.onsuccess = () => resolve(req.result);
        req.onerror = e => reject(e.target.error);
    });
}

const putOutbox = record => idbRequest(STORE_OUTBOX, 'readwrite', s => s.put(record));
const getOutbox = osId => idbRequest(STORE_OUTBOX, 'readonly', s => s.get(osId));
const getAllOutbox = () => idbRequest(STORE_OUTBOX, 'readonly', s => s.getAll());
const deleteOutbox = osId => idbRequest(STORE_OUTBOX, 'readwrite', s => s.delete(osId));
const putCache = record => idbRequest(STORE_CACHE, 'readwrite', s => s.put(record));
const getCache = osId => idbRequest(STORE_CACHE, 'readonly', s => s.get(osId));
const getAllCache = () => idbRequest(STORE_CACHE, 'readonly', s => s.getAll());

// =========================================================================
// Rede
// =========================================================================
async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function sendDataToServer(data) {
    try {
        const response = await fetchWithTimeout(
            APPS_SCRIPT_URL,
            { method: 'POST', body: new URLSearchParams(data) },
            POST_TIMEOUT_MS
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        const message = error.name === 'AbortError'
            ? 'Tempo esgotado (conexão lenta).'
            : `Erro de comunicação: ${error.message}`;
        return { success: false, message };
    }
}

async function apiGet(params) {
    const url = `${APPS_SCRIPT_URL}?${new URLSearchParams(params)}`;
    const response = await fetchWithTimeout(url, { method: 'GET' }, GET_TIMEOUT_MS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json && json.error) throw new Error(json.error);
    return json;
}

// =========================================================================
// Fila de envio (outbox)
// =========================================================================
function scheduleFlush(delayMs) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flushOutbox(), delayMs);
}

async function flushOutbox(options = {}) {
    // A trava é ligada antes de qualquer await: sem isso, duas chamadas
    // simultâneas (ex.: evento 'online' + retorno à tela) enviariam a mesma OS
    // duas vezes.
    if (flushing || !navigator.onLine) return;
    flushing = true;

    try {
        let items;
        try {
            items = await getAllOutbox();
        } catch (e) {
            return;
        }
        if (!items.length) {
            flushDelay = 15000;
            return;
        }

        for (const item of items) {
            const result = await sendDataToServer(item.data);

            if (result.success) {
                await deleteOutbox(item.osId);
                const cached = (await getCache(item.osId)) || {};
                await putCache({
                    ...cached,
                    osId: item.osId,
                    activity: item.activity,
                    data: item.data,
                    local: item.data.local || '',
                    pdfUrl: result.pdfUrl || cached.pdfUrl || '',
                    pdfId: result.pdfId || cached.pdfId || '',
                    syncState: 'synced',
                    updatedAt: Date.now()
                });

                if (!options.silent) {
                    const acao = item.mode === 'update' ? 'atualizada' : 'registrada';
                    showToast(
                        `OS <strong>${escapeHtml(item.osId)}</strong> ${acao} e PDF pronto ✅` +
                        (result.pdfUrl ? `<br><a href="${result.pdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>` : ''),
                        'success',
                        15000
                    );
                }
                flushDelay = 15000;
            } else {
                await putOutbox({
                    ...item,
                    tries: (item.tries || 0) + 1,
                    lastError: result.message || 'Falha desconhecida',
                    updatedAt: Date.now()
                });
                if (!options.silent) {
                    showToast(
                        `OS <strong>${escapeHtml(item.osId)}</strong> ainda não enviada (${escapeHtml(result.message || '')}).<br>Ela continua salva no aparelho e será reenviada sozinha.`,
                        'error',
                        12000
                    );
                }
                flushDelay = Math.min(flushDelay * 2, 300000); // recuo exponencial até 5 min
                scheduleFlush(flushDelay);
                break; // não insiste nas demais enquanto a rede está ruim
            }
            await updatePendingBadge();
        }
    } finally {
        flushing = false;
        await updatePendingBadge();
        requestBackgroundSync();
    }
}

function requestBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready
            .then(reg => reg.sync.register(SYNC_TAG))
            .catch(() => {});
    }
}

async function updatePendingBadge() {
    try {
        const items = await getAllOutbox();
        if (items.length) {
            pendingBadge.style.display = 'block';
            pendingBadge.textContent = `${items.length} pendente${items.length > 1 ? 's' : ''} ⟳`;
            pendingBadge.title = 'Toque para tentar enviar agora';
        } else {
            pendingBadge.style.display = 'none';
        }
    } catch (e) { /* banco ainda não aberto */ }
}

// =========================================================================
// UI — avisos
// =========================================================================
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(html, type = 'info', durationMs = 8000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<button class="toast-close" aria-label="Fechar">×</button>${html}`;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    toastArea.appendChild(toast);
    if (durationMs) setTimeout(() => toast.remove(), durationMs);
    return toast;
}

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

// =========================================================================
// UI — navegação entre telas
// =========================================================================
function showActivitySelection() {
    currentEditingOsId = null;
    currentActivityKey = null;
    activitySelectionDiv.style.display = 'grid';
    editScreenDiv.style.display = 'none';
    formContainerDiv.style.display = 'none';
    backButton.style.display = 'none';
    formContainerDiv.innerHTML = '';
}

function showForm() {
    activitySelectionDiv.style.display = 'none';
    editScreenDiv.style.display = 'none';
    formContainerDiv.style.display = 'block';
    backButton.style.display = 'block';
    window.scrollTo(0, 0);
}

function showEditScreen() {
    activitySelectionDiv.style.display = 'none';
    formContainerDiv.style.display = 'none';
    formContainerDiv.innerHTML = '';
    editScreenDiv.style.display = 'block';
    backButton.style.display = 'block';
    loadOsList();
}

function renderActivityButtons() {
    activitySelectionDiv.innerHTML = '';

    for (const key in ACTIVITIES) {
        const button = document.createElement('button');
        button.className = 'activity-button';
        button.type = 'button';
        button.textContent = ACTIVITIES[key];
        button.addEventListener('click', () => {
            hideNotification();
            currentActivityKey = key;
            currentEditingOsId = null;
            renderForm(key);
            showForm();
        });
        activitySelectionDiv.appendChild(button);
    }

    const editButton = document.createElement('button');
    editButton.id = 'editOrderButton';
    editButton.type = 'button';
    editButton.textContent = '✏️ Editar Ordem de Serviço';
    editButton.addEventListener('click', () => {
        hideNotification();
        showEditScreen();
    });
    activitySelectionDiv.appendChild(editButton);

    const viewOrdersButton = document.createElement('a');
    viewOrdersButton.id = 'viewIssuedOrders';
    viewOrdersButton.className = 'activity-button';
    viewOrdersButton.href = `https://drive.google.com/drive/folders/${PDF_FOLDER_ID}`;
    viewOrdersButton.textContent = 'Ordens emitidas';
    viewOrdersButton.target = '_blank';
    viewOrdersButton.rel = 'noopener';
    activitySelectionDiv.appendChild(viewOrdersButton);
}

// =========================================================================
// Tela de edição
// =========================================================================
let osListItems = [];

async function loadOsList() {
    osListDiv.innerHTML = '<p class="edit-hint">Carregando…</p>';

    const local = [];
    try {
        const outbox = await getAllOutbox();
        outbox.forEach(item => local.push({
            osId: item.osId,
            activity: item.activity,
            localName: (item.data && item.data.local) || '',
            timestamp: item.updatedAt || item.createdAt,
            state: 'pending'
        }));
        const cached = await getAllCache();
        cached.forEach(item => {
            if (local.some(o => o.osId === item.osId)) return;
            local.push({
                osId: item.osId,
                activity: item.activity,
                localName: item.local || '',
                timestamp: item.updatedAt,
                state: 'offline'
            });
        });
    } catch (e) { /* ignora */ }

    let servidor = [];
    if (navigator.onLine) {
        try {
            const result = await apiGet({ action: 'list', limit: 100 });
            servidor = (result.items || []).map(item => ({
                osId: item.osId,
                activity: item.activity,
                localName: item.local || '',
                timestamp: item.timestamp ? Date.parse(item.timestamp) : 0,
                state: 'synced'
            }));
            editHint.textContent = 'Toque em uma OS para editar. Ao salvar, a planilha é atualizada e um novo PDF é gerado.';
        } catch (e) {
            editHint.textContent = `Não foi possível consultar a planilha (${e.message}). Mostrando apenas o que está salvo no aparelho.`;
        }
    } else {
        editHint.textContent = 'Você está offline: só é possível editar as OS já abertas neste aparelho. As alterações serão enviadas quando houver conexão.';
    }

    const byId = new Map();
    servidor.forEach(item => byId.set(item.osId, item));
    local.forEach(item => byId.set(item.osId, { ...(byId.get(item.osId) || {}), ...item }));

    osListItems = Array.from(byId.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderOsList();
}

function renderOsList() {
    const term = (osSearchInput.value || '').trim().toLowerCase();
    const filtered = term
        ? osListItems.filter(item =>
            `${item.osId} ${item.localName} ${ACTIVITIES[item.activity] || item.activity || ''}`
                .toLowerCase().includes(term))
        : osListItems;

    if (!filtered.length) {
        osListDiv.innerHTML = '<p class="edit-hint">Nenhuma ordem de serviço encontrada.</p>';
        return;
    }

    osListDiv.innerHTML = '';
    filtered.slice(0, 200).forEach(item => {
        const tag = item.state === 'pending'
            ? '<span class="os-item-tag pending">aguardando envio</span>'
            : item.state === 'offline'
                ? '<span class="os-item-tag offline">salva no aparelho</span>'
                : '<span class="os-item-tag">na planilha</span>';

        const quando = item.timestamp ? new Date(item.timestamp).toLocaleDateString('pt-BR') : '';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'os-item';
        button.innerHTML =
            `<span><span class="os-item-id">${escapeHtml(item.osId)}</span>` +
            `<span class="os-item-meta">${escapeHtml(ACTIVITIES[item.activity] || item.activity || '')}` +
            `${item.localName ? ' · ' + escapeHtml(item.localName) : ''}${quando ? ' · ' + quando : ''}</span></span>${tag}`;
        button.addEventListener('click', () => openOsForEditing(item));
        osListDiv.appendChild(button);
    });
}

async function openOsForEditing(item) {
    const loading = showToast('<span class="spinner"></span>Carregando ordem de serviço…', 'info', 0);

    try {
        let data = null;

        const pending = await getOutbox(item.osId);
        if (pending) {
            data = pending.data;                        // ainda não foi enviada: edita direto na fila
        } else if (navigator.onLine) {
            const result = await apiGet({ action: 'get', osId: item.osId, activity: item.activity || '' });
            data = result.data;
            await putCache({
                osId: item.osId,
                activity: data.activity,
                data,
                local: data.local || '',
                pdfUrl: result.pdfUrl || '',
                pdfId: result.pdfId || '',
                syncState: 'synced',
                updatedAt: Date.now()
            });
        } else {
            const cached = await getCache(item.osId);
            if (cached) data = cached.data;
        }

        if (!data) {
            showToast('Esta OS ainda não foi baixada para o aparelho. Conecte-se à internet para editá-la.', 'error');
            return;
        }

        currentActivityKey = data.activity;
        currentEditingOsId = item.osId;
        renderForm(data.activity, data);
        showForm();
    } catch (e) {
        showToast(`Não foi possível abrir a OS: ${escapeHtml(e.message)}`, 'error');
    } finally {
        loading.remove();
    }
}

// =========================================================================
// Formulário
// =========================================================================
function generateOsId(user, localName) {
    const userChar = user ? user.charAt(0).toUpperCase() : 'X';

    // Usa a última palavra do nome do local, ignorando o texto entre parênteses.
    let processedLocalName = localName ? localName.replace(/\s*\(.*\)\s*$/, '').trim() : '';
    const words = processedLocalName.split(' ');
    const lastWord = words[words.length - 1];
    const localPart = lastWord ? lastWord.toUpperCase().replace(/[^A-Z0-9]/gi, '').substring(0, 5) : '';

    const randomNum = Math.floor(100 + Math.random() * 900);
    const letras = "abcdefghijklmnopqrstuvwxyz";
    const caracteres = "!@#$%&*-";
    const letraAleatoria = letras.charAt(Math.floor(Math.random() * letras.length));
    const caracterAleatorio = caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    return `${userChar}-${localPart}-${randomNum}${letraAleatoria}${caracterAleatorio}`;
}

function updateTotalArea(talhoesListElement) {
    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    if (!totalAreaDisplay) return;
    let total = 0;
    talhoesListElement.querySelectorAll('input[name="talhoes"]:checked').forEach(checkbox => {
        const match = checkbox.value.match(/\(([\d.]+) ha\)/);
        if (match && match[1]) total += parseFloat(match[1]);
    });
    totalAreaDisplay.textContent = `TOTAL (ha): ${total.toFixed(2)}`;
}

/**
 * @param {string} activityKey
 * @param {object|null} prefill  dados no mesmo formato enviado ao servidor
 */
function renderForm(activityKey, prefill = null) {
    const formFields = FORM_FIELDS[activityKey];
    if (!formFields) {
        formContainerDiv.innerHTML = `<p>Formulário não encontrado.</p>`;
        return;
    }

    const isEdit = !!prefill;
    const osIdValue = isEdit ? (prefill.osId || '') : '';

    let formHtml = `<form id="dynamicForm"><h2>${ACTIVITIES[activityKey]}</h2>`;
    if (isEdit) {
        formHtml += `<div class="edit-mode-banner">Editando a OS ${escapeHtml(osIdValue)} — o ID é mantido e o PDF será refeito.</div>`;
    }
    formHtml += `<input type="hidden" name="userName" value="${escapeHtml(userName)}">` +
        `<input type="hidden" name="osId" value="${escapeHtml(osIdValue)}">` +
        `<p class="form-info-display">Registrando como: <strong>${escapeHtml(userName || "N/A")}</strong></p>` +
        `<p class="form-info-display">ID da Ordem de Serviço: <strong id="displayedOsId">${escapeHtml(osIdValue || 'Aguardando local...')}</strong></p>` +
        `<label for="local">Local da Atividade: <span class="required">*</span></label>` +
        `<select id="local" name="local" required><option value="">Selecione o Local</option>`;
    for (const locationName in LOCATIONS_AND_FIELDS) {
        const selected = isEdit && prefill.local === locationName ? ' selected' : '';
        formHtml += `<option value="${escapeHtml(locationName)}"${selected}>${escapeHtml(locationName)}</option>`;
    }
    formHtml += `</select><div id="talhoesSelection" style="display: none;"><label>Talhões (ha): <span class="required">*</span></label>` +
        `<div class="checkbox-group"><input type="checkbox" id="allTalhoes"><label for="allTalhoes">Todos</label></div>` +
        `<div id="talhoesList" class="talhoes-list"></div>` +
        `<div id="totalAreaDisplay" class="total-area-display">TOTAL (ha): 0.00</div></div>`;

    formFields.forEach(field => {
        const isRequired = field.name !== 'observacao' && !field.name.includes('Container') && !field.name.includes('Products') && !field.name.includes('Trucks');
        const rawValue = isEdit ? prefill[field.name] : undefined;

        if (field.type === "textarea") {
            formHtml += `<label for="${field.name}">${field.label}:</label>` +
                `<textarea id="${field.name}" name="${field.name}">${escapeHtml(rawValue || '')}</textarea>`;
        } else if (field.name.includes('Container')) {
            formHtml += `<div id="${field.name}"></div>`;
        } else {
            const stepAttribute = field.type === 'number' ? 'step="0.01"' : '';
            const defaultValue = field.type === 'number' ? '0' : '';
            const value = rawValue !== undefined && rawValue !== null && rawValue !== ''
                ? formatValueForInput(field.type, rawValue)
                : defaultValue;
            formHtml += `<label for="${field.name}">${field.label}:${isRequired ? ' <span class="required">*</span>' : ''}</label>` +
                `<input type="${field.type}" id="${field.name}" name="${field.name}" ${stepAttribute} ` +
                `${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max ? `max="${field.max}"` : ''} ` +
                `value="${escapeHtml(value)}" ${isRequired ? 'required' : ''}>`;
        }
    });
    formHtml += `<button type="submit">${isEdit ? 'Salvar alterações' : 'Registrar Ordem de Serviço'}</button></form>`;
    formContainerDiv.innerHTML = formHtml;

    const localSelect = document.getElementById('local');
    const allTalhoesCheckbox = document.getElementById('allTalhoes');
    const dynamicForm = document.getElementById('dynamicForm');
    const talhoesListDiv = document.getElementById('talhoesList');
    const talhoesSelectionDiv = document.getElementById('talhoesSelection');

    localSelect.addEventListener('change', () => {
        const selectedLocation = localSelect.value;
        const osIdInput = dynamicForm.querySelector('input[name="osId"]');
        const displayedOsId = document.getElementById('displayedOsId');
        if (selectedLocation) {
            renderTalhoesCheckboxes(selectedLocation, talhoesListDiv, allTalhoesCheckbox);
            talhoesSelectionDiv.style.display = 'block';
            updateTotalArea(talhoesListDiv);
            // Em edição o ID nunca muda — é a chave da OS na planilha e no PDF.
            if (!currentEditingOsId) {
                const newOsId = generateOsId(userName, selectedLocation);
                osIdInput.value = newOsId;
                displayedOsId.textContent = newOsId;
            }
        } else {
            talhoesSelectionDiv.style.display = 'none';
            talhoesListDiv.innerHTML = '';
            updateTotalArea(talhoesListDiv);
            if (!currentEditingOsId) {
                osIdInput.value = '';
                displayedOsId.textContent = 'Aguardando local...';
            }
        }
    });

    const numProductsInput = document.getElementById('numProducts');
    if (numProductsInput) {
        numProductsInput.addEventListener('input', () =>
            renderProductFields(parseInt(numProductsInput.value) || 0, document.getElementById('productsContainer'), activityKey));
    }

    const numTrucksInput = document.getElementById('numTrucks');
    if (numTrucksInput) {
        numTrucksInput.addEventListener('input', () =>
            renderTruckFields(parseInt(numTrucksInput.value) || 0, document.getElementById('trucksContainer')));
    }

    allTalhoesCheckbox.addEventListener('change', () => {
        talhoesListDiv.querySelectorAll('input[name="talhoes"]').forEach(cb => { cb.checked = allTalhoesCheckbox.checked; });
        updateTotalArea(talhoesListDiv);
    });

    dynamicForm.addEventListener('submit', handleFormSubmit);

    if (isEdit) applyPrefill(prefill, activityKey);
}

function formatValueForInput(type, value) {
    if (type !== 'date') return value;
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function applyPrefill(prefill, activityKey) {
    const localSelect = document.getElementById('local');
    const talhoesListDiv = document.getElementById('talhoesList');
    const allTalhoesCheckbox = document.getElementById('allTalhoes');

    if (prefill.local && LOCATIONS_AND_FIELDS[prefill.local]) {
        localSelect.value = prefill.local;
        renderTalhoesCheckboxes(prefill.local, talhoesListDiv, allTalhoesCheckbox);
        document.getElementById('talhoesSelection').style.display = 'block';

        // Marca os talhões pelo nome (o texto da área pode ter mudado desde a emissão).
        const selecionados = String(prefill.talhoes || '')
            .split(';')
            .map(t => t.replace(/\s*\([^)]*\)\s*$/, '').trim())
            .filter(Boolean);
        talhoesListDiv.querySelectorAll('input[name="talhoes"]').forEach(cb => {
            const nome = cb.value.replace(/\s*\([^)]*\)\s*$/, '').trim();
            cb.checked = selecionados.includes(nome);
        });
        updateTotalArea(talhoesListDiv);
    }

    const numProducts = parseInt(prefill.numProducts || '0', 10);
    const productsContainer = document.getElementById('productsContainer');
    if (productsContainer && numProducts > 0) {
        renderProductFields(numProducts, productsContainer, activityKey);
        for (let i = 1; i <= numProducts; i++) {
            const nameInput = document.getElementById(`product_name_${i}`);
            const doseInput = document.getElementById(`product_dosage_${i}`);
            if (nameInput) nameInput.value = prefill[`product_name_${i}`] || prefill[`nome_produto_${i}`] || '';
            if (doseInput) doseInput.value = prefill[`product_dosage_${i}`] || prefill[`dose_produto_${i}`] || '';
        }
    }

    const numTrucks = parseInt(prefill.numTrucks || '0', 10);
    const trucksContainer = document.getElementById('trucksContainer');
    if (trucksContainer && numTrucks > 0) {
        renderTruckFields(numTrucks, trucksContainer);
        for (let i = 1; i <= numTrucks; i++) {
            const idInput = document.getElementById(`truck_id_${i}`);
            const driverInput = document.getElementById(`truck_driver_${i}`);
            if (idInput) idInput.value = prefill[`truck_id_${i}`] || prefill[`identificacao_caminhao_${i}`] || '';
            if (driverInput) driverInput.value = prefill[`truck_driver_${i}`] || prefill[`motorista_caminhao_${i}`] || '';
        }
    }
}

function renderProductFields(num, container, activityKey) {
    container.innerHTML = '';
    const productLabel = activityKey === "Plantio" ? "Insumo" : "Produto";
    let html = '';
    for (let i = 1; i <= num; i++) {
        html += `<div class="product-group"><h3>${productLabel} ${i}</h3>` +
            `<label for="product_name_${i}">${productLabel} ${i} Nome:<span class="required">*</span></label>` +
            `<input type="text" id="product_name_${i}" name="product_name_${i}" required>` +
            `<label for="product_dosage_${i}">${productLabel} ${i} Dosagem:<span class="required">*</span></label>` +
            `<input type="text" id="product_dosage_${i}" name="product_dosage_${i}" required></div>`;
    }
    container.innerHTML = html;
}

function renderTruckFields(num, container) {
    container.innerHTML = '';
    let html = '';
    for (let i = 1; i <= num; i++) {
        html += `<div class="truck-group"><h3>Caminhão ${i}</h3>` +
            `<label for="truck_id_${i}">Identificação Caminhão ${i}:<span class="required">*</span></label>` +
            `<input type="text" id="truck_id_${i}" name="truck_id_${i}" required>` +
            `<label for="truck_driver_${i}">Motorista(s) Caminhão ${i}:<span class="required">*</span></label>` +
            `<input type="text" id="truck_driver_${i}" name="truck_driver_${i}" required></div>`;
    }
    container.innerHTML = html;
}

function renderTalhoesCheckboxes(locationName, talhoesListElement, allTalhoesCheckboxElement) {
    talhoesListElement.innerHTML = '';
    const talhoes = LOCATIONS_AND_FIELDS[locationName];
    if (talhoes) {
        for (const talhaoName in talhoes) {
            const area = talhoes[talhaoName];
            const div = document.createElement('div');
            div.innerHTML = `<input type="checkbox" id="talhao-${talhaoName.replace(/\s+/g, '-')}" name="talhoes" value="${escapeHtml(talhaoName)} (${area} ha)">` +
                `<label for="talhao-${talhaoName.replace(/\s+/g, '-')}">${escapeHtml(talhaoName)} (${area} ha)</label>`;
            div.querySelector('input').addEventListener('change', () => updateTotalArea(talhoesListElement));
            talhoesListElement.appendChild(div);
        }
    }
    allTalhoesCheckboxElement.checked = false;
}

// =========================================================================
// Envio
// =========================================================================
async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const isEdit = !!currentEditingOsId;

    const selectedTalhoes = [];
    form.querySelectorAll('input[name="talhoes"]:checked').forEach(cb => selectedTalhoes.push(cb.value));
    if (!selectedTalhoes.length) {
        showToast('Selecione ao menos um talhão.', 'error');
        return;
    }

    const data = { activity: currentActivityKey, userName };
    for (const pair of formData.entries()) data[pair[0]] = pair[1];

    data.osId = isEdit ? currentEditingOsId : (data.osId || generateOsId(userName, data.local));
    data.mode = isEdit ? 'update' : 'create';
    data.talhoes = selectedTalhoes.join('; ');

    const totalAreaDisplay = document.getElementById('totalAreaDisplay');
    if (totalAreaDisplay) data.areaTotalHectares = totalAreaDisplay.textContent.replace('TOTAL (ha):', '').trim();

    const numProducts = parseInt(formData.get('numProducts') || '0', 10);
    for (let i = 1; i <= MAX_PRODUCTS; i++) {
        data[`nome_produto_${i}`] = (i <= numProducts) ? (formData.get(`product_name_${i}`) || "") : "";
        data[`dose_produto_${i}`] = (i <= numProducts) ? (formData.get(`product_dosage_${i}`) || "") : "";
    }

    if (currentActivityKey === "Colheita") {
        const numTrucks = parseInt(formData.get('numTrucks') || '0', 10);
        for (let i = 1; i <= MAX_PRODUCTS; i++) {
            data[`identificacao_caminhao_${i}`] = (i <= numTrucks) ? (formData.get(`truck_id_${i}`) || "") : "";
            data[`motorista_caminhao_${i}`] = (i <= numTrucks) ? (formData.get(`truck_driver_${i}`) || "") : "";
        }
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    // Grava primeiro no aparelho: a partir daqui a OS não se perde, mesmo que o
    // envio falhe, o app seja fechado ou o celular perca o sinal.
    const record = {
        osId: data.osId,
        activity: currentActivityKey,
        mode: data.mode,
        data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tries: 0,
        lastError: ''
    };
    try {
        await putOutbox(record);
        await putCache({
            osId: data.osId,
            activity: currentActivityKey,
            data,
            local: data.local || '',
            syncState: 'pending',
            updatedAt: Date.now()
        });
    } catch (e) {
        showToast(`Não foi possível salvar no aparelho: ${escapeHtml(e.message)}`, 'error');
        submitButton.disabled = false;
        return;
    }

    await updatePendingBadge();
    requestBackgroundSync();

    const acaoTexto = isEdit ? 'alterações salvas' : 'OS registrada';
    showActivitySelection();
    const toast = navigator.onLine
        ? showToast(`<span class="spinner"></span><strong>${escapeHtml(data.osId)}</strong> — ${acaoTexto} no aparelho. Gerando o PDF…`, 'info', 0)
        : showToast(`<strong>${escapeHtml(data.osId)}</strong> — ${acaoTexto} no aparelho 💾<br>Será enviada automaticamente quando houver internet.`, 'info', 12000);

    if (navigator.onLine) {
        // O envio segue em segundo plano: o operador já pode abrir a próxima OS.
        flushOutbox().finally(() => toast.remove());
    }
}

// =========================================================================
// Estado da conexão / inicialização
// =========================================================================
function updateConnectionStatus() {
    connectionStatusElement.className = 'status-message';
    if (navigator.onLine) {
        connectionStatusElement.textContent = 'Status: Online';
    } else {
        connectionStatusElement.textContent = 'Status: Offline';
        connectionStatusElement.classList.add('status-offline');
    }
}

function getOrSetUserName() {
    userName = localStorage.getItem('userName') || '';
    if (!userName) {
        const inputName = prompt('Olá! Por favor, digite seu nome para registrar as ordens de serviço:');
        userName = (inputName && inputName.trim()) ? inputName.trim() : 'Usuário Anônimo';
        localStorage.setItem('userName', userName);
    }
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // Caminho RELATIVO: no GitHub Pages o app fica em /agroverde/, e o registro
    // antigo ('/service-worker.js') apontava para a raiz do domínio — 404, ou
    // seja, o app nunca chegou a funcionar offline de verdade.
    navigator.serviceWorker.register('service-worker.js')
        .then(registration => {
            registration.addEventListener('updatefound', () => {
                const novo = registration.installing;
                if (!novo) return;
                novo.addEventListener('statechange', () => {
                    if (novo.state === 'installed' && navigator.serviceWorker.controller) {
                        const toast = showToast(
                            'Nova versão do aplicativo disponível. <a href="#" id="reloadApp">Atualizar agora</a>',
                            'info', 0);
                        toast.querySelector('#reloadApp').addEventListener('click', e => {
                            e.preventDefault();
                            novo.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                        });
                    }
                });
            });
        })
        .catch(error => console.warn('Falha ao registrar o Service Worker:', error));

    navigator.serviceWorker.addEventListener('message', e => {
        if (!e.data) return;
        if (e.data.type === 'SYNC_PENDING_DATA') flushOutbox();
        if (e.data.type === 'SYNC_DONE') {
            updatePendingBadge();
            showToast(`Sincronização concluída: ${e.data.count} OS enviada(s) ✅`, 'success');
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    renderActivityButtons();
    showActivitySelection();
    updateConnectionStatus();
    registerServiceWorker();

    // Deixa a tela aparecer antes de pedir o nome.
    setTimeout(getOrSetUserName, 0);

    backButton.addEventListener('click', () => {
        hideNotification();
        if (formContainerDiv.style.display === 'block' && currentEditingOsId) {
            showEditScreen();
        } else {
            showActivitySelection();
        }
    });

    pendingBadge.addEventListener('click', () => {
        flushDelay = 15000;
        flushOutbox();
    });

    osSearchInput.addEventListener('input', renderOsList);
    document.getElementById('refreshOsList').addEventListener('click', () => loadOsList());

    window.addEventListener('online', () => {
        updateConnectionStatus();
        flushDelay = 15000;
        flushOutbox();
    });
    window.addEventListener('offline', updateConnectionStatus);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') flushOutbox();
    });

    modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay && !modalContent.classList.contains('pulsing')) hideNotification();
    });

    try {
        await openDatabase();
    } catch (e) {
        showToast('Não foi possível abrir o banco local. O modo offline ficará indisponível.', 'error');
        return;
    }

    await updatePendingBadge();
    flushOutbox();
});
