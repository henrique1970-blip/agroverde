const CACHE_NAME = 'os-agro-cache-v3'; // Incrementado a versão do cache
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/logoFAVbase64.css', // Adicionado o CSS do logo ao cache
  '/script.js',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// URL do seu Apps Script (precisa ser o mesmo do script.js)
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbz-5rT0uL3kvAdXKf8FFNwaN2X_nbWgXkC4kHiRqerF4KBT-3FjXC20Znzs5VONKnTgPw/exec'; // <-- COLOQUE SEU URL AQUI!

const DB_NAME = 'osAgroDB'; // Nome do DB igual ao script.js
const STORE_NAME = 'pendingOSData'; // Nome da store igual ao script.js

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Retorna do cache se encontrado
        }
        return fetch(event.request); // Se não, busca na rede
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deletando cache antigo:', cacheName);
            return caches.delete(cacheName); // Deleta caches antigos
          }
        })
      );
    })
  );
});

// --- Lógica de Sincronização em Segundo Plano (Background Sync) ---

self.addEventListener('sync', event => {
  if (event.tag === 'sync-os-data') { // Nova tag de sincronização
    console.log('Service Worker: Evento de sincronização "sync-os-data" disparado!');
    event.waitUntil(syncDataFromIndexedDB());
  }
});

async function syncDataFromIndexedDB() {
    let dbInstance; // Variável local para a instância do DB
    try {
        dbInstance = await openDatabase();
    } catch (error) {
        console.error('Service Worker: Erro ao abrir IndexedDB para sincronização:', error);
        return;
    }

    const pendingData = await getLocalData(dbInstance);

    if (pendingData.length === 0) {
        console.log('Service Worker: Nenhum dado pendente para sincronizar.');
        return;
    }

    console.log(`Service Worker: Tentando sincronizar ${pendingData.length} item(s) pendente(s)...`);

    for (const item of pendingData) {
        const success = await sendToAppsScript(item.data);
        if (success) {
            await deleteLocalData(dbInstance, item.id);
            console.log(`Service Worker: Item ${item.id} sincronizado.`);
        } else {
            console.warn(`Service Worker: Falha ao sincronizar item ${item.id}. Será tentado novamente.`);
            // Se falhar, para a sincronização e deixa o item no IndexedDB para próxima tentativa
            break; // Importante: para de tentar se um item falha para evitar loop infinito
        }
    }
    console.log('Service Worker: Tentativa de sincronização concluída.');
}

// --- Funções de IndexedDB para o Service Worker (com 'dbInstance' como parâmetro) ---

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function(event) {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = function(event) {
            resolve(event.target.result);
        };

        request.onerror = function(event) {
            reject(event.target.errorCode);
        };
    });
}

function getLocalData(dbInstance) {
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function(event) {
            reject(event.target.errorCode);
        };
    });
}

function deleteLocalData(dbInstance, id) {
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = function() {
            resolve();
        };

        request.onerror = function(event) {
            reject(event.target.errorCode);
        };
    });
}

async function sendToAppsScript(data) {
    try {
        // Usa o appsScriptUrl definido no Service Worker
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(data).toString()
        });
        return true;
    } catch (error) {
        console.error('Service Worker: Erro ao enviar os dados para Apps Script:', error);
        return false;
    }
}