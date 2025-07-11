// ** Importante: Substitua este URL pelo seu Apps Script Web App URL **
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz-5rT0uL3kvAdXKf8FFNwaN2X_nbWgXkC4kHiRqerF4KBT-3FjXC20Znzs5VONKnTgPw/exec';

const DB_NAME = 'osAgroDB';
const STORE_NAME = 'pendingOSData';
let db;

// Variável global para armazenar o nome do usuário
let userName = '';

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