(function () {
  // Se já estiver autenticado, redireciona para o Calendário
  const existingToken = window.LouvorAPI.getToken();
  if (existingToken) {
    window.LouvorAPI.request('/api/auth/me', { redirectOn401: false })
      .then((res) => {
        if (res && res.user) {
          window.location.href = '/pages/calendario-escalas/index.html';
        }
      })
      .catch(() => {});
  }

  // Mostrar / ocultar senha
  const togglePassBtn = document.getElementById('togglePassBtn');
  const passInput = document.getElementById('loginPassword');
  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePassBtn.querySelector('span').textContent = isPass ? 'visibility_off' : 'visibility';
    });
  }

  // Submit Login (o backend verifica automaticamente se o e-mail pertence a ADMIN_EMAILS)
  const loginForm = document.getElementById('loginForm');
  const submitBtn = document.getElementById('loginSubmitBtn');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      const originalHtml = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="flex items-center gap-2">
          <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <span>Autenticando...</span>
        </span>
      `;

      try {
        const res = await window.LouvorAPI.request('/api/auth/login', {
          method: 'POST',
          body: { email, password },
          redirectOn401: false
        });
        window.LouvorAPI.setSession(res.token, res.user);
        window.LouvorAPI.showToast(`Bem-vindo(a), ${res.user.full_name}!`);
        setTimeout(() => {
          window.location.href = '/pages/calendario-escalas/index.html';
        }, 450);
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
  }

  // Recuperação de Senha Segura (sem vazar ou autopreencher código na tela)
  const resetModal = document.getElementById('resetPasswordModal');
  const forgotBtn = document.getElementById('forgotPassBtn');
  const closeResetBtn = document.getElementById('closeResetModalBtn');
  const stepReq = document.getElementById('stepRequestCode');
  const stepConfirm = document.getElementById('stepConfirmReset');

  if (forgotBtn && resetModal) {
    forgotBtn.onclick = () => {
      stepReq.classList.remove('hidden');
      stepConfirm.classList.add('hidden');
      document.getElementById('resetEmailInput').value = document.getElementById('loginEmail').value;
      document.getElementById('resetCodeInput').value = '';
      document.getElementById('resetNewPasswordInput').value = '';
      resetModal.classList.remove('hidden');
    };
  }
  if (closeResetBtn && resetModal) {
    closeResetBtn.onclick = () => resetModal.classList.add('hidden');
  }

  const sendCodeBtn = document.getElementById('sendResetCodeBtn');
  if (sendCodeBtn) {
    sendCodeBtn.onclick = async () => {
      const email = document.getElementById('resetEmailInput').value.trim();
      try {
        const res = await window.LouvorAPI.request('/api/auth/forgot-password', {
          method: 'POST',
          body: { email },
          redirectOn401: false
        });
        stepReq.classList.add('hidden');
        stepConfirm.classList.remove('hidden');
        document.getElementById('generatedCodeHint').textContent =
          res.message || 'Informe o código de 6 dígitos enviado para o seu e-mail.';
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
      }
    };
  }

  const confirmResetBtn = document.getElementById('confirmNewPasswordBtn');
  if (confirmResetBtn) {
    confirmResetBtn.onclick = async () => {
      const email = document.getElementById('resetEmailInput').value.trim();
      const code = document.getElementById('resetCodeInput').value.trim();
      const newPassword = document.getElementById('resetNewPasswordInput').value;
      try {
        const res = await window.LouvorAPI.request('/api/auth/reset-password', {
          method: 'POST',
          body: { email, code, newPassword },
          redirectOn401: false
        });
        window.LouvorAPI.showToast(res.message);
        resetModal.classList.add('hidden');
        document.getElementById('loginEmail').value = email;
        document.getElementById('loginPassword').value = '';
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
      }
    };
  }
})();
