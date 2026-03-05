// Service Worker registration and offline system initialization
(function() {
  // Skip service worker in Capacitor — it serves files natively
  if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform()) {
    console.log('[PWA] Running in Capacitor — skipping service worker registration');
    // Still initialize offline system for API caching
    window.addEventListener('load', async () => {
      try {
        if (typeof OfflineStore !== 'undefined' && typeof OfflineSync !== 'undefined') {
          const store = new OfflineStore();
          await store.open();
          const sync = new OfflineSync(store);
          sync.installFetchInterceptor();
          window.offlineSync = sync;
          window.offlineStore = store;
          if (typeof OfflineUI !== 'undefined') {
            window.offlineUI = new OfflineUI(sync);
          }
          if (navigator.onLine) {
            sync.syncPendingMutations();
          }
          store.clearExpiredCache(7 * 24 * 60 * 60 * 1000).catch(() => {});
        }
      } catch (err) {
        console.error('[PWA] Offline system init failed:', err);
      }
    });
    return;
  }

  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service workers not supported');
    return;
  }

  // --- Register service worker ---
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('[PWA] Service worker registered, scope:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
            showUpdateNotification();
          }
        });
      });
    } catch (err) {
      console.error('[PWA] Service worker registration failed:', err);
    }

    // --- Initialize offline system ---
    try {
      if (typeof OfflineStore !== 'undefined' && typeof OfflineSync !== 'undefined') {
        const store = new OfflineStore();
        await store.open();

        const sync = new OfflineSync(store);
        sync.installFetchInterceptor();

        window.offlineSync = sync;
        window.offlineStore = store;

        if (typeof OfflineUI !== 'undefined') {
          window.offlineUI = new OfflineUI(sync);
        }

        // Sync any pending mutations on page load
        if (navigator.onLine) {
          sync.syncPendingMutations();
        }

        // Periodically clean expired cache entries (older than 7 days)
        store.clearExpiredCache(7 * 24 * 60 * 60 * 1000).catch(() => {});
      }
    } catch (err) {
      console.error('[PWA] Offline system init failed:', err);
    }
  });

  // --- Reload on SW controller change ---
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // --- Update notification ---
  function showUpdateNotification() {
    if (document.getElementById('sw-update-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.innerHTML = `
      <span>A new version is available!</span>
      <button onclick="window.location.reload()">Update</button>
    `;
    document.body.appendChild(bar);
  }
})();
