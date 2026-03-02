// Offline sync — fetch interceptor, mutation queuing, and sync-on-reconnect
class OfflineSync {
  constructor(offlineStore) {
    this.store = offlineStore;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.listeners = [];

    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Listen for mutation queue messages from service worker
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'QUEUE_MUTATION') {
          this.store.queueMutation({
            ...e.data.mutation,
            status: 'pending',
            retryCount: 0
          }).then(() => this.notifyListeners());
        }
      });
    }
  }

  // --- Listener management ---

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(); } catch (e) { console.error('[OfflineSync] Listener error:', e); }
    });
  }

  // --- Online/offline handlers ---

  async handleOnline() {
    console.log('[OfflineSync] Back online');
    this.isOnline = true;
    this.notifyListeners();
    await this.syncPendingMutations();
  }

  handleOffline() {
    console.log('[OfflineSync] Gone offline');
    this.isOnline = false;
    this.notifyListeners();
  }

  // --- Fetch interceptor ---

  installFetchInterceptor() {
    const originalFetch = window.fetch;
    const self = this;
    const API_BASE = 'https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev';

    // Endpoints that cannot work offline (need server-side processing)
    const BLOCKED_OFFLINE_PATTERNS = [
      '/report',
      '/cfss-report',
      '/image-upload-url',
      '/file-upload-url',
      '/file-download-url',
      '/images/sign',
      '/templates/sign',
      '/bulk-verify'
    ];

    window.fetch = async function(url, options = {}) {
      const urlStr = typeof url === 'string' ? url : url.url;

      // Only intercept API calls
      if (!urlStr.startsWith(API_BASE)) {
        return originalFetch.call(window, url, options);
      }

      const method = (options.method || 'GET').toUpperCase();

      // --- GET requests: network-first with IndexedDB fallback ---
      if (method === 'GET') {
        try {
          const response = await originalFetch.call(window, url, options);
          if (response.ok) {
            // Cache successful response in IndexedDB
            const cloned = response.clone();
            try {
              const data = await cloned.json();
              await self.store.cacheApiResponse(urlStr, data);
            } catch (e) {
              // Response wasn't JSON, skip caching
            }
          }
          return response;
        } catch (err) {
          // Network failed — try IndexedDB cache
          console.log('[OfflineSync] Network failed for GET, trying cache:', urlStr);
          const cached = await self.store.getCachedResponse(urlStr);
          if (cached) {
            return new Response(JSON.stringify(cached.data), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'X-Offline-Cache': 'true'
              }
            });
          }
          throw err;
        }
      }

      // --- POST/PUT/DELETE: try network, queue if offline ---

      // Check if this endpoint is blocked offline
      if (!navigator.onLine) {
        const isBlocked = BLOCKED_OFFLINE_PATTERNS.some(pattern => urlStr.includes(pattern));
        if (isBlocked) {
          return new Response(JSON.stringify({
            error: true,
            offline: true,
            message: 'This feature is not available offline.'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      try {
        if (!navigator.onLine) throw new Error('Offline');
        return await originalFetch.call(window, url, options);
      } catch (err) {
        // Check blocked endpoints even if we tried and failed
        const isBlocked = BLOCKED_OFFLINE_PATTERNS.some(pattern => urlStr.includes(pattern));
        if (isBlocked) {
          return new Response(JSON.stringify({
            error: true,
            offline: true,
            message: 'This feature is not available offline.'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Queue the mutation
        const mutation = {
          id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          url: urlStr,
          method: method,
          headers: options.headers ? (typeof options.headers === 'object' && !(options.headers instanceof Headers)
            ? options.headers
            : Object.fromEntries(new Headers(options.headers).entries()))
            : {},
          body: options.body || null,
          timestamp: Date.now(),
          status: 'pending',
          retryCount: 0,
          error: null,
          description: self.describeMutation(urlStr, method, options.body)
        };

        await self.store.queueMutation(mutation);
        self.notifyListeners();

        console.log('[OfflineSync] Queued mutation:', mutation.description);

        // Return synthetic success so the UI doesn't break
        return new Response(JSON.stringify({
          queued: true,
          offlineId: mutation.id,
          message: 'Saved offline. Will sync when back online.'
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Offline-Queued': 'true'
          }
        });
      }
    };
  }

  // --- Sync pending mutations ---

  async syncPendingMutations() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    console.log('[OfflineSync] Starting sync...');

    try {
      // Refresh auth headers before syncing
      const freshHeaders = await this.getFreshHeaders();
      if (!freshHeaders) {
        console.warn('[OfflineSync] Cannot refresh auth — mutations will use original headers');
      }

      const mutations = await this.store.getPendingMutations();
      if (mutations.length === 0) {
        console.log('[OfflineSync] No pending mutations');
        return;
      }

      console.log(`[OfflineSync] Syncing ${mutations.length} mutations...`);

      for (const mutation of mutations) {
        try {
          await this.store.updateMutationStatus(mutation.id, 'syncing');
          this.notifyListeners();

          // Use fresh headers if available, otherwise use original
          const headers = freshHeaders
            ? { ...mutation.headers, ...freshHeaders }
            : mutation.headers;

          const response = await fetch(mutation.url, {
            method: mutation.method,
            headers: headers,
            body: mutation.body
          });

          if (response.ok) {
            console.log('[OfflineSync] Synced:', mutation.description);
            await this.store.updateMutationStatus(mutation.id, 'completed');
          } else if (response.status === 401 || response.status === 403) {
            await this.store.updateMutationStatus(
              mutation.id, 'failed',
              'Authentication expired. Please login again and retry.'
            );
          } else if (response.status === 409) {
            const errorData = await response.json().catch(() => ({}));
            await this.store.updateMutationStatus(
              mutation.id, 'failed',
              `Conflict: ${errorData.message || 'Data changed on server'}`
            );
          } else {
            if ((mutation.retryCount || 0) >= 3) {
              await this.store.updateMutationStatus(
                mutation.id, 'failed',
                `Server error: ${response.status}`
              );
            } else {
              await this.store.updateMutationStatus(mutation.id, 'pending');
            }
          }
        } catch (err) {
          // Network failed during sync — stop, we're probably offline again
          console.warn('[OfflineSync] Sync interrupted:', err.message);
          await this.store.updateMutationStatus(mutation.id, 'pending');
          break;
        }

        this.notifyListeners();
      }

      // Clean up completed mutations
      await this.store.clearCompletedMutations();
    } finally {
      this.syncInProgress = false;
      this.notifyListeners();
      console.log('[OfflineSync] Sync complete');
    }
  }

  // --- Auth header refresh ---

  async getFreshHeaders() {
    if (typeof authHelper !== 'undefined' && authHelper) {
      try {
        // This triggers Cognito token refresh if needed
        const session = await new Promise((resolve, reject) => {
          const user = authHelper.userPool
            ? authHelper.userPool.getCurrentUser()
            : null;
          if (!user) return reject(new Error('No user'));
          user.getSession((err, session) => {
            if (err) reject(err);
            else resolve(session);
          });
        });

        if (session && session.isValid()) {
          return authHelper.getAuthHeaders();
        }
      } catch (e) {
        console.warn('[OfflineSync] Could not refresh auth:', e.message);
      }
    }
    return null;
  }

  // --- Mutation description generator ---

  describeMutation(url, method, body) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;

      if (method === 'POST' && path.endsWith('/projects')) {
        const data = JSON.parse(body || '{}');
        return `Create project: ${data.name || data.projectName || 'Unknown'}`;
      }
      if (method === 'PUT' && path.includes('/projects')) {
        const data = JSON.parse(body || '{}');
        return `Update project: ${data.name || data.projectName || data.id || 'Unknown'}`;
      }
      if (method === 'DELETE' && path.includes('/projects')) {
        return 'Delete project';
      }
      if (path.includes('/cfss-data')) {
        return 'Save CFSS wall data';
      }
      if (path.includes('/equipment')) {
        return 'Update equipment';
      }
      if (path.includes('/wall-revisions')) {
        return 'Save wall revisions';
      }
      if (path.includes('/users/approve')) {
        return 'Approve user';
      }
      if (path.includes('/users/promote')) {
        return 'Promote user';
      }
      if (path.includes('/users/demote')) {
        return 'Demote user';
      }

      return `${method} ${path}`;
    } catch (e) {
      return `${method} request`;
    }
  }
}

// Expose globally
window.OfflineSync = OfflineSync;
