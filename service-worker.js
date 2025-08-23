const CACHE_NAME = 'agro-os-cache-v6'; // Aumentamos a versão do cache para forçar a atualização
const urlsToCache = [
    '.', // Garante que a raiz do site seja cacheada
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'icon-192x192.png',
    'icon-512x512.png',
    'logoFAVbase64.css' // Confirma que o CSS da logo está na lista
];



// ********* as linhas a seguir foram incluidas manualmente, além das geradas por IA
// URL do seu Apps Script (precisa ser o mesmo do script.js)
const appsScriptUrl = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec'; // <-- COLOQUE SEU URL AQUI!

const DB_NAME = 'osAgroDB'; // Nome do DB igual ao script.js
const STORE_NAME = 'pendingOSData'; // Nome da store igual ao script.js

// Termino de inclusão de linhas além das geradas por IA *****************


self.addEventListener('install', event => {
    console.log('Service Worker: Evento de instalação iniciado.');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cache aberto. Adicionando shell do aplicativo.');
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Service Worker: Falha ao cachear durante a instalação:', error);
            })
    );
});

self.addEventListener('fetch', event => {
    // Ignora requisições que não sejam HTTP/HTTPS (ex: chrome-extension://)
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Se a requisição está no cache, retorna a resposta do cache (Cache First)
                if (response) {
                    console.log('Service Worker: Servindo do cache:', event.request.url);
                    return response;
                }

                // Se não está no cache, tenta buscar da rede (Network Fallback)
                console.log('Service Worker: Buscando da rede:', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // Verifica se a resposta da rede é válida para cachear
                        if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse; // Não cacheia respostas inválidas
                        }

                        // Clona a resposta para que ela possa ser consumida tanto pelo navegador quanto pelo cache
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    }
                ).catch(error => {
                    // Esta parte é acionada se a busca na rede falhar (provavelmente offline)
                    console.error('Service Worker: Falha na busca e não encontrado no cache:', event.request.url, error);
                    // Para requisições de navegação (como recarregar a página), você pode retornar uma página offline customizada
                    if (event.request.mode === 'navigate') {
                        // Se você tiver uma página offline.html, pode retorná-la aqui
                        // return caches.match('/offline.html');
                        console.log('Service Worker: Requisição de navegação falhou e offline. Nenhuma página offline customizada servida.');
                    }
                    // Se não for uma requisição de navegação ou não houver fallback, re-lança o erro.
                    throw error; 
                });
            })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker: Evento de ativação iniciado.');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) { // Deleta caches antigos que não correspondem à versão atual
                        console.log('Service Worker: Deletando cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Listener para o evento 'sync' (sincronização em segundo plano)
self.addEventListener('sync', event => {
    if (event.tag === 'sync-os-data') { // Verifica a tag registrada em script.js
        console.log('Service Worker: Evento de sincronização em segundo plano acionado para:', event.tag);
        event.waitUntil(self.clients.matchAll().then(clients => {
            // Encontra todos os clientes (abas) abertos da aplicação
            clients.forEach(client => {
                console.log('Service Worker: Enviando mensagem para o cliente iniciar a sincronização.');
                // Envia uma mensagem para o cliente (script.js)
                client.postMessage({ type: 'SYNC_PENDING_DATA' });
            });
        }).catch(error => {
            console.error('Service Worker: Erro em clients.matchAll no evento sync:', error);
        }));
    }
});