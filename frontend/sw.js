// Service Worker for Protection Sismique PWA
const CACHE_VERSION = 4;
const APP_SHELL_CACHE = `ps-app-shell-v${CACHE_VERSION}`;
const CDN_CACHE = `ps-cdn-v${CACHE_VERSION}`;
const API_CACHE = `ps-api-v${CACHE_VERSION}`;
const ALL_CACHES = [APP_SHELL_CACHE, CDN_CACHE, API_CACHE];

// All local files to precache on install
const APP_SHELL_URLS = [
  // HTML pages
  'auth.html',
  'index.html',
  'dashboard.html',
  'create-project.html',
  'create-project-overview.html',
  'project-details.html',
  'cfss-dashboard.html',
  'cfss-create-project.html',
  'cfss-project-details.html',
  'cfss-verify-bulk-projects.html',
  'email-classifications.html',
  'user-management.html',
  'limited-cfss-dashboard.html',
  'limited-cfss-create-project.html',
  'limited-cfss-project-details.html',
  // JavaScript files
  'auth.js',
  'auth-helper.js',
  'scripts.js',
  'dashboard.js',
  'create-project.js',
  'project-details.js',
  'project-details-init.js',
  'project-reassign.js',
  'cfss-dashboard.js',
  'cfss-create-project.js',
  'cfss-project-details.js',
  'cfss-project-details-init.js',
  'cfss-custom-pages.js',
  'cfss-wall-calc-data.js',
  'cfss-wall-calc-logic.js',
  'cfss-wall-calc-ui.js',
  'cfss-verify-bulk-projects.js',
  'user-management.js',
  'limited-cfss-dashboard.js',
  'limited-cfss-create-project.js',
  'limited-cfss-project-details.js',
  'translations.js',
  'i18n.js',
  // config.js excluded — gitignored, will lazy-cache at runtime via cache-first strategy
  'offline-store.js',
  'offline-sync.js',
  'offline-ui.js',
  'sw-register.js',
  // CSS files
  'styles.css',
  'auth.css',
  'dashboard.css',
  'create-project.css',
  'project-details.css',
  'cfss-project-details.css',
  'email.css',
  'review-tab.css',
  'user-management.css',
  // Manifest & icons
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// --- Install: precache app shell ---
self.addEventListener('install', event => {
  console.log('[SW] Installing, cache version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('[SW] Precache failed:', err);
        throw err;
      })
  );
});

// --- Activate: clean old caches ---
self.addEventListener('activate', event => {
  console.log('[SW] Activating, cleaning old caches');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// --- Fetch: route requests to appropriate cache strategy ---
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests for caching
  if (event.request.method !== 'GET') {
    return;
  }

  // App shell files (same origin) — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, APP_SHELL_CACHE));
    return;
  }

  // CDN resources — cache-first (lazy cached on first fetch)
  if (isCdnUrl(url)) {
    event.respondWith(cacheFirst(event.request, CDN_CACHE));
    return;
  }

  // API Gateway GET requests — network-first with cache fallback
  if (isApiUrl(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // Google Apps Script — network-first with cache fallback
  if (isAppsScriptUrl(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // S3 presigned URLs — pass through (they expire, don't cache)
  // Everything else — pass through
});

// --- URL classification helpers ---
function isCdnUrl(url) {
  return url.hostname === 'cdn.jsdelivr.net' ||
         url.hostname === 'cdnjs.cloudflare.com' ||
         url.hostname === 'unpkg.com' ||
         url.hostname.endsWith('.fontawesome.com');
}

function isApiUrl(url) {
  return url.hostname === 'o2ji337dna.execute-api.us-east-1.amazonaws.com';
}

function isAppsScriptUrl(url) {
  return url.hostname === 'script.google.com' ||
         url.hostname === 'script.googleusercontent.com';
}

// --- Cache strategies ---

// Cache-first: serve from cache, fall back to network (and cache the result)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // For navigation requests, return cached auth.html as offline fallback
    if (request.mode === 'navigate') {
      const fallback = await caches.match('auth.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    // Return a synthetic offline response for API requests
    return new Response(
      JSON.stringify({ offline: true, message: 'You are offline. Showing cached data.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// --- Message handler for skip waiting ---
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
