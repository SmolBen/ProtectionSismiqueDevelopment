// IndexedDB wrapper for PWA offline storage
class OfflineStore {
  constructor() {
    this.dbName = 'ps-offline-db';
    this.dbVersion = 1;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // API response cache
        if (!db.objectStoreNames.contains('api-cache')) {
          const apiStore = db.createObjectStore('api-cache', { keyPath: 'url' });
          apiStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Offline mutation queue
        if (!db.objectStoreNames.contains('mutation-queue')) {
          const mutStore = db.createObjectStore('mutation-queue', { keyPath: 'id' });
          mutStore.createIndex('timestamp', 'timestamp', { unique: false });
          mutStore.createIndex('status', 'status', { unique: false });
        }

        // App metadata
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[OfflineStore] Failed to open DB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- API Cache operations ---

  async cacheApiResponse(url, data) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('api-cache', 'readwrite');
      tx.objectStore('api-cache').put({
        url: url,
        data: data,
        timestamp: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getCachedResponse(url) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('api-cache', 'readonly');
      const request = tx.objectStore('api-cache').get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getCachedResponses(urlPrefix) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('api-cache', 'readonly');
      const store = tx.objectStore('api-cache');
      const results = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.url.startsWith(urlPrefix)) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clearApiCache() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('api-cache', 'readwrite');
      tx.objectStore('api-cache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async clearExpiredCache(maxAgeMs) {
    await this.open();
    const cutoff = Date.now() - maxAgeMs;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('api-cache', 'readwrite');
      const store = tx.objectStore('api-cache');
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Mutation queue operations ---

  async queueMutation(mutation) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readwrite');
      tx.objectStore('mutation-queue').put(mutation);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getPendingMutations() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readonly');
      const index = tx.objectStore('mutation-queue').index('timestamp');
      const results = [];
      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.status === 'pending') {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllMutations() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readonly');
      const index = tx.objectStore('mutation-queue').index('timestamp');
      const results = [];
      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async updateMutationStatus(id, status, error) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readwrite');
      const store = tx.objectStore('mutation-queue');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const mutation = getReq.result;
        if (mutation) {
          mutation.status = status;
          if (error !== undefined) mutation.error = error;
          if (status === 'syncing') mutation.retryCount = (mutation.retryCount || 0) + 1;
          store.put(mutation);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async removeMutation(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readwrite');
      tx.objectStore('mutation-queue').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getPendingCount() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readonly');
      const index = tx.objectStore('mutation-queue').index('status');
      const range = IDBKeyRange.only('pending');
      const request = index.count(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async clearCompletedMutations() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('mutation-queue', 'readwrite');
      const store = tx.objectStore('mutation-queue');
      const index = store.index('status');
      const range = IDBKeyRange.only('completed');
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Metadata operations ---

  async setMetadata(key, value) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('metadata', 'readwrite');
      tx.objectStore('metadata').put({
        key: key,
        value: value,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getMetadata(key) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('metadata', 'readonly');
      const request = tx.objectStore('metadata').get(key);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }
}

// Expose globally
window.OfflineStore = OfflineStore;
