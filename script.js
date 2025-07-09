// URL do seu Apps Script implantado como aplicativo da web
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbzQrCQR9hBR4zGMCylDKFoIXtxSh6oL8PYv198mMD7rFIYiw1wSiWqxNlI2rm4-bkNM/exec'; // <-- COLOQUE SEU URL AQUI!

const DB_NAME = 'agroverdeDB';
const STORE_NAME = 'pendingData';
let db;

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
    const messageElement = document.getElementById('message');
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
    const messageElement = document.getElementById('message');
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
            messageElement.textContent = `Falha ao sincronizar item ${item.id}. Tentando novamente mais tarde.`;
            break;
        }
    }
    // CORREÇÃO: Adicionado parêntese extra para agrupar (await getLocalData())
    if ((await getLocalData()).length === 0) {
        messageElement.textContent = 'Todos os dados pendentes sincronizados com sucesso! ✅';
    }
}

// --- Event Listeners e Inicialização ---

document.addEventListener('DOMContentLoaded', async () => {
    await openDatabase(); // Abre o banco de dados ao carregar a página
    updateConnectionStatus(); // Atualiza o status da conexão

    // Adiciona listeners para mudanças de conexão
    window.addEventListener('online', () => {
        updateConnectionStatus();
        attemptSync(); // Tenta sincronizar quando a conexão volta
    });
    window.addEventListener('offline', updateConnectionStatus);

    // Tenta sincronizar dados pendentes ao carregar a página (se online)
    if (navigator.onLine) {
        attemptSync();
    }
});

document.getElementById('dataForm').addEventListener('submit', async function(event) {
    event.preventDefault(); // Impede o envio padrão do formulário

    const nome = document.getElementById('nome').value;
    const dataNascimento = document.getElementById('dataNascimento').value;
    const telefone = document.getElementById('telefone').value;
    const messageElement = document.getElementById('message');

    const data = {
        nome: nome,
        dataNascimento: dataNascimento,
        telefone: telefone,
        timestamp: new Date().toISOString() // Adiciona um timestamp para ordenação/depuração
    };

    messageElement.textContent = 'Enviando dados...';

    if (navigator.onLine) {
        const success = await sendToAppsScript(data);
        if (success) {
            messageElement.textContent = 'Dados enviados com sucesso! ✅';
            document.getElementById('dataForm').reset(); // Limpa o formulário
        } else {
            // Se online mas falhou o envio (ex: Apps Script inacessível), salva localmente
            await saveDataLocally({ data: data });
            messageElement.textContent = 'Falha ao enviar online. Dados salvos localmente para sincronização futura. 💾';
            document.getElementById('dataForm').reset();
        }
    } else {
        // Se offline, salva diretamente no IndexedDB
        await saveDataLocally({ data: data });
        messageElement.textContent = 'Offline. Dados salvos localmente para sincronização futura. 💾';
        document.getElementById('dataForm').reset();
    }

    // Tenta registrar um evento de sincronização em segundo plano
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('sync-pending-data');
            console.log('Evento de sincronização em segundo plano registrado.');
        } catch (error) {
            console.warn('Falha ao registrar sync em segundo plano:', error);
            // Fallback: a sincronização ocorrerá quando o usuário abrir o PWA online novamente
        }
    }
});

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (navigator.onLine) {
        statusElement.textContent = 'Status: Online';
        statusElement.className = 'status-message status-online';
    } else {
        statusElement.textContent = 'Status: Offline (dados serão sincronizados)';
        statusElement.className = 'status-message status-offline';
    }
}