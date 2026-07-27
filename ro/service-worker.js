/* =========================================================================
 * Service worker — Relatório de Operações
 *
 * O que mudou em relação à versão anterior:
 *
 *  1. Caminhos RELATIVOS no precache. A lista antiga usava '/index.html',
 *     '/style.css'... mas a aplicação é servida em /agroverde/ro/. O
 *     cache.addAll() rejeitava (404) e, como addAll é tudo-ou-nada, o
 *     service worker nunca terminava de instalar — nada ficava offline.
 *
 *  2. Estratégia por tipo de arquivo em vez de "cache primeiro" para tudo.
 *     Cache-first no HTML congelava a aplicação numa versão antiga para
 *     sempre; agora o HTML é network-first (com cache de reserva) e os
 *     estáticos usam stale-while-revalidate: abrem instantaneamente do
 *     cache e se atualizam em segundo plano.
 *
 *  3. O envio dos relatórios pendentes é feito AQUI, lendo o IndexedDB
 *     direto. Antes o SW só mandava um postMessage para as abas abertas —
 *     se o app estivesse fechado (o caso normal quando o sinal volta), nada
 *     era enviado e o relatório ficava preso no aparelho.
 * ========================================================================= */

// O Cache Storage é compartilhado por ORIGEM, não por escopo: este service
// worker (/ro/) e o do aplicativo de Ordem de Serviço (raiz do site) enxergam
// os mesmos caches. Por isso a limpeza de versões antigas filtra pelo prefixo —
// apagar "tudo que não é meu" derrubaria o cache offline do outro aplicativo.
const CACHE_PREFIX = 'agro-relop-';
const CACHE_VERSION = 'v4';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const PRECACHE_URLS = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'manifest.json',
    'logo-fav.webp',
    'logo-fav.png',
    'favicon.ico',
    'apple-touch-icon.png',
    'icon-192x192.png',
    'icon-512x512.png'
];

// Endereço de reserva. O normal é cada relatório da fila trazer o seu próprio
// (campo __endpoint, gravado pelo script.js no momento em que foi enfileirado),
// para que a URL do Apps Script exista num lugar só — o script.js. Este valor
// só entra em cena para registros enfileirados por versões anteriores.
const REPORT_APPS_SCRIPT_URL_FALLBACK = 'https://script.google.com/macros/s/AKfycbznEdqNDvPH34VOE6EQ510BUkk3s5NtZyN8KRMKaCns--qerlsupNlUaQdil1tPdK5R/exec';

const DB_NAME = 'reportAgroDB';
const DB_VERSION = 2;
const STORE_PENDING = 'pendingReports';
const SYNC_TAG = 'sync-report-data';


/* ---------------------------- instalação ---------------------------- */

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // addAll é tudo-ou-nada: um arquivo opcional que falte não pode
        // impedir a instalação inteira. Por isso vai um a um.
        await Promise.all(PRECACHE_URLS.map(url =>
            cache.add(new Request(url, { cache: 'reload' }))
                 .catch(err => console.warn('SW: não foi possível cachear', url, err))
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.map(nome =>
            (nome.indexOf(CACHE_PREFIX) === 0 && nome !== CACHE_NAME) ? caches.delete(nome) : null
        ));
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});


/* ------------------------------- fetch ------------------------------- */

function ehEstatico(url) {
    return /\.(css|js|png|webp|jpg|jpeg|svg|ico|woff2?)$/i.test(url.pathname) ||
           url.pathname.endsWith('manifest.json');
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || !request.url.startsWith('http')) return;

    const url = new URL(request.url);

    // Chamadas ao Apps Script nunca entram no cache do SW: os dados de OS são
    // cacheados no IndexedDB pela aplicação, com controle de validade.
    if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

    // Navegação / HTML: rede primeiro, cache como reserva.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const resposta = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                cache.put('index.html', resposta.clone());
                return resposta;
            } catch (e) {
                return (await caches.match('index.html')) ||
                       (await caches.match('./')) ||
                       new Response('<h1>Sem conexão</h1><p>Abra o aplicativo uma vez com internet.</p>',
                                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
        })());
        return;
    }

    // Estáticos: entrega do cache na hora e revalida em segundo plano.
    if (url.origin === self.location.origin && ehEstatico(url)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cacheado = await cache.match(request);
            const daRede = fetch(request).then(resposta => {
                if (resposta && resposta.status === 200) cache.put(request, resposta.clone());
                return resposta;
            }).catch(() => null);
            return cacheado || (await daRede) || Response.error();
        })());
    }
});


/* -------------------- sincronização em segundo plano -------------------- */

function abrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_PENDING)) {
                db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('osCache')) {
                db.createObjectStore('osCache', { keyPath: 'key' });
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

function pedido(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function listarPendentes() {
    const db = await abrirDB();
    return pedido(db.transaction(STORE_PENDING, 'readonly').objectStore(STORE_PENDING).getAll());
}

async function removerPendente(id) {
    const db = await abrirDB();
    const tx = db.transaction(STORE_PENDING, 'readwrite');
    tx.objectStore(STORE_PENDING).delete(id);
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function avisarClientes(mensagem) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(client => client.postMessage(mensagem));
}

async function enviarPendentes() {
    const pendentes = await listarPendentes();
    if (!pendentes.length) return;

    let enviados = 0;
    for (const item of pendentes) {
        const { id, savedAt, __endpoint, ...reportData } = item;
        try {
            const resposta = await fetch(__endpoint || REPORT_APPS_SCRIPT_URL_FALLBACK, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(reportData).toString()
            });
            const resultado = await resposta.json();
            if (resultado && resultado.success) {
                await removerPendente(id);
                enviados++;
            }
        } catch (e) {
            // Ainda sem rede: o Background Sync tenta de novo mais tarde.
            throw e;
        }
    }

    if (enviados > 0) {
        await avisarClientes({ type: 'PENDING_SYNCED', enviados });
        if (self.registration.showNotification &&
            typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            self.registration.showNotification('Relatórios enviados', {
                body: `${enviados} relatório(s) pendente(s) foram enviados.`,
                icon: 'icon-192x192.png',
                tag: 'relop-sync'
            });
        }
    }
}

self.addEventListener('sync', event => {
    if (event.tag === SYNC_TAG) {
        // Se o waitUntil rejeitar, o navegador reagenda automaticamente.
        event.waitUntil(enviarPendentes());
    }
});

self.addEventListener('periodicsync', event => {
    if (event.tag === SYNC_TAG) event.waitUntil(enviarPendentes().catch(() => {}));
});
