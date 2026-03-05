// Offline UI — banner, sync badge, install prompt, sync detail modal
class OfflineUI {
  constructor(offlineSync) {
    this.sync = offlineSync;
    this.banner = null;
    this.syncBadge = null;
    this.installPrompt = null;
    this.modal = null;

    this.createBanner();
    this.createSyncBadge();
    this.createModal();
    this.listenForInstall();

    this.sync.addListener(() => this.update());
    this.update();
  }

  // --- Offline banner ---

  createBanner() {
    this.banner = document.createElement('div');
    this.banner.id = 'offline-banner';
    this.banner.innerHTML = `
      <i class="fas fa-wifi" style="font-size: 16px; opacity: 0.9;"></i>
      <span>You are offline. Changes will sync when you reconnect.</span>
    `;
    document.body.prepend(this.banner);

    // Add styles
    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('offline-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'offline-ui-styles';
    style.textContent = `
      #offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ef4444;
        color: white;
        text-align: center;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10000;
        transform: translateY(-100%);
        transition: transform 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      #offline-banner.visible {
        transform: translateY(0);
      }
      body.offline-mode .navbar {
        top: 36px;
      }
      #sync-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--primary-color, #2563eb);
        color: white;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 700;
        z-index: 9999;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
      }
      #sync-badge:hover {
        transform: scale(1.1);
      }
      #sync-badge.has-items {
        display: flex;
      }
      #sync-badge.syncing {
        animation: syncPulse 1.5s infinite;
      }
      @keyframes syncPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
      #sync-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 10001;
        display: none;
        align-items: center;
        justify-content: center;
      }
      #sync-modal-overlay.visible {
        display: flex;
      }
      #sync-modal {
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      #sync-modal h3 {
        margin: 0 0 16px;
        font-size: 18px;
        color: var(--text-primary, #0f172a);
      }
      .sync-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 8px;
        margin-bottom: 8px;
      }
      .sync-item-info {
        flex: 1;
      }
      .sync-item-desc {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #0f172a);
      }
      .sync-item-time {
        font-size: 12px;
        color: var(--text-secondary, #475569);
        margin-top: 2px;
      }
      .sync-item-error {
        font-size: 12px;
        color: #ef4444;
        margin-top: 4px;
      }
      .sync-item-status {
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        margin-left: 8px;
        white-space: nowrap;
      }
      .sync-item-status.pending { background: #fef3c7; color: #92400e; }
      .sync-item-status.syncing { background: #dbeafe; color: #1e40af; }
      .sync-item-status.failed { background: #fee2e2; color: #991b1b; }
      .sync-item-actions {
        display: flex;
        gap: 6px;
        margin-left: 8px;
      }
      .sync-item-actions button {
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      }
      .sync-btn-retry { background: #dbeafe; color: #1e40af; }
      .sync-btn-discard { background: #fee2e2; color: #991b1b; }
      .sync-modal-close {
        border: none;
        background: var(--border-color, #e2e8f0);
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin-top: 12px;
        width: 100%;
      }
      .sync-empty {
        text-align: center;
        color: var(--text-secondary, #475569);
        padding: 20px;
        font-size: 14px;
      }
      #ios-install-prompt {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        animation: iosPromptSlideDown 0.4s ease;
      }
      @keyframes iosPromptSlideDown {
        from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      .ios-install-content {
        background: white;
        border-radius: 12px;
        padding: 16px 40px 16px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        display: flex;
        align-items: center;
        gap: 12px;
        position: relative;
        max-width: 340px;
      }
      .ios-install-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 14px;
        color: var(--text-primary, #0f172a);
        line-height: 1.4;
      }
      .ios-install-text span {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        color: var(--text-secondary, #475569);
      }
      .ios-share-icon {
        vertical-align: middle;
        color: #007aff;
        flex-shrink: 0;
      }
      .ios-install-close {
        position: absolute;
        top: 6px;
        right: 8px;
        border: none;
        background: none;
        font-size: 20px;
        color: var(--text-secondary, #94a3b8);
        cursor: pointer;
        padding: 4px;
        line-height: 1;
      }
      .ios-install-arrow {
        display: none;
      }
      #sw-update-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #1d4ed8;
        color: white;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        z-index: 10001;
        font-size: 14px;
      }
      #sw-update-bar button {
        background: white;
        color: #1d4ed8;
        border: none;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Sync badge ---

  createSyncBadge() {
    this.syncBadge = document.createElement('div');
    this.syncBadge.id = 'sync-badge';
    this.syncBadge.title = 'Pending offline changes';
    this.syncBadge.addEventListener('click', () => this.showSyncDetails());
    document.body.appendChild(this.syncBadge);
  }

  // --- Sync detail modal ---

  createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'sync-modal-overlay';
    this.modal.innerHTML = `
      <div id="sync-modal">
        <h3>Offline Changes</h3>
        <div id="sync-modal-list"></div>
        <button class="sync-modal-close" onclick="window.offlineUI.hideModal()">Close</button>
      </div>
    `;
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hideModal();
    });
    document.body.appendChild(this.modal);
  }

  async showSyncDetails() {
    const list = document.getElementById('sync-modal-list');
    const mutations = await this.sync.store.getAllMutations();

    if (mutations.length === 0) {
      list.innerHTML = '<div class="sync-empty">No pending changes</div>';
    } else {
      list.innerHTML = mutations.map(m => `
        <div class="sync-item">
          <div class="sync-item-info">
            <div class="sync-item-desc">${this.escapeHtml(m.description)}</div>
            <div class="sync-item-time">${new Date(m.timestamp).toLocaleString()}</div>
            ${m.error ? `<div class="sync-item-error">${this.escapeHtml(m.error)}</div>` : ''}
          </div>
          <span class="sync-item-status ${m.status}">${m.status}</span>
          ${m.status === 'failed' ? `
            <div class="sync-item-actions">
              <button class="sync-btn-retry" onclick="window.offlineUI.retryMutation('${m.id}')">Retry</button>
              <button class="sync-btn-discard" onclick="window.offlineUI.discardMutation('${m.id}')">Discard</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    }

    this.modal.classList.add('visible');
  }

  hideModal() {
    this.modal.classList.remove('visible');
  }

  async retryMutation(id) {
    await this.sync.store.updateMutationStatus(id, 'pending', null);
    if (navigator.onLine) {
      await this.sync.syncPendingMutations();
    }
    this.showSyncDetails(); // Refresh modal
  }

  async discardMutation(id) {
    await this.sync.store.removeMutation(id);
    this.sync.notifyListeners();
    this.showSyncDetails(); // Refresh modal
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // --- Install prompt ---

  listenForInstall() {
    // Native app available — no PWA install prompts needed
  }

  // --- Update state ---

  async update() {
    // Offline banner
    if (!navigator.onLine) {
      this.banner.classList.add('visible');
      document.body.classList.add('offline-mode');
    } else {
      this.banner.classList.remove('visible');
      document.body.classList.remove('offline-mode');
    }

    // Sync badge
    try {
      const pendingCount = await this.sync.store.getPendingCount();
      const allMutations = await this.sync.store.getAllMutations();
      const totalActive = allMutations.filter(m => m.status !== 'completed').length;

      if (totalActive > 0) {
        this.syncBadge.textContent = totalActive;
        this.syncBadge.classList.add('has-items');
        this.syncBadge.classList.toggle('syncing', this.sync.syncInProgress);
      } else {
        this.syncBadge.classList.remove('has-items', 'syncing');
      }
    } catch (e) {
      // DB not ready yet, ignore
    }
  }
}

// Expose globally
window.OfflineUI = OfflineUI;
