// Native Bridge — Capacitor native feature integration
// Falls back gracefully to no-ops when running in a regular browser
(function () {
  const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  window.isCapacitorNative = isNative;

  if (!isNative) return;

  // ---- Capacitor plugin imports (available globally via Capacitor) ----
  const { Plugins } = window.Capacitor;
  const SplashScreen = Plugins.SplashScreen;
  const StatusBar = Plugins.StatusBar;
  const Haptics = Plugins.Haptics;
  const Keyboard = Plugins.Keyboard;
  const App = Plugins.App;
  const PushNotifications = Plugins.PushNotifications;
  const Browser = Plugins.Browser;

  // ===========================
  // 1. SPLASH SCREEN
  // ===========================
  // Hide splash screen once the page is fully loaded
  window.addEventListener('load', () => {
    setTimeout(() => {
      SplashScreen.hide();
    }, 300);
  });

  // ===========================
  // 2. STATUS BAR
  // ===========================
  try {
    StatusBar.setStyle({ style: 'LIGHT' }); // Light text for dark nav
    StatusBar.setBackgroundColor({ color: '#2563eb' });
  } catch (e) {
    // StatusBar may not be available on all platforms
  }

  // ===========================
  // 3. HAPTIC FEEDBACK
  // ===========================
  // Add haptic feedback to buttons and interactive elements
  function addHaptics() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a.btn, .btn, [role="button"], .clickable, .nav-link');
      if (target) {
        try {
          Haptics.impact({ style: 'LIGHT' });
        } catch (e) { /* ignore */ }
      }
    }, true);

    // Medium haptic on form submissions
    document.addEventListener('submit', () => {
      try {
        Haptics.impact({ style: 'MEDIUM' });
      } catch (e) { /* ignore */ }
    }, true);
  }
  addHaptics();

  // Expose haptics for custom use in other scripts
  window.NativeHaptics = {
    light: () => { try { Haptics.impact({ style: 'LIGHT' }); } catch (e) { /* */ } },
    medium: () => { try { Haptics.impact({ style: 'MEDIUM' }); } catch (e) { /* */ } },
    heavy: () => { try { Haptics.impact({ style: 'HEAVY' }); } catch (e) { /* */ } },
    success: () => { try { Haptics.notification({ type: 'SUCCESS' }); } catch (e) { /* */ } },
    warning: () => { try { Haptics.notification({ type: 'WARNING' }); } catch (e) { /* */ } },
    error: () => { try { Haptics.notification({ type: 'ERROR' }); } catch (e) { /* */ } },
  };

  // ===========================
  // 4. KEYBOARD HANDLING
  // ===========================
  Keyboard.addListener('keyboardWillShow', (info) => {
    document.body.style.setProperty('--keyboard-height', info.keyboardHeight + 'px');
    document.body.classList.add('keyboard-open');
  });

  Keyboard.addListener('keyboardWillHide', () => {
    document.body.style.setProperty('--keyboard-height', '0px');
    document.body.classList.remove('keyboard-open');
  });

  // Dismiss keyboard when tapping outside input
  document.addEventListener('click', (e) => {
    if (!e.target.closest('input, textarea, select, [contenteditable]')) {
      Keyboard.hide().catch(() => {});
    }
  });

  // ===========================
  // 5. APP LIFECYCLE
  // ===========================
  App.addListener('appStateChange', (state) => {
    if (state.isActive) {
      // App came to foreground — refresh auth token if needed
      if (window.authHelper && typeof window.authHelper.refreshSession === 'function') {
        window.authHelper.refreshSession().catch(() => {});
      }
      // Sync pending offline mutations
      if (window.offlineSync && navigator.onLine) {
        window.offlineSync.syncPendingMutations();
      }
    }
  });

  // Handle back button (Android-style, but also useful for iOS gesture nav)
  App.addListener('backButton', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  // ===========================
  // 6. PUSH NOTIFICATIONS
  // ===========================
  async function initPushNotifications() {
    try {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.log('[Native] Push notification permission not granted');
        return;
      }

      await PushNotifications.register();

      // Token received — send to backend
      PushNotifications.addListener('registration', async (token) => {
        console.log('[Native] Push token:', token.value);
        try {
          // Store token locally
          localStorage.setItem('push_token', token.value);

          // Send to backend when auth is ready
          const sendToken = async () => {
            if (!window.authHelper) return;
            const headers = window.authHelper.getAuthHeaders();
            if (!headers['x-user-email']) return;

            await fetch('https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/devices/register', {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: token.value,
                platform: 'ios',
                email: headers['x-user-email'],
              }),
            });
          };

          // Try immediately, and also after a short delay (auth may not be ready yet)
          sendToken().catch(() => {});
          setTimeout(() => sendToken().catch(() => {}), 3000);
        } catch (e) {
          console.error('[Native] Failed to register push token:', e);
        }
      });

      // Registration error
      PushNotifications.addListener('registrationError', (error) => {
        console.error('[Native] Push registration error:', error);
      });

      // Notification received while app is open
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[Native] Push received:', notification);
        // Show an in-app notification banner
        showInAppNotification(notification.title, notification.body);
      });

      // Notification tapped
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('[Native] Push action:', action);
        const data = action.notification.data;
        // Navigate to relevant page if data contains a URL or project ID
        if (data && data.projectId) {
          window.location.href = 'project-details.html?id=' + data.projectId;
        } else if (data && data.url) {
          window.location.href = data.url;
        }
      });

    } catch (e) {
      console.error('[Native] Push notification init failed:', e);
    }
  }

  // In-app notification banner
  function showInAppNotification(title, body) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed; top: env(safe-area-inset-top, 0); left: 12px; right: 12px;
      background: var(--surface-color, #fff); color: var(--text-primary, #333);
      padding: 14px 16px; border-radius: 12px; z-index: 99999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15); font-size: 14px;
      transform: translateY(-100%); transition: transform 0.3s ease;
      margin-top: 8px; cursor: pointer;
    `;
    banner.innerHTML = `<strong style="display:block;margin-bottom:2px;">${title || 'Notification'}</strong><span>${body || ''}</span>`;
    document.body.appendChild(banner);

    // Add haptic
    try { Haptics.notification({ type: 'SUCCESS' }); } catch (e) { /* */ }

    requestAnimationFrame(() => {
      banner.style.transform = 'translateY(0)';
    });

    banner.addEventListener('click', () => banner.remove());
    setTimeout(() => {
      banner.style.transform = 'translateY(-100%)';
      setTimeout(() => banner.remove(), 300);
    }, 4000);
  }

  // Initialize push when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPushNotifications);
  } else {
    initPushNotifications();
  }

  // ===========================
  // 7. EXTERNAL LINKS
  // ===========================
  // Open external links in in-app browser instead of leaving the app
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href]');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Only intercept external URLs (not local page navigation)
    if (href.startsWith('http://') || href.startsWith('https://')) {
      // Skip API calls and known internal domains
      const internalDomains = [
        'o2ji337dna.execute-api.us-east-1.amazonaws.com',
        'script.google.com',
        'cognito-idp.us-east-1.amazonaws.com',
      ];
      const url = new URL(href);
      if (internalDomains.some(d => url.hostname.includes(d))) return;

      e.preventDefault();
      Browser.open({ url: href });
    }
  }, true);

  console.log('[Native] Capacitor native bridge initialized');
})();
