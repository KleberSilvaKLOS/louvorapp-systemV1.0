function toggleRole(button) {
  const isSelected = button.getAttribute('aria-pressed') === 'true';
  const checkIcon = button.querySelector('.check-icon');

  if (isSelected) {
    button.setAttribute('aria-pressed', 'false');
    button.classList.remove('bg-primary-container', 'text-on-primary', 'shadow-sm');
    button.classList.add('bg-surface-container', 'text-on-surface-variant');
    if (checkIcon) checkIcon.classList.add('opacity-0');
  } else {
    button.setAttribute('aria-pressed', 'true');
    button.classList.remove('bg-surface-container', 'text-on-surface-variant');
    button.classList.add('bg-primary-container', 'text-on-primary', 'shadow-sm');
    if (checkIcon) checkIcon.classList.remove('opacity-0');
  }
  updateRoleCounter();
}

function updateRoleCounter() {
  const activeRoles = document.querySelectorAll('.role-pill[aria-pressed="true"]');
  const counter = document.getElementById('roleCounter');
  if (counter) {
    const count = activeRoles.length;
    counter.textContent = count === 1 ? '1 selecionado' : `${count} selecionados`;
  }
}

function toggleNotificationSwitch() {
  const toggle = document.getElementById('notifToggle');
  const handle = document.getElementById('notifHandle');
  const isChecked = toggle.getAttribute('aria-checked') === 'true';

  if (isChecked) {
    toggle.setAttribute('aria-checked', 'false');
    toggle.classList.remove('bg-secondary');
    toggle.classList.add('bg-surface-container-highest');
    handle.classList.remove('translate-x-5', 'bg-on-secondary');
    handle.classList.add('translate-x-0', 'bg-outline');
  } else {
    toggle.setAttribute('aria-checked', 'true');
    toggle.classList.remove('bg-surface-container-highest');
    toggle.classList.add('bg-secondary');
    handle.classList.remove('translate-x-0', 'bg-outline');
    handle.classList.add('translate-x-5', 'bg-on-secondary');
  }
}

(function () {
  // Carrega dados dinâmicos do banner de próximo ensaio e nome do ministério via /api/settings/public
  window.LouvorAPI.request('/api/settings/public', { redirectOn401: false })
    .then((res) => {
      if (res && res.next_rehearsal_banner) {
        const [timeText, infoText] = String(res.next_rehearsal_banner).split('|');
        const tEl = document.getElementById('onboardingBannerTime');
        const iEl = document.getElementById('onboardingBannerInfo');
        if (tEl && timeText) tEl.textContent = timeText.trim();
        if (iEl && infoText) iEl.textContent = infoText.trim();
      }
      if (res && res.ministry_name) {
        const mEl = document.getElementById('onboardingMinistryName');
        if (mEl) mEl.textContent = res.ministry_name;
      }
    })
    .catch(() => {});

  const form = document.getElementById('onboardingForm');
  const submitBtn = document.getElementById('submitBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value.trim();
      const email = document.getElementById('email').value.trim();
      const whatsapp = document.getElementById('whatsapp').value.trim();
      const password = document.getElementById('password').value;
      const notifEnabled = document.getElementById('notifToggle').getAttribute('aria-checked') === 'true';

      if (fullName.length < 3) {
        window.LouvorAPI.showToast('Informe seu nome completo (mínimo 3 letras).', 'warning');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        window.LouvorAPI.showToast('Informe um endereço de e-mail válido.', 'warning');
        return;
      }
      if (whatsapp.replace(/\D/g, '').length < 8) {
        window.LouvorAPI.showToast('Informe um telefone/WhatsApp válido.', 'warning');
        return;
      }

      const selectedRoleEls = document.querySelectorAll('.role-pill[aria-pressed="true"]');
      const roles = Array.from(selectedRoleEls).map((el) => el.getAttribute('data-role'));

      if (roles.length === 0) {
        window.LouvorAPI.showToast('Selecione pelo menos uma função ou instrumento.', 'warning');
        return;
      }

      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="flex items-center gap-2">
          <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <span>Cadastrando...</span>
        </span>
      `;

      try {
        const res = await window.LouvorAPI.request('/api/auth/register', {
          method: 'POST',
          body: { fullName, email, whatsapp, password, roles, notifEnabled },
          redirectOn401: false
        });

        window.LouvorAPI.setSession(res.token, res.user);
        submitBtn.classList.remove('from-primary-container', 'via-primary-container', 'to-secondary-container');
        submitBtn.classList.add('bg-secondary', 'text-on-secondary');
        submitBtn.innerHTML = `
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-headline-md">task_alt</span>
            <span>Pronto! Bem-vindo(a)</span>
          </span>
        `;

        window.LouvorAPI.showToast('Cadastro concluído com sucesso!');
        setTimeout(() => {
          window.location.href = '/pages/calendario-escalas/index.html';
        }, 700);
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  }
})();
