// ═══════════════════════════════════════════════════════════════════════════
// Service Worker - Avatar Gespropiedad PWA
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'avatar-gespropiedad-v2.0.0';

// Archivos esenciales para cache inicial
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/audio-bank.json',
  '/manifest.json',
];

// Extensiones a cachear cuando se soliciten
const CACHEABLE_EXTENSIONS = [
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf',
  '.mp3', '.wav', '.ogg',
  '.riv'
];

// ═══════════════════════════════════════════════════════════════════════════
// Install - Precache assets esenciales
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('[SW] Installed');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Activate - Limpiar caches antiguos
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated');
        return self.clients.claim();
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Fetch - Estrategia: Network First, Cache Fallback
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) {
    return;
  }
  
  // No cachear config.local.json (tiene API keys)
  if (url.pathname.includes('config.local.json')) {
    return;
  }
  
  // No cachear WebSocket
  if (event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return;
  }

  // Verificar si es cacheable
  const isCacheable = CACHEABLE_EXTENSIONS.some(ext => url.pathname.endsWith(ext)) 
    || url.pathname === '/' 
    || url.pathname === '/index.html';

  if (!isCacheable) {
    return;
  }

  event.respondWith(
    // Intentar red primero
    fetch(event.request)
      .then((response) => {
        // Si es exitoso, cachear y retornar
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, usar cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', url.pathname);
              return cachedResponse;
            }
            
            // Fallback para navegación
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Message - Comunicación con la app
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});
