// i18n.js - Internationalization engine for Protection Sismique
// Supports French (default) and English

(function() {
    const DEFAULT_LANG = 'fr';
    const SUPPORTED_LANGS = ['fr', 'en'];
    const STORAGE_KEY = 'lang';

    // Get current language from localStorage
    function getCurrentLanguage() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
        return DEFAULT_LANG;
    }

    // Translate a key like 'section.key' or 'section.nested.key'
    // Optional params object replaces {placeholder} tokens in the string.
    function t(key, params) {
        const lang = getCurrentLanguage();
        const dict = window.translations && window.translations[lang];
        if (!dict) return key;

        function interpolate(str) {
            if (!params || typeof str !== 'string') return str;
            return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
        }

        const parts = key.split('.');
        let val = dict;
        for (const part of parts) {
            if (val && typeof val === 'object' && part in val) {
                val = val[part];
            } else {
                // Fallback to English if French key missing, or return key
                if (lang !== 'en' && window.translations.en) {
                    let fallback = window.translations.en;
                    for (const p of parts) {
                        if (fallback && typeof fallback === 'object' && p in fallback) {
                            fallback = fallback[p];
                        } else {
                            return key;
                        }
                    }
                    return typeof fallback === 'string' ? interpolate(fallback) : key;
                }
                return key;
            }
        }
        return typeof val === 'string' ? interpolate(val) : key;
    }

    // Apply translations to all DOM elements with data-i18n attributes
    function applyTranslations() {
        // data-i18n -> textContent
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                const translated = t(key);
                if (translated !== key) {
                    // For elements with child nodes (like icons), only replace text nodes
                    if (el.children.length > 0) {
                        // Find or create a text span
                        let textSpan = el.querySelector('.i18n-text');
                        if (textSpan) {
                            textSpan.textContent = translated;
                        } else {
                            // Replace the last text node
                            const nodes = el.childNodes;
                            let found = false;
                            for (let i = nodes.length - 1; i >= 0; i--) {
                                if (nodes[i].nodeType === Node.TEXT_NODE && nodes[i].textContent.trim()) {
                                    nodes[i].textContent = '\n                    ' + translated + '\n                ';
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                el.appendChild(document.createTextNode(' ' + translated));
                            }
                        }
                    } else {
                        el.textContent = translated;
                    }
                }
            }
        });

        // data-i18n-placeholder -> placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                const translated = t(key);
                if (translated !== key) el.placeholder = translated;
            }
        });

        // data-i18n-title -> title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                const translated = t(key);
                if (translated !== key) el.title = translated;
            }
        });

        // data-i18n-html -> innerHTML (use sparingly, for trusted content only)
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (key) {
                const translated = t(key);
                if (translated !== key) el.innerHTML = translated;
            }
        });

        // Update the toggle button state
        updateToggleState();
    }

    // Set language and re-apply
    function setLanguage(lang) {
        if (!SUPPORTED_LANGS.includes(lang)) return;
        localStorage.setItem(STORAGE_KEY, lang);
        applyTranslations();
    }

    // Toggle between FR and EN
    function toggleLanguage() {
        const current = getCurrentLanguage();
        setLanguage(current === 'fr' ? 'en' : 'fr');
    }

    // Update toggle button visual state
    function updateToggleState() {
        const toggle = document.getElementById('langToggle');
        if (!toggle) return;
        const lang = getCurrentLanguage();
        const frBtn = toggle.querySelector('.lang-fr');
        const enBtn = toggle.querySelector('.lang-en');
        if (frBtn && enBtn) {
            frBtn.classList.toggle('active', lang === 'fr');
            enBtn.classList.toggle('active', lang === 'en');
        }
    }

    // Inject toggle CSS
    function injectToggleStyles() {
        if (document.getElementById('i18n-toggle-styles')) return;
        const style = document.createElement('style');
        style.id = 'i18n-toggle-styles';
        style.textContent = `
            .lang-toggle {
                display: inline-flex;
                align-items: center;
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: 4px;
                overflow: hidden;
                margin-left: 10px;
                flex-shrink: 0;
            }
            .lang-toggle button {
                background: transparent;
                color: rgba(255,255,255,0.6);
                border: none;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                letter-spacing: 0.5px;
            }
            .lang-toggle button.active {
                background: rgba(255,255,255,0.2);
                color: #fff;
            }
            .lang-toggle button:hover:not(.active) {
                background: rgba(255,255,255,0.1);
                color: rgba(255,255,255,0.8);
            }
            /* Auth page variant */
            .auth-lang-toggle {
                display: inline-flex;
                align-items: center;
                border: 1px solid #ddd;
                border-radius: 4px;
                overflow: hidden;
                position: absolute;
                top: 15px;
                right: 15px;
            }
            .auth-lang-toggle button {
                background: transparent;
                color: #999;
                border: none;
                padding: 4px 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                letter-spacing: 0.5px;
            }
            .auth-lang-toggle button.active {
                background: var(--primary-color, #2563eb);
                color: #fff;
            }
            .auth-lang-toggle button:hover:not(.active) {
                background: #f0f0f0;
                color: #666;
            }
        `;
        document.head.appendChild(style);
    }

    // Create toggle HTML
    function createToggleHTML(isAuth) {
        const lang = getCurrentLanguage();
        const cssClass = isAuth ? 'auth-lang-toggle' : 'lang-toggle';
        return `<div class="${cssClass}" id="langToggle">
            <button class="lang-fr ${lang === 'fr' ? 'active' : ''}" onclick="setLanguage('fr')">FR</button>
            <button class="lang-en ${lang === 'en' ? 'active' : ''}" onclick="setLanguage('en')">EN</button>
        </div>`;
    }

    // Initialize the language toggle on the page
    function initLanguageToggle() {
        injectToggleStyles();

        // Check if we're on the auth page (no navbar)
        const authContainer = document.querySelector('.auth-container');
        const navbarContent = document.querySelector('.navbar-content');

        if (navbarContent) {
            // Standard page with navbar - insert before userInfo
            const userInfo = document.getElementById('userInfo');
            if (userInfo && !document.getElementById('langToggle')) {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = createToggleHTML(false);
                const toggle = wrapper.firstElementChild;
                navbarContent.insertBefore(toggle, userInfo);
            }
        } else if (authContainer) {
            // Auth page - insert at top of auth container
            if (!document.getElementById('langToggle')) {
                authContainer.style.position = 'relative';
                const wrapper = document.createElement('div');
                wrapper.innerHTML = createToggleHTML(true);
                const toggle = wrapper.firstElementChild;
                authContainer.insertBefore(toggle, authContainer.firstChild);
            }
        }
    }

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initLanguageToggle();
            applyTranslations();
        });
    } else {
        initLanguageToggle();
        applyTranslations();
    }

    // Expose globally
    window.t = t;
    window.getCurrentLanguage = getCurrentLanguage;
    window.setLanguage = setLanguage;
    window.toggleLanguage = toggleLanguage;
    window.applyTranslations = applyTranslations;
    window.initLanguageToggle = initLanguageToggle;
})();
