/* =========================================================================
 * Service Worker — Ordem de Serviço (Fazenda Agro Verde)
 *
 * Pontos importantes desta versão:
 *  - Todos os caminhos são RELATIVOS ao escopo. O app é publicado em
 *    https://henrique1970-blip.github.io/agroverde/ e a lista antiga
 *    ('/index.html', '/style.css', …) apontava para a raiz do domínio,
 *    fazendo o install falhar por completo.
 *  - HTML: rede primeiro (com queda para o cache) → atualização chega sozinha.
 *    Demais arquivos: cache primeiro + revalidação em segundo plano.
 *  - A sincronização em segundo plano é feita AQUI, lendo o outbox do
 *    IndexedDB. Antes ela só avisava as abas abertas — com o app fechado,
 *    nada era enviado.
 *  - O app de Relatório de Operações (/ro/) é ignorado por este worker.
 * ========================================================================= */

// O Cache Storage é compartilhado por ORIGEM, não por escopo: este worker e o
// do app de Relatório de Operações (/ro/) enxergam os mesmos caches. Por isso a
// limpeza de versões antigas filtra pelo prefixo — apagar "tudo que não é meu"
// derrubaria o cache do outro app, que então só voltaria a abrir offline depois
// de ser aberto uma vez com sinal.
const CACHE_PREFIX = 'agro-os-';
const CACHE_VERSION = 'v6';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './',
    'index.html',
    'offline.html',
    'style.css',
    'script.js',
    'manifest.json',
    'logo-fav.png',
    'icon-192x192.png',
    'icon-512x512.png'
];

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyS8G4Yar6Bjx5clsorCNrb_tWOelWbXBdEm97Alj9kWgQGCDUw04zRQW9pH9TT3OHozA/exec';

const DB_NAME = 'osAgroDB';
const DB_VERSION = 2;
const STORE_OUTBOX = 'outbox';
const SYNC_TAG = 'sync-os-data';

// --- Instalação / ativação ------------------------------------------------
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // addAll() falha inteiro se um único arquivo faltar; aqui cada item é
        // independente, então uma falha isolada não derruba a instalação.
        await Promise.all(PRECACHE_URLS.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(err =>
                console.warn('SW: não foi possível pré-cachear', url, err))
        ));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable();
        }
        const names = await caches.keys();
        await Promise.all(names.map(name =>
            (name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME) ? caches.delete(name) : null
        ));
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// --- Estratégias de cache -------------------------------------------------
function isUnderScope(url) {
    const scope = new URL(self.registration.scope);
    return url.origin === scope.origin
        && url.pathname.startsWith(scope.pathname)
        && !url.pathname.startsWith(`${scope.pathname}ro/`); // outro app, outro dono
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;                 // envios ao Apps Script passam direto

    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;
    if (!isUnderScope(url)) return;                       // Drive, Apps Script, /ro/ → rede

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(event));
        return;
    }

    event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigation(event) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(event.request);
        if (response && response.ok) cache.put(event.request, response.clone());
        return response;
    } catch (error) {
        return (await cache.match(event.request))
            || (await cache.match('index.html'))
            || (await cache.match('offline.html'))
            || new Response('Aplicativo indisponível offline.', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const network = fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => null);

    return cached || (await network) || new Response('', { status: 504 });
}

// --- Sincronização em segundo plano ---------------------------------------
self.addEventListener('sync', event => {
    if (event.tag === SYNC_TAG) event.waitUntil(syncOutbox());
});

self.addEventListener('periodicsync', event => {
    if (event.tag === SYNC_TAG) event.waitUntil(syncOutbox());
});

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        // Se o worker abrir o banco antes da página (sync logo após a instalação),
        // ele precisa criar as mesmas stores — senão a versão subiria sem elas e
        // a página nunca receberia o onupgradeneeded.
        request.onupgradeneeded = e => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_OUTBOX)) {
                database.createObjectStore(STORE_OUTBOX, { keyPath: 'osId' });
            }
            if (!database.objectStoreNames.contains('osCache')) {
                database.createObjectStore('osCache', { keyPath: 'osId' })
                    .createIndex('updatedAt', 'updatedAt');
            }
        };
        request.onsuccess = e => resolve(e.target.result);
        request.onerror = e => reject(e.target.error);
        request.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    });
}

function txRequest(database, mode, fn) {
    return new Promise((resolve, reject) => {
        const tx = database.transaction([STORE_OUTBOX], mode);
        const req = fn(tx.objectStore(STORE_OUTBOX));
        req.onsuccess = () => resolve(req.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function syncOutbox() {
    let database;
    try {
        database = await openDb();
        if (!database.objectStoreNames.contains(STORE_OUTBOX)) return;
    } catch (e) {
        return;
    }

    let items = [];
    try {
        items = await txRequest(database, 'readonly', store => store.getAll());
    } catch (e) {
        return;
    }
    if (!items.length) return;

    let enviadas = 0;
    for (const item of items) {
        try {
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                body: new URLSearchParams(item.data)
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Falha no servidor');

            await txRequest(database, 'readwrite', store => store.delete(item.osId));
            enviadas++;
        } catch (e) {
            // Rede ainda instável: mantém na fila e deixa o navegador reagendar
            // este evento de sync.
            throw e;
        }
    }

    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'SYNC_DONE', count: enviadas }));
}
