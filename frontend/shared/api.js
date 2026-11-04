/**
 * LOUVORAPP - CLIENTE DE API, GERENCIADOR DE TEMAS (CLARO / ESCURO / SISTEMA) E UTILITÁRIOS
 * Gerencia comunicação com o backend, autenticação de sessão, temas dinâmicos, toasts e modais globais.
 */
(function (window) {
  const TOKEN_STORAGE_KEY = 'louvorapp_session_token';
  const USER_CACHE_KEY = 'louvorapp_cached_user';
  const THEME_STORAGE_KEY = 'louvorapp_theme_pref';

  const TAILWIND_DESIGN_CONFIG = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          'background': 'rgb(var(--rgb-surface) / <alpha-value>)',
          'on-background': 'rgb(var(--rgb-on-surface) / <alpha-value>)',
          'on-tertiary-fixed': 'rgb(var(--rgb-on-tertiary-fixed) / <alpha-value>)',
          'primary': 'rgb(var(--rgb-primary) / <alpha-value>)',
          'primary-container': 'rgb(var(--rgb-primary-container) / <alpha-value>)',
          'secondary-container': 'rgb(var(--rgb-secondary-container) / <alpha-value>)',
          'tertiary-fixed': 'rgb(var(--rgb-tertiary-fixed) / <alpha-value>)',
          'surface-variant': 'rgb(var(--rgb-surface-variant) / <alpha-value>)',
          'tertiary-fixed-dim': 'rgb(var(--rgb-tertiary-fixed-dim) / <alpha-value>)',
          'on-primary-fixed': 'rgb(var(--rgb-on-primary-fixed) / <alpha-value>)',
          'inverse-on-surface': 'rgb(var(--rgb-inverse-on-surface) / <alpha-value>)',
          'on-secondary-fixed': 'rgb(var(--rgb-on-secondary-fixed) / <alpha-value>)',
          'on-secondary': 'rgb(var(--rgb-on-secondary) / <alpha-value>)',
          'primary-fixed': 'rgb(var(--rgb-primary-fixed) / <alpha-value>)',
          'surface-tint': 'rgb(var(--rgb-primary) / <alpha-value>)',
          'on-tertiary-container': 'rgb(var(--rgb-on-tertiary-container) / <alpha-value>)',
          'outline-variant': 'rgb(var(--rgb-outline-variant) / <alpha-value>)',
          'surface': 'rgb(var(--rgb-surface) / <alpha-value>)',
          'on-secondary-container': 'rgb(var(--rgb-on-secondary-container) / <alpha-value>)',
          'on-surface': 'rgb(var(--rgb-on-surface) / <alpha-value>)',
          'surface-container-low': 'rgb(var(--rgb-surface-container-low) / <alpha-value>)',
          'on-surface-variant': 'rgb(var(--rgb-on-surface-variant) / <alpha-value>)',
          'secondary-fixed': 'rgb(var(--rgb-secondary-fixed) / <alpha-value>)',
          'on-tertiary-fixed-variant': 'rgb(var(--rgb-on-tertiary-fixed-variant) / <alpha-value>)',
          'on-primary': 'rgb(var(--rgb-on-primary) / <alpha-value>)',
          'primary-fixed-dim': 'rgb(var(--rgb-primary-fixed-dim) / <alpha-value>)',
          'on-error-container': 'rgb(var(--rgb-on-error-container) / <alpha-value>)',
          'error-container': 'rgb(var(--rgb-error-container) / <alpha-value>)',
          'outline': 'rgb(var(--rgb-outline) / <alpha-value>)',
          'tertiary': 'rgb(var(--rgb-tertiary) / <alpha-value>)',
          'surface-container': 'rgb(var(--rgb-surface-container) / <alpha-value>)',
          'surface-dim': 'rgb(var(--rgb-surface-dim) / <alpha-value>)',
          'on-tertiary': 'rgb(var(--rgb-on-tertiary) / <alpha-value>)',
          'error': 'rgb(var(--rgb-error) / <alpha-value>)',
          'secondary': 'rgb(var(--rgb-secondary) / <alpha-value>)',
          'surface-container-lowest': 'rgb(var(--rgb-surface-container-lowest) / <alpha-value>)',
          'inverse-primary': 'rgb(var(--rgb-inverse-primary) / <alpha-value>)',
          'surface-container-high': 'rgb(var(--rgb-surface-container-high) / <alpha-value>)',
          'surface-bright': 'rgb(var(--rgb-surface-bright) / <alpha-value>)',
          'on-primary-fixed-variant': 'rgb(var(--rgb-on-primary-fixed-variant) / <alpha-value>)',
          'tertiary-container': 'rgb(var(--rgb-tertiary-container) / <alpha-value>)',
          'on-secondary-fixed-variant': 'rgb(var(--rgb-on-secondary-fixed-variant) / <alpha-value>)',
          'surface-container-highest': 'rgb(var(--rgb-surface-container-highest) / <alpha-value>)',
          'on-primary-container': 'rgb(var(--rgb-on-primary-container) / <alpha-value>)',
          'inverse-surface': 'rgb(var(--rgb-inverse-surface) / <alpha-value>)',
          'on-error': 'rgb(var(--rgb-on-error) / <alpha-value>)',
          'secondary-fixed-dim': 'rgb(var(--rgb-secondary-fixed-dim) / <alpha-value>)'
        },
        borderRadius: {
          DEFAULT: '0.25rem',
          lg: '0.5rem',
          xl: '0.75rem',
          '2xl': '1rem',
          full: '9999px'
        },
        spacing: {
          margin: '1rem',
          'space-xs': '0.25rem',
          'space-sm': '0.5rem',
          'space-md': '1rem',
          'space-lg': '1.5rem',
          'space-xl': '2rem',
          gutter: '1rem'
        },
        fontFamily: {
          'headline-xl': ['Plus Jakarta Sans', 'sans-serif'],
          'body-md': ['Inter', 'sans-serif'],
          'headline-lg-mobile': ['Plus Jakarta Sans', 'sans-serif'],
          'headline-md': ['Plus Jakarta Sans', 'sans-serif'],
          'headline-sm': ['Plus Jakarta Sans', 'sans-serif'],
          'label-sm': ['Plus Jakarta Sans', 'sans-serif'],
          'label-lg': ['Plus Jakarta Sans', 'sans-serif'],
          'headline-lg': ['Plus Jakarta Sans', 'sans-serif'],
          'label-md': ['Plus Jakarta Sans', 'sans-serif'],
          'body-sm': ['Inter', 'sans-serif'],
          'headline-xl-mobile': ['Plus Jakarta Sans', 'sans-serif'],
          'body-lg': ['Inter', 'sans-serif']
        },
        fontSize: {
          'headline-xl': ['36px', { lineHeight: '44px', fontWeight: '700' }],
          'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
          'headline-lg-mobile': ['22px', { lineHeight: '30px', fontWeight: '600' }],
          'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600' }],
          'headline-sm': ['16px', { lineHeight: '24px', fontWeight: '600' }],
          'label-sm': ['10px', { lineHeight: '12px', fontWeight: '700' }],
          'label-lg': ['14px', { lineHeight: '20px', fontWeight: '600' }],
          'headline-lg': ['28px', { lineHeight: '36px', fontWeight: '700' }],
          'label-md': ['12px', { lineHeight: '16px', fontWeight: '600' }],
          'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
          'headline-xl-mobile': ['28px', { lineHeight: '36px', fontWeight: '700' }],
          'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }]
        }
      }
    }
  };

  if (window.tailwind) {
    window.tailwind.config = TAILWIND_DESIGN_CONFIG;
  }

  const LouvorTheme = {
    getPreference() {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved && ['dark', 'light', 'system'].includes(saved)) return saved;
      try {
        const rawUser = sessionStorage.getItem(USER_CACHE_KEY) || localStorage.getItem(USER_CACHE_KEY);
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          if (parsed && ['dark', 'light', 'system'].includes(parsed.theme_preference)) {
            return parsed.theme_preference;
          }
        }
      } catch (e) {}
      return 'dark';
    },

    getEffectiveTheme(pref = null) {
      const p = pref || this.getPreference();
      if (p === 'light') return 'light';
      if (p === 'dark') return 'dark';
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
      return 'dark';
    },

    getThemeMeta(pref = null) {
      const p = pref || this.getPreference();
      const eff = this.getEffectiveTheme(p);
      if (p === 'light') {
        return { pref: 'light', effective: 'light', label: 'Claro', fullLabel: 'Tema Claro (Light Mode)', icon: 'light_mode' };
      }
      if (p === 'system') {
        return {
          pref: 'system',
          effective: eff,
          label: 'Sistema',
          fullLabel: `Automático (${eff === 'light' ? 'Claro' : 'Escuro'})`,
          icon: 'brightness_auto'
        };
      }
      return { pref: 'dark', effective: 'dark', label: 'Escuro', fullLabel: 'Tema Escuro (Dark Stage)', icon: 'dark_mode' };
    },

    applyTheme(pref = null) {
      const chosenPref = pref && ['dark', 'light', 'system'].includes(pref) ? pref : this.getPreference();
      localStorage.setItem(THEME_STORAGE_KEY, chosenPref);
      const effective = this.getEffectiveTheme(chosenPref);
      const root = document.documentElement;
      root.classList.remove('dark', 'light');
      root.classList.add(effective);
      root.setAttribute('data-theme-pref', chosenPref);
      root.setAttribute('data-theme-effective', effective);
      this.refreshThemeControlsUI(chosenPref);
    },

    refreshThemeControlsUI(pref = null) {
      const meta = this.getThemeMeta(pref);
      document.querySelectorAll('[data-theme-icon]').forEach((el) => {
        el.textContent = meta.icon;
      });
      document.querySelectorAll('[data-theme-label]').forEach((el) => {
        el.textContent = meta.label;
      });
      document.querySelectorAll('[data-theme-full-label]').forEach((el) => {
        el.textContent = meta.fullLabel;
      });
      document.querySelectorAll('[data-theme-option]').forEach((btn) => {
        const opt = btn.getAttribute('data-theme-option');
        if (opt === meta.pref) {
          btn.className =
            'flex-1 py-2 px-2.5 rounded-lg bg-primary-container text-on-primary-container font-label-sm font-bold flex items-center justify-center gap-1 shadow-sm transition-all';
        } else {
          btn.className =
            'flex-1 py-2 px-2.5 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-label-sm flex items-center justify-center gap-1 transition-all';
        }
      });
    },

    async setPreference(pref, { syncBackend = true, showNotification = true } = {}) {
      if (!['dark', 'light', 'system'].includes(pref)) return;
      this.applyTheme(pref);
      const meta = this.getThemeMeta(pref);
      if (showNotification && window.LouvorAPI) {
        window.LouvorAPI.showToast(`Aparência: ${meta.fullLabel}`);
      }
      if (syncBackend && window.LouvorAPI && window.LouvorAPI.getToken()) {
        try {
          const res = await window.LouvorAPI.request('/api/users/profile', {
            method: 'PUT',
            body: { theme_preference: pref },
            redirectOn401: false
          });
          if (res && res.user) {
            window.LouvorAPI.setSession(window.LouvorAPI.getToken(), res.user);
          }
        } catch (e) {}
      }
    },

    async cycleTheme() {
      const order = ['dark', 'light', 'system'];
      const current = this.getPreference();
      const next = order[(order.indexOf(current) + 1) % order.length];
      await this.setPreference(next, { syncBackend: true, showNotification: true });
    }
  };

  // Aplica imediatamente o tema antes da renderização do body (evita flash visual)
  LouvorTheme.applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => {
      if (LouvorTheme.getPreference() === 'system') {
        LouvorTheme.applyTheme('system');
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', listener);
  }

  const LouvorAPI = {
    getToken() {
      return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY) || '';
    },

    setSession(token, user) {
      if (token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      }
      if (user) {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        if (user.theme_preference && ['dark', 'light', 'system'].includes(user.theme_preference)) {
          LouvorTheme.applyTheme(user.theme_preference);
        }
      }
    },

    clearSession() {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(USER_CACHE_KEY);
    },

    getCachedUser() {
      try {
        const raw = sessionStorage.getItem(USER_CACHE_KEY) || localStorage.getItem(USER_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    async request(path, { method = 'GET', body = null, redirectOn401 = true } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const opts = {
        method,
        headers,
        credentials: 'same-origin'
      };
      if (body !== null && method !== 'GET') {
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(path, opts);
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = { ok: false, error: 'Erro de comunicação com o servidor.' };
      }

      if (res.status === 401 && redirectOn401) {
        this.clearSession();
        window.location.href = '/index.html';
        throw new Error(data.error || 'Sessão expirada.');
      }

      if (!res.ok || data.ok === false) {
        const err = new Error(data.error || `Erro HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      return data;
    },

    async requireUser({ adminOnly = false } = {}) {
      try {
        const res = await this.request('/api/auth/me');
        if (res.user) {
          this.setSession(this.getToken(), res.user);
          if (adminOnly && res.user.role !== 'ADMIN') {
            this.showToast('Acesso restrito a líderes e administradores (ADMIN).', 'error');
            setTimeout(() => {
              window.location.href = '/pages/calendario-escalas/index.html';
            }, 900);
            return null;
          }
          return res.user;
        }
      } catch (e) {
        window.location.href = '/index.html';
        return null;
      }
    },

    hasPermission(user, moduleName, action = 'view') {
      if (!user) return false;
      if (user.role === 'ADMIN') return true;
      const mod = user.permissions && user.permissions[moduleName];
      if (!mod) return false;
      return Boolean(mod[`can_${action}`]);
    },

    showToast(message, type = 'success') {
      let toast = document.getElementById('globalLouvorToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalLouvorToast';
        toast.className =
          'fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-surface-container-highest/95 backdrop-blur-md text-on-surface shadow-2xl border border-outline-variant/40 opacity-0 pointer-events-none transition-all duration-300 transform -translate-y-2 max-w-[92vw]';
        document.body.appendChild(toast);
      }

      const iconColor =
        type === 'error' ? 'text-error' : type === 'warning' ? 'text-tertiary' : 'text-secondary';
      const iconName =
        type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'check_circle';

      toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px] ${iconColor}">${iconName}</span>
        <span class="font-label-md text-label-md text-on-surface">${this.escapeHtml(message)}</span>
      `;
      toast.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
      toast.classList.add('opacity-100', 'translate-y-0');

      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
        toast.classList.remove('opacity-100', 'translate-y-0');
      }, 2800);
    },

    escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  window.LouvorTheme = LouvorTheme;
  window.LouvorAPI = LouvorAPI;
})(window);
