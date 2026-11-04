/**
 * LOUVORAPP - CLIENTE DE API E UTILITÁRIOS COMPARTILHADOS
 * Gerencia comunicação com o backend, autenticação de sessão, toasts e modais globais.
 */
(function (window) {
  const TOKEN_STORAGE_KEY = 'louvorapp_session_token';
  const USER_CACHE_KEY = 'louvorapp_cached_user';

  const TAILWIND_DESIGN_CONFIG = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          'background': '#0f131c',
          'on-background': '#dfe2ee',
          'on-tertiary-fixed': '#2a1700',
          'primary': '#adc6ff',
          'primary-container': '#4d8eff',
          'secondary-container': '#00a572',
          'tertiary-fixed': '#ffddb8',
          'surface-variant': '#31353e',
          'tertiary-fixed-dim': '#ffb95f',
          'on-primary-fixed': '#001a42',
          'inverse-on-surface': '#2c3039',
          'on-secondary-fixed': '#002113',
          'on-secondary': '#003824',
          'primary-fixed': '#d8e2ff',
          'surface-tint': '#adc6ff',
          'on-tertiary-container': '#3e2400',
          'outline-variant': '#424754',
          'surface': '#0f131c',
          'on-secondary-container': '#00311f',
          'on-surface': '#dfe2ee',
          'surface-container-low': '#181c24',
          'on-surface-variant': '#c2c6d6',
          'secondary-fixed': '#6ffbbe',
          'on-tertiary-fixed-variant': '#653e00',
          'on-primary': '#002e6a',
          'primary-fixed-dim': '#adc6ff',
          'on-error-container': '#ffdad6',
          'error-container': '#93000a',
          'outline': '#8c909f',
          'tertiary': '#ffb95f',
          'surface-container': '#1c2028',
          'surface-dim': '#0f131c',
          'on-tertiary': '#472a00',
          'error': '#ffb4ab',
          'secondary': '#4edea3',
          'surface-container-lowest': '#0a0e16',
          'inverse-primary': '#005ac2',
          'surface-container-high': '#262a33',
          'surface-bright': '#353942',
          'on-primary-fixed-variant': '#004395',
          'tertiary-container': '#ca8100',
          'on-secondary-fixed-variant': '#005236',
          'surface-container-highest': '#31353e',
          'on-primary-container': '#00285d',
          'inverse-surface': '#dfe2ee',
          'on-error': '#690005',
          'secondary-fixed-dim': '#4edea3'
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

  window.LouvorAPI = LouvorAPI;
})(window);
