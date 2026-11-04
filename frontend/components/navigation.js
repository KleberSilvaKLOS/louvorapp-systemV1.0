/**
 * LOUVORAPP - COMPONENTE COMPARTILHADO DE NAVEGAÇÃO, HEADER, AVATARES E TUTORIAL DE PRIMEIRO ACESSO
 * - Exibe placeholder sem foto quando o usuário ainda não definiu foto de perfil.
 * - Exibe automaticamente o Guia Passo a Passo no primeiro acesso após o cadastro.
 * - Oculta tanto [data-notif-badge] quanto #notifCountPill ao marcar notificações como lidas.
 */
(function (window) {
  const NAV_ITEMS = [
    {
      id: 'calendario',
      label: 'Calendário',
      icon: 'calendar_month',
      href: '/pages/calendario-escalas/index.html',
      adminOnly: false
    },
    {
      id: 'enquetes',
      label: 'Enquetes',
      icon: 'how_to_vote',
      href: '/pages/enquetes-disponibilidade/index.html',
      adminOnly: false
    },
    {
      id: 'minhas-escalas',
      label: 'Minhas Escalas',
      icon: 'queue_music',
      href: '/pages/minhas-escalas-trocas/index.html',
      adminOnly: false
    },
    {
      id: 'aprovacao-trocas',
      label: 'Escalas/Trocas',
      icon: 'sync_alt',
      href: '/pages/aprovacao-trocas/index.html',
      adminOnly: false,
      requiresModule: 'swaps',
      requiresAction: 'approve'
    },
    {
      id: 'perfil-config',
      label: 'Perfil/Config',
      icon: 'manage_accounts',
      href: '/pages/perfil-configuracoes/index.html',
      adminOnly: false
    }
  ];

  const ADMIN_EXTRA_LINKS = [
    {
      id: 'usuarios',
      label: 'Gestão de Usuários',
      icon: 'group',
      href: '/pages/usuarios/index.html'
    },
    {
      id: 'configuracoes',
      label: 'Permissões & Sistema',
      icon: 'admin_panel_settings',
      href: '/pages/configuracoes/index.html'
    }
  ];

  function canAccessItem(user, item) {
    if (!user) return false;
    if (item.adminOnly && user.role !== 'ADMIN') return false;
    if (item.requiresModule) {
      return window.LouvorAPI.hasPermission(user, item.requiresModule, item.requiresAction || 'view');
    }
    return true;
  }

  function buildAvatarMarkup(avatarUrl, fullName, sizeClass = 'w-9 h-9', roundedClass = 'rounded-full') {
    if (avatarUrl && String(avatarUrl).trim() !== '') {
      return `<img src="${window.LouvorAPI.escapeHtml(avatarUrl)}" alt="${window.LouvorAPI.escapeHtml(fullName || 'Perfil')}" class="${sizeClass} ${roundedClass} object-cover ring-1 ring-surface-variant" />`;
    }
    return `
      <div class="${sizeClass} ${roundedClass} bg-surface-container-highest text-on-surface-variant flex items-center justify-center ring-1 ring-surface-variant shrink-0" title="Sem foto de perfil">
        <span class="material-symbols-outlined text-[20px]">person</span>
      </div>
    `;
  }

  function renderDesktopSidebar(user, activeId) {
    const existing = document.getElementById('louvorDesktopSidebar');
    if (existing) existing.remove();
    document.body.classList.add('has-desktop-sidebar');

    const sidebar = document.createElement('aside');
    sidebar.id = 'louvorDesktopSidebar';
    sidebar.className = 'desktop-sidebar justify-between';

    const visibleItems = NAV_ITEMS.filter((it) => canAccessItem(user, it));
    const isAdmin = user && user.role === 'ADMIN';

    sidebar.innerHTML = `
      <div class="flex flex-col gap-6">
        <a href="/pages/calendario-escalas/index.html" class="flex items-center gap-3 px-2 pt-1">
          <img src="/assets/images/logo-louvorapp.svg" alt="LouvorApp" class="w-9 h-9 rounded-xl object-contain shadow-sm" />
          <div class="flex flex-col">
            <span class="font-headline-sm text-headline-sm font-bold text-on-surface leading-none">LouvorApp</span>
            <span class="font-label-sm text-label-sm text-primary uppercase tracking-wider mt-1">Ministério de Louvor</span>
          </div>
        </a>

        <div class="flex flex-col gap-1">
          <span class="px-3 pb-1 font-label-sm text-label-sm text-outline uppercase tracking-wider">Navegação Principal</span>
          ${visibleItems
            .map((item) => {
              const active = item.id === activeId;
              return `
                <a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl font-label-lg text-label-lg transition-all ${
                active
                  ? 'bg-primary-container text-on-primary-container font-bold shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }">
                  <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
                  <span>${item.label}</span>
                </a>
              `;
            })
            .join('')}
        </div>

        ${
          isAdmin
            ? `
          <div class="flex flex-col gap-1 pt-2 border-t border-outline-variant/30">
            <span class="px-3 pb-1 font-label-sm text-label-sm text-secondary uppercase tracking-wider">Painel Líder / Admin</span>
            ${ADMIN_EXTRA_LINKS.map((item) => {
              const active = item.id === activeId;
              return `
                <a href="${item.href}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl font-label-lg text-label-lg transition-all ${
                active
                  ? 'bg-secondary-container text-on-secondary-container font-bold shadow-md'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              }">
                  <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
                  <span>${item.label}</span>
                </a>
              `;
            }).join('')}
          </div>
        `
            : ''
        }

        <div class="pt-2 border-t border-outline-variant/30">
          <button type="button" onclick="window.LouvorNav.openFirstAccessGuide()" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-primary font-label-md transition-colors">
            <span class="material-symbols-outlined text-[18px]">help</span>
            <span>Como Usar o App</span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2 pt-3 border-t border-outline-variant/30">
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low">
          <div class="flex items-center gap-2.5 min-w-0">
            ${buildAvatarMarkup(user?.avatar_url, user?.full_name, 'w-9 h-9', 'rounded-full')}
            <div class="flex flex-col min-w-0">
              <span class="font-label-md text-label-md text-on-surface truncate">${window.LouvorAPI.escapeHtml(user?.full_name || 'Membro')}</span>
              <span class="font-label-sm text-[10px] ${
                user?.role === 'ADMIN' ? 'text-secondary' : 'text-primary'
              } uppercase font-bold">${user?.role || 'USER'}</span>
            </div>
          </div>
          <button onclick="window.LouvorNav.logout()" title="Sair da Conta" class="w-8 h-8 rounded-lg bg-error-container/30 text-error hover:bg-error-container/50 flex items-center justify-center">
            <span class="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);
  }

  function wireBottomNav(user, activeId) {
    const navEl = document.querySelector('nav.fixed.bottom-0');
    if (!navEl) return;
    navEl.classList.add('bottom-mobile-nav');
    const visibleItems = NAV_ITEMS.filter((it) => canAccessItem(user, it));

    navEl.innerHTML = `
      <div class="flex items-center justify-around h-16 max-w-md mx-auto px-space-xs">
        ${visibleItems
          .map((item) => {
            const active = item.id === activeId;
            return `
              <a href="${item.href}" data-path="${item.id}" class="flex flex-col items-center justify-center min-w-[60px] min-h-[48px] py-1 transition-all active:scale-95 ${
              active ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }">
                <span class="material-symbols-outlined text-[22px]">${item.icon}</span>
                <span class="font-label-sm text-label-sm mt-0.5">${item.label}</span>
              </a>
            `;
          })
          .join('')}
      </div>
    `;
  }

  function updateHeaderIdentity(user) {
    if (!user) return;
    document.querySelectorAll('[data-user-role-badge]').forEach((el) => {
      el.textContent = user.role === 'ADMIN' ? 'Admin' : 'Membro';
      if (user.role === 'ADMIN') {
        el.classList.remove('bg-primary', 'text-on-primary');
        el.classList.add('bg-secondary', 'text-on-secondary');
      } else {
        el.classList.remove('bg-secondary', 'text-on-secondary');
        el.classList.add('bg-primary', 'text-on-primary');
      }
    });

    const hasAvatar = Boolean(user.avatar_url && String(user.avatar_url).trim() !== '');
    document.querySelectorAll('[data-user-avatar]').forEach((img) => {
      if (hasAvatar) {
        img.src = user.avatar_url;
        img.classList.remove('hidden');
        const placeholder = img.parentElement.querySelector('.avatar-empty-placeholder');
        if (placeholder) placeholder.remove();
      } else {
        img.classList.add('hidden');
        if (!img.parentElement.querySelector('.avatar-empty-placeholder')) {
          const ph = document.createElement('div');
          ph.className =
            'avatar-empty-placeholder w-8 h-8 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center ring-2 ring-surface-variant';
          ph.innerHTML = '<span class="material-symbols-outlined text-[18px]">person</span>';
          img.parentElement.insertBefore(ph, img);
        }
      }
    });

    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      if (user.role !== 'ADMIN') {
        el.classList.add('hidden');
      } else {
        el.classList.remove('hidden');
      }
    });
  }

  function openFirstAccessGuide(customUser = null) {
    const user = customUser || window.LouvorAPI.getCachedUser() || {};
    const existing = document.getElementById('louvorFirstAccessModal');
    if (existing) existing.remove();

    const isAdmin = user.role === 'ADMIN';
    const steps = [
      {
        icon: 'waving_hand',
        color: 'text-secondary',
        badge: 'Passo 1 de 4 • Bem-vindo(a)',
        title: `Olá, ${user.full_name || 'Membro'}!`,
        description:
          'Seu perfil foi criado com sucesso e está 100% zerado, pronto para uso. Veja este guia rápido de 1 minuto para conhecer cada área do LouvorApp.',
        bullets: [
          'Navegue pelas abas usando o menu inferior (no celular) ou a barra lateral (no computador).',
          'Todas as suas confirmações, votos e preferências ficam salvos na nuvem em tempo real.'
        ]
      },
      {
        icon: 'calendar_month',
        color: 'text-primary',
        badge: 'Passo 2 de 4 • Calendário & Enquetes',
        title: 'Consulte o Calendário e Vote nas Enquetes',
        description:
          'O Calendário abre automaticamente no mês atual da sua máquina e mostra todos os cultos confirmados e ensaios agendados.',
        bullets: [
          'Na aba "Enquetes", informe se você está Disponível ou Indisponível para as próximas datas.',
          'Ao tocar em um dia do Calendário, você visualiza a equipe escalada, horários de passagem de som e o Repertório com cifras e tons.'
        ]
      },
      {
        icon: 'swap_horiz',
        color: 'text-tertiary',
        badge: 'Passo 3 de 4 • Minhas Escalas & Trocas',
        title: 'Confirme Presença ou Solicite Trocas',
        description:
          'Na aba "Minhas Escalas", você acompanha seus próximos cultos, trocas pendentes e histórico.',
        bullets: [
          'Confirme sua presença com 1 toque para avisar a liderança.',
          'Caso surja um imprevisto, clique em "Pedir Troca", informe o motivo e indique um substituto disponível.'
        ]
      },
      {
        icon: 'account_circle',
        color: 'text-secondary',
        badge: 'Passo 4 de 4 • Foto de Perfil & Habilidades',
        title: isAdmin
          ? 'Configure sua Foto, Habilidades e Painel Líder'
          : 'Adicione sua Foto de Perfil e Habilidades',
        description:
          'Seu cadastro começa sem foto de perfil para você personalizar como preferir.',
        bullets: [
          'Acesse a aba "Perfil/Config" e toque no ícone da câmera sobre o avatar para enviar sua foto de perfil.',
          'Cadastre ou edite seus instrumentos, preferências de horário, senha e alertas.',
          ...(isAdmin
            ? ['Como seu e-mail está autorizado como ADMIN, você também pode criar escalas, abrir enquetes, aprovar trocas e gerenciar usuários!']
            : [])
        ]
      }
    ];

    let currentStep = 0;
    const modal = document.createElement('div');
    modal.id = 'louvorFirstAccessModal';
    modal.className = 'louvor-modal-backdrop';

    function renderStep() {
      const s = steps[currentStep];
      const isLast = currentStep === steps.length - 1;
      modal.innerHTML = `
        <div class="louvor-modal-card flex flex-col gap-4 relative">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 rounded-full bg-surface-container-high text-primary font-label-sm uppercase tracking-wider">${s.badge}</span>
            <button type="button" id="skipGuideBtn" class="font-label-sm text-outline hover:text-on-surface">Pular tutorial</button>
          </div>

          <div class="flex flex-col items-center text-center py-2 gap-2">
            <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center ${s.color} shadow-md">
              <span class="material-symbols-outlined text-[34px]">${s.icon}</span>
            </div>
            <h3 class="font-headline-md text-headline-md text-on-surface mt-1">${window.LouvorAPI.escapeHtml(s.title)}</h3>
            <p class="font-body-md text-body-md text-on-surface-variant">${window.LouvorAPI.escapeHtml(s.description)}</p>
          </div>

          <div class="p-3.5 rounded-xl bg-surface-container-low flex flex-col gap-2">
            ${s.bullets
              .map(
                (b) => `
              <div class="flex items-start gap-2 text-body-sm text-on-surface">
                <span class="material-symbols-outlined text-secondary text-[16px] mt-0.5 shrink-0">check_circle</span>
                <span>${window.LouvorAPI.escapeHtml(b)}</span>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="flex items-center justify-center gap-1.5 py-1">
            ${steps
              .map(
                (_, idx) => `
              <span class="h-1.5 rounded-full transition-all ${
                idx === currentStep ? 'w-6 bg-primary' : 'w-2 bg-surface-container-highest'
              }"></span>
            `
              )
              .join('')}
          </div>

          <div class="flex items-center gap-2 pt-1">
            ${
              currentStep > 0
                ? `<button type="button" id="prevGuideStepBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Anterior</button>`
                : ''
            }
            <button type="button" id="nextGuideStepBtn" class="flex-1 h-11 rounded-xl ${
              isLast ? 'bg-secondary text-on-secondary' : 'bg-primary-container text-on-primary-container'
            } font-label-md font-bold flex items-center justify-center gap-1.5">
              <span>${isLast ? 'Começar a Usar o App' : 'Próximo Passo'}</span>
              <span class="material-symbols-outlined text-[18px]">${isLast ? 'task_alt' : 'arrow_forward'}</span>
            </button>
          </div>
        </div>
      `;

      const finishTutorial = async () => {
        modal.remove();
        try {
          const res = await window.LouvorAPI.request('/api/users/profile', {
            method: 'PUT',
            body: { first_access_completed: 1 }
          });
          if (res && res.user) {
            window.LouvorAPI.setSession(window.LouvorAPI.getToken(), res.user);
          }
        } catch (e) {}
      };

      modal.querySelector('#skipGuideBtn').onclick = finishTutorial;
      const prevBtn = modal.querySelector('#prevGuideStepBtn');
      if (prevBtn) {
        prevBtn.onclick = () => {
          currentStep--;
          renderStep();
        };
      }
      modal.querySelector('#nextGuideStepBtn').onclick = () => {
        if (!isLast) {
          currentStep++;
          renderStep();
        } else {
          finishTutorial();
        }
      };
    }

    document.body.appendChild(modal);
    renderStep();
  }

  async function openNotificationsModal() {
    let modal = document.getElementById('louvorNotificationsModal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'louvorNotificationsModal';
    modal.className = 'louvor-modal-backdrop';
    modal.innerHTML = `
      <div class="louvor-modal-card flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary">notifications_active</span>
            <h3 class="font-headline-sm text-headline-sm text-on-surface">Central de Notificações</h3>
          </div>
          <button id="closeNotifModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div id="notifModalList" class="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
          <div class="text-center py-6 text-on-surface-variant font-body-sm">Carregando alertas...</div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-outline-variant/30">
          <button id="markAllReadBtn" class="px-3 py-2 rounded-lg bg-surface-container-high text-primary font-label-md text-label-md hover:bg-surface-bright">
            Marcar todas como lidas
          </button>
          <button id="okNotifModalBtn" class="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-label-md text-label-md font-bold">
            Fechar
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closeNotifModalBtn').onclick = close;
    modal.querySelector('#okNotifModalBtn').onclick = close;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    try {
      const data = await window.LouvorAPI.request('/api/users/notifications');
      const listEl = modal.querySelector('#notifModalList');
      const items = data.notifications || [];
      if (items.length === 0) {
        listEl.innerHTML = '<div class="text-center py-6 text-on-surface-variant">Nenhuma notificação no momento.</div>';
      } else {
        listEl.innerHTML = items
          .map(
            (n) => `
            <div class="p-3 rounded-xl ${
              n.is_read ? 'bg-surface-container-low opacity-75' : 'bg-surface-container-high border border-secondary/30'
            } flex items-start gap-3">
              <span class="material-symbols-outlined text-[20px] ${
                n.is_read ? 'text-outline' : 'text-secondary'
              } mt-0.5">${n.type === 'swap' ? 'swap_horiz' : n.type === 'poll' ? 'how_to_vote' : 'event_available'}</span>
              <div class="flex flex-col flex-1 min-w-0">
                <span class="font-label-md text-label-md text-on-surface">${window.LouvorAPI.escapeHtml(n.title)}</span>
                <span class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${window.LouvorAPI.escapeHtml(n.message)}</span>
              </div>
            </div>
          `
          )
          .join('');
      }

      modal.querySelector('#markAllReadBtn').onclick = async () => {
        await window.LouvorAPI.request('/api/users/notifications/read', { method: 'POST' });
        window.LouvorAPI.showToast('Notificações marcadas como lidas!');
        document.querySelectorAll('[data-notif-badge]').forEach((b) => b.classList.add('hidden'));
        const countPill = document.getElementById('notifCountPill');
        if (countPill) {
          countPill.textContent = '0';
          countPill.classList.add('hidden');
        }
        close();
      };
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  }

  async function initPage({ activeTab = 'calendario', adminOnly = false } = {}) {
    const user = await window.LouvorAPI.requireUser({ adminOnly });
    if (!user) return null;

    renderDesktopSidebar(user, activeTab);
    wireBottomNav(user, activeTab);
    updateHeaderIdentity(user);

    document.querySelectorAll('[aria-label^="Notifica"]').forEach((btn) => {
      btn.onclick = () => openNotificationsModal();
    });

    try {
      const nRes = await window.LouvorAPI.request('/api/users/notifications');
      const unread = (nRes.notifications || []).filter((n) => !n.is_read).length;
      document.querySelectorAll('[data-notif-badge]').forEach((el) => {
        if (unread > 0) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });
      const countPill = document.getElementById('notifCountPill');
      if (countPill) {
        countPill.textContent = String(unread);
        if (unread === 0) countPill.classList.add('hidden');
        else countPill.classList.remove('hidden');
      }
    } catch (e) {}

    if (!user.first_access_completed) {
      openFirstAccessGuide(user);
    }

    return user;
  }

  async function logout() {
    try {
      await window.LouvorAPI.request('/api/auth/logout', { method: 'POST', redirectOn401: false });
    } catch (e) {}
    window.LouvorAPI.clearSession();
    window.location.href = '/index.html';
  }

  window.LouvorNav = {
    initPage,
    openNotificationsModal,
    openFirstAccessGuide,
    updateHeaderIdentity,
    renderDesktopSidebar,
    logout
  };
})(window);
