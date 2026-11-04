let profileUser = null;
const CAMPUSES = ['Campus Central', 'Campus Zona Sul', 'Campus Norte', 'Auditório 2 (Jovens)'];

function showLocalToast(message) {
  const toast = document.getElementById('toastNotification');
  const toastMsg = document.getElementById('toastMessage');
  if (!toast || !toastMsg) {
    window.LouvorAPI.showToast(message);
    return;
  }
  toastMsg.textContent = message;
  toast.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(window._localProfileToastTimer);
  window._localProfileToastTimer = setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 2400);
}

function setSwitchVisual(toggleBtn, isChecked) {
  const knob = toggleBtn.querySelector('.toggle-knob');
  const isSync = toggleBtn.getAttribute('data-toggle') === 'sync';
  toggleBtn.setAttribute('aria-checked', isChecked ? 'true' : 'false');

  if (isChecked) {
    toggleBtn.classList.remove('bg-surface-variant');
    toggleBtn.classList.add(isSync ? 'bg-secondary' : 'bg-primary-container');
    if (knob) {
      knob.classList.remove('translate-x-1', 'bg-outline');
      knob.classList.add('translate-x-6', isSync ? 'bg-on-secondary' : 'bg-on-primary-container');
    }
  } else {
    toggleBtn.classList.remove(isSync ? 'bg-secondary' : 'bg-primary-container');
    toggleBtn.classList.add('bg-surface-variant');
    if (knob) {
      knob.classList.remove('translate-x-6', 'bg-on-primary-container', 'bg-on-secondary');
      knob.classList.add('translate-x-1', 'bg-outline');
    }
  }
}

function renderHeroAvatar(avatarUrl) {
  const emptyEl = document.getElementById('profileHeroEmptyAvatar');
  const imgEl = document.getElementById('profileHeroAvatar');
  if (avatarUrl && String(avatarUrl).trim() !== '') {
    imgEl.src = avatarUrl;
    imgEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }
}

function formatDateBr(isoDate) {
  if (!isoDate) return '';
  return String(isoDate).split('-').reverse().join('/');
}

function renderUnavailabilitiesList(unavailabilities = []) {
  const container = document.getElementById('unavailabilitiesListContainer');
  if (!container) return;

  if (!unavailabilities || unavailabilities.length === 0) {
    container.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low text-center font-body-sm text-on-surface-variant">
        Nenhum período de indisponibilidade cadastrado. Clique em "Informar Data / Período" caso vá viajar ou tenha algum compromisso.
      </div>
    `;
    return;
  }

  container.innerHTML = unavailabilities
    .map((u) => {
      const sameDay = u.start_date === u.end_date;
      const periodLabel = sameDay
        ? `Dia ${formatDateBr(u.start_date)}`
        : `De ${formatDateBr(u.start_date)} até ${formatDateBr(u.end_date)}`;

      return `
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low border border-tertiary/25 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-lg bg-tertiary-container/20 text-tertiary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">event_busy</span>
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-headline-sm text-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(periodLabel)}</span>
                <span class="px-2 py-0.5 rounded-full bg-tertiary-container/25 text-tertiary font-label-sm text-[10px]">Bloqueio Automático</span>
              </div>
              <span class="font-body-sm text-body-sm text-on-surface-variant truncate">${window.LouvorAPI.escapeHtml(u.reason)}</span>
            </div>
          </div>
          <button type="button" onclick="removeUnavailabilityItem(${u.id})" class="text-outline hover:text-error p-1.5 shrink-0" title="Remover indisponibilidade">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      `;
    })
    .join('');
}

function openAddUnavailabilityModal() {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <h3 class="font-headline-sm text-on-surface">Informar Período de Indisponibilidade</h3>
          <span class="font-body-sm text-on-surface-variant">Informe um dia específico ou período de ausência</span>
        </div>
        <button type="button" id="closeUnavailModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <div class="flex flex-col gap-1">
          <label class="font-label-sm text-on-surface-variant uppercase">Data Inicial</label>
          <input id="inputUnavailStart" type="date" value="${todayIso}" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-label-sm text-on-surface-variant uppercase">Data Final</label>
          <input id="inputUnavailEnd" type="date" value="${todayIso}" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label class="font-label-sm text-on-surface-variant uppercase">Motivo / Observação</label>
        <input id="inputUnavailReason" placeholder="Ex: Viagem em família / Compromisso profissional" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      </div>

      <div class="p-2.5 rounded-xl bg-surface-container-low text-body-sm text-on-surface-variant flex items-center gap-2">
        <span class="material-symbols-outlined text-secondary text-[18px] shrink-0">verified_user</span>
        <span>Para informar apenas um único dia, mantenha a Data Inicial e a Data Final iguais.</span>
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="cancelUnavailModalBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveUnavailModalBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar Período</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeUnavailModalBtn').onclick = close;
  modal.querySelector('#cancelUnavailModalBtn').onclick = close;

  const startEl = modal.querySelector('#inputUnavailStart');
  const endEl = modal.querySelector('#inputUnavailEnd');
  startEl.onchange = () => {
    if (endEl.value < startEl.value) endEl.value = startEl.value;
  };

  modal.querySelector('#saveUnavailModalBtn').onclick = async () => {
    const start_date = startEl.value;
    const end_date = endEl.value || start_date;
    const reason = modal.querySelector('#inputUnavailReason').value.trim() || 'Compromisso pessoal / Viagem';
    try {
      const res = await window.LouvorAPI.request('/api/users/unavailabilities', {
        method: 'POST',
        body: { start_date, end_date, reason }
      });
      profileUser.unavailabilities = res.unavailabilities || [];
      renderUnavailabilitiesList(profileUser.unavailabilities);
      showLocalToast(res.message);
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

async function removeUnavailabilityItem(unavailabilityId) {
  if (!confirm('Deseja remover este período de indisponibilidade?')) return;
  try {
    const res = await window.LouvorAPI.request(`/api/users/unavailabilities/${unavailabilityId}`, {
      method: 'DELETE'
    });
    profileUser.unavailabilities = res.unavailabilities || [];
    renderUnavailabilitiesList(profileUser.unavailabilities);
    showLocalToast(res.message);
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function renderProfileData(user) {
  profileUser = user;
  window.LouvorAPI.setSession(window.LouvorAPI.getToken(), user);
  window.LouvorNav.updateHeaderIdentity(user);
  window.LouvorNav.renderDesktopSidebar(user, 'perfil-config');
  if (window.LouvorTheme) {
    window.LouvorTheme.refreshThemeControlsUI(user.theme_preference);
  }

  document.getElementById('ministryStatsYearTitle').textContent = `Estatísticas do Ministério (${new Date().getFullYear()})`;
  document.getElementById('profileFullName').textContent = user.full_name;
  document.getElementById('profileContactLine').textContent = `${user.email} • ${user.whatsapp}`;
  document.getElementById('profileTeamBadge').textContent = user.team_badge || 'Novo Membro';
  document.getElementById('profileScheduleBadge').textContent = user.schedule_badge || 'Sem escala';
  document.getElementById('currentCampusLabel').textContent = user.campus || 'Campus Central';

  const adminSec = document.getElementById('adminQuickSection');
  if (adminSec) {
    if (user.role === 'ADMIN') {
      adminSec.classList.remove('hidden');
      adminSec.classList.add('flex');
    } else {
      adminSec.classList.add('hidden');
    }
  }

  renderHeroAvatar(user.avatar_url);

  document.getElementById('prefFavoriteServices').textContent = user.favorite_services || 'Não definido';
  document.getElementById('prefFrequencyBadge').textContent = user.favorite_frequency_badge || '-';
  document.getElementById('prefDesiredFrequency').textContent = user.desired_frequency || 'Não definida';
  document.getElementById('prefRecurringRestriction').textContent =
    user.recurring_restriction || 'Nenhuma restrição cadastrada';

  document.getElementById('statCompletedSchedules').textContent = String(user.completed_schedules_count || 0);
  document.getElementById('statAttendanceRate').textContent = `${user.attendance_rate || 0}%`;
  const statSwapsEl = document.getElementById('statSwapsRequested');
  if (statSwapsEl) {
    statSwapsEl.textContent = String(user.swaps_requested_count || 0);
  }

  // Role Pill Strip
  const pillStrip = document.getElementById('profileRolePillStrip');
  const skills = user.skills || [];
  if (pillStrip) {
    if (skills.length === 0) {
      pillStrip.innerHTML = `<span class="font-body-sm text-on-surface-variant">Nenhuma função cadastrada ainda.</span>`;
    } else {
      pillStrip.innerHTML = skills
        .map(
          (s) => `
          <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface shrink-0">
            <span class="material-symbols-outlined text-[16px] text-primary">${window.LouvorAPI.escapeHtml(s.icon || 'music_note')}</span>
            <span class="font-label-md text-label-md">${window.LouvorAPI.escapeHtml(s.skill_name)}</span>
          </div>
        `
        )
        .join('');
    }
  }

  document.querySelectorAll('.toggle-switch').forEach((btn) => {
    const field = btn.getAttribute('data-field');
    if (field && user[field] !== undefined) {
      setSwitchVisual(btn, Boolean(user[field]));
    }
  });

  renderSkillsList(skills);
  renderUnavailabilitiesList(user.unavailabilities || []);
}

function renderSkillsList(skills) {
  const container = document.getElementById('skillsListContainer');
  if (!container) return;

  if (skills.length === 0) {
    container.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low text-center font-body-sm text-on-surface-variant">
        Clique em "+ Adicionar" acima para cadastrar seus instrumentos ou categoria vocal (Soprano, Contralto, Tenor).
      </div>
    `;
    return;
  }

  const colorMap = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    tertiary: 'text-tertiary'
  };

  container.innerHTML = skills
    .map((s) => {
      const iconColor = colorMap[s.color_variant] || 'text-primary';
      const isAtivo = s.status === 'Ativo';
      const levelStyle =
        s.level_badge === 'Principal'
          ? 'bg-primary/15 text-primary'
          : 'bg-surface-container-highest text-on-surface-variant';

      return `
        <div class="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container transition-all">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center ${iconColor} shrink-0">
              <span class="material-symbols-outlined text-[22px]">${window.LouvorAPI.escapeHtml(s.icon || 'piano')}</span>
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-headline-sm text-headline-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(s.skill_name)}</span>
                <span class="px-2 py-0.5 rounded-full ${levelStyle} font-label-sm text-label-sm">${window.LouvorAPI.escapeHtml(s.level_badge)}</span>
              </div>
              <span class="font-body-sm text-body-sm text-on-surface-variant truncate">${window.LouvorAPI.escapeHtml(s.equipment_notes || '')}</span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="toggleSkillStatus(${s.id}, '${s.status}')" class="px-2.5 py-1 rounded-full ${
        isAtivo
          ? 'bg-secondary-container/20 text-secondary'
          : 'bg-surface-container-highest text-on-surface-variant'
      } font-label-sm text-label-sm font-semibold flex items-center gap-1">
              ${isAtivo ? '<span class="w-1.5 h-1.5 rounded-full bg-secondary"></span>' : ''}
              <span>${window.LouvorAPI.escapeHtml(s.status)}</span>
            </button>
            <button type="button" onclick="removeSkillItem(${s.id})" class="text-outline hover:text-error p-1" title="Remover habilidade">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

// Processa e redimensiona a imagem escolhida pelo usuário para Data URL leve e salva no SQLite
function handleImageFileSelected(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    window.LouvorAPI.showToast('Selecione um arquivo de imagem válido (JPG, PNG, WebP).', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const maxDim = 240;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      try {
        const res = await window.LouvorAPI.request('/api/users/profile', {
          method: 'PUT',
          body: { avatar_url: dataUrl }
        });
        renderProfileData(res.user);
        showLocalToast('Foto de perfil atualizada com sucesso!');
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function toggleSkillStatus(skillId, currentStatus) {
  const nextStatus = currentStatus === 'Ativo' ? 'Standby' : 'Ativo';
  try {
    const res = await window.LouvorAPI.request(`/api/users/skills/${skillId}`, {
      method: 'PUT',
      body: { status: nextStatus }
    });
    renderSkillsList(res.skills || []);
    showLocalToast(`Status alterado para ${nextStatus}!`);
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function removeSkillItem(skillId) {
  if (!confirm('Deseja remover esta habilidade do seu perfil?')) return;
  try {
    const res = await window.LouvorAPI.request(`/api/users/skills/${skillId}`, {
      method: 'DELETE'
    });
    renderSkillsList(res.skills || []);
    showLocalToast('Habilidade removida!');
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openEditProfileModal() {
  const hasPhoto = Boolean(profileUser.avatar_url && String(profileUser.avatar_url).trim() !== '');
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Editar Perfil &amp; Foto</h3>
        <button type="button" id="closeProfEditBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <!-- Controle de Foto de Perfil -->
      <div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <span class="material-symbols-outlined text-primary">photo_camera</span>
          <span class="font-label-md text-on-surface">Foto de Perfil</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="modalChoosePhotoBtn" class="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary-container font-label-sm font-bold">
            Escolher Foto
          </button>
          ${
            hasPhoto
              ? `<button type="button" id="modalRemovePhotoBtn" class="px-2.5 py-1.5 rounded-lg bg-error-container/30 text-error font-label-sm">Remover</button>`
              : ''
          }
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="font-label-sm text-on-surface-variant uppercase">Nome Completo</label>
        <input id="editProfName" value="${window.LouvorAPI.escapeHtml(profileUser.full_name)}" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Telefone / WhatsApp</label>
        <input id="editProfPhone" value="${window.LouvorAPI.escapeHtml(profileUser.whatsapp)}" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Função / Título no Ministério</label>
        <input id="editProfTitle" value="${window.LouvorAPI.escapeHtml(profileUser.title || '')}" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelProfEditBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveProfEditBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar Dados</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeProfEditBtn').onclick = close;
  modal.querySelector('#cancelProfEditBtn').onclick = close;

  modal.querySelector('#modalChoosePhotoBtn').onclick = () => {
    close();
    document.getElementById('avatarFileInput').click();
  };

  const remBtn = modal.querySelector('#modalRemovePhotoBtn');
  if (remBtn) {
    remBtn.onclick = async () => {
      try {
        const res = await window.LouvorAPI.request('/api/users/profile', {
          method: 'PUT',
          body: { avatar_url: '' }
        });
        renderProfileData(res.user);
        showLocalToast('Foto de perfil removida.');
        close();
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
      }
    };
  }

  modal.querySelector('#saveProfEditBtn').onclick = async () => {
    const full_name = modal.querySelector('#editProfName').value.trim();
    const whatsapp = modal.querySelector('#editProfPhone').value.trim();
    const title = modal.querySelector('#editProfTitle').value.trim();
    try {
      const res = await window.LouvorAPI.request('/api/users/profile', {
        method: 'PUT',
        body: { full_name, whatsapp, title }
      });
      renderProfileData(res.user);
      showLocalToast('Perfil atualizado com sucesso!');
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function openChangePasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Alterar Minha Senha</h3>
        <button type="button" id="closePwdModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-sm text-on-surface-variant uppercase">Senha Atual</label>
        <input id="inputCurrentPassword" type="password" placeholder="Digite sua senha atual" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Nova Senha (mín. 6 caracteres)</label>
        <input id="inputNewPassword" type="password" placeholder="Digite a nova senha" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelPwdModalBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="savePwdModalBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Atualizar Senha</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closePwdModalBtn').onclick = close;
  modal.querySelector('#cancelPwdModalBtn').onclick = close;
  modal.querySelector('#savePwdModalBtn').onclick = async () => {
    const currentPassword = modal.querySelector('#inputCurrentPassword').value;
    const newPassword = modal.querySelector('#inputNewPassword').value;
    try {
      const res = await window.LouvorAPI.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword }
      });
      showLocalToast(res.message || 'Senha alterada com sucesso!');
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function openAddInstrumentModal() {
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Adicionar Categoria Vocal / Instrumento</h3>
        <button type="button" id="closeSkillModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-sm text-on-surface-variant uppercase">Categoria na Escala / Enquete</label>
        <select id="selectSkillCategoryKey" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface">
          <option value="soprano" data-icon="mic" data-default-name="Vocal • Soprano">Vocal • Soprano</option>
          <option value="contralto" data-icon="mic" data-default-name="Vocal • Contralto">Vocal • Contralto</option>
          <option value="tenor" data-icon="mic" data-default-name="Vocal • Tenor">Vocal • Tenor</option>
          <option value="vocal" data-icon="mic" data-default-name="Vocal Solo & Backing">Vocal Geral / Backing</option>
          <option value="teclado" data-icon="piano" data-default-name="Teclado & Synth">Tecladista (Teclado / Piano)</option>
          <option value="violao" data-icon="queue_music" data-default-name="Violão Acústico">Instrumentista • Violão</option>
          <option value="guitarra" data-icon="electric_bolt" data-default-name="Guitarra">Instrumentista • Guitarra</option>
          <option value="baixo" data-icon="graphic_eq" data-default-name="Contrabaixo">Instrumentista • Contrabaixo</option>
          <option value="bateria" data-icon="album" data-default-name="Bateria Acústica">Instrumentista • Bateria</option>
          <option value="percussao" data-icon="music_note" data-default-name="Percussão & Outros">Instrumentista • Percussão / Outros</option>
        </select>
        <label class="font-label-sm text-on-surface-variant uppercase">Nome de Exibição</label>
        <input id="inputSkillName" value="Vocal • Soprano" placeholder="Ex: Vocal • Soprano / Teclado" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Equipamento / Observações</label>
        <input id="inputSkillNotes" placeholder="Ex: In-Ear Próprio • Pedaleira" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Nível de Atuação</label>
        <select id="selectSkillLevel" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface">
          <option value="Principal">Principal</option>
          <option value="Secundário">Secundário</option>
          <option value="Suporte">Suporte</option>
        </select>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelSkillModalBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveSkillModalBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Adicionar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeSkillModalBtn').onclick = close;
  modal.querySelector('#cancelSkillModalBtn').onclick = close;

  const catSelect = modal.querySelector('#selectSkillCategoryKey');
  const nameInput = modal.querySelector('#inputSkillName');
  catSelect.onchange = () => {
    const opt = catSelect.options[catSelect.selectedIndex];
    if (opt) nameInput.value = opt.getAttribute('data-default-name') || '';
  };

  modal.querySelector('#saveSkillModalBtn').onclick = async () => {
    const role_key = catSelect.value;
    const opt = catSelect.options[catSelect.selectedIndex];
    const icon = (opt && opt.getAttribute('data-icon')) || 'music_note';
    const skill_name = nameInput.value.trim() || (opt && opt.getAttribute('data-default-name')) || 'Instrumento';
    const equipment_notes = modal.querySelector('#inputSkillNotes').value.trim();
    const level_badge = modal.querySelector('#selectSkillLevel').value;
    try {
      const res = await window.LouvorAPI.request('/api/users/skills', {
        method: 'POST',
        body: { role_key, skill_name, equipment_notes, level_badge, icon, status: 'Ativo' }
      });
      renderSkillsList(res.skills || []);
      showLocalToast(res.message);
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function openPreferencesModal() {
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Ajustar Preferências de Escala</h3>
        <button type="button" id="closePrefModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-sm text-on-surface-variant uppercase">Cultos Favoritos</label>
        <input id="inputFavServices" value="${window.LouvorAPI.escapeHtml(profileUser.favorite_services || '')}" placeholder="Ex: Domingo Noite (19h)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Frequência Semanal</label>
        <input id="inputFreqBadge" value="${window.LouvorAPI.escapeHtml(profileUser.favorite_frequency_badge || '')}" placeholder="Ex: 1x semana" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Frequência Mensal Desejada</label>
        <input id="inputDesiredFreq" value="${window.LouvorAPI.escapeHtml(profileUser.desired_frequency || '')}" placeholder="Ex: Até 3x por mês" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Restrição Recorrente</label>
        <input id="inputRestriction" value="${window.LouvorAPI.escapeHtml(profileUser.recurring_restriction || '')}" placeholder="Ex: Indisponível às sextas" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelPrefModalBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="savePrefModalBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar Preferências</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closePrefModalBtn').onclick = close;
  modal.querySelector('#cancelPrefModalBtn').onclick = close;
  modal.querySelector('#savePrefModalBtn').onclick = async () => {
    const favorite_services = modal.querySelector('#inputFavServices').value.trim();
    const favorite_frequency_badge = modal.querySelector('#inputFreqBadge').value.trim();
    const desired_frequency = modal.querySelector('#inputDesiredFreq').value.trim();
    const recurring_restriction = modal.querySelector('#inputRestriction').value.trim();
    try {
      const res = await window.LouvorAPI.request('/api/users/profile', {
        method: 'PUT',
        body: { favorite_services, favorite_frequency_badge, desired_frequency, recurring_restriction }
      });
      renderProfileData(res.user);
      showLocalToast('Preferências de escala atualizadas!');
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function openInfoModal(title, contentHtml) {
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">${title}</h3>
        <button type="button" id="closeInfoModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="font-body-sm text-on-surface-variant space-y-2 max-h-[60vh] overflow-y-auto">${contentHtml}</div>
      <button type="button" id="okInfoModalBtn" class="h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Entendido</button>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeInfoModalBtn').onclick = close;
  modal.querySelector('#okInfoModalBtn').onclick = close;
}

(async function () {
  const currentUser = await window.LouvorNav.initPage({ activeTab: 'perfil-config' });
  if (!currentUser) return;

  const res = await window.LouvorAPI.request('/api/users/profile');
  renderProfileData(res.user);

  // Upload de Foto de Perfil
  const avatarBtn = document.getElementById('btnTriggerAvatarUpload');
  const fileInput = document.getElementById('avatarFileInput');
  if (avatarBtn && fileInput) {
    avatarBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFileSelected(e.target.files[0]);
        fileInput.value = '';
      }
    };
  }

  // Toggles handler conectado ao banco
  document.querySelectorAll('.toggle-switch').forEach((toggle) => {
    toggle.addEventListener('click', async () => {
      const isChecked = toggle.getAttribute('aria-checked') === 'true';
      const nextState = !isChecked;
      const field = toggle.getAttribute('data-field');
      setSwitchVisual(toggle, nextState);
      try {
        await window.LouvorAPI.request('/api/users/profile', {
          method: 'PUT',
          body: { [field]: nextState }
        });
        showLocalToast(nextState ? 'Preferência ativada com sucesso!' : 'Notificação desativada');
      } catch (err) {
        setSwitchVisual(toggle, isChecked);
        window.LouvorAPI.showToast(err.message, 'error');
      }
    });
  });

  document.getElementById('btnEditProfile').onclick = openEditProfileModal;
  document.getElementById('btnAddInstrument').onclick = openAddInstrumentModal;
  document.getElementById('btnAddUnavailability').onclick = openAddUnavailabilityModal;
  document.getElementById('btnEditPreferences').onclick = openPreferencesModal;
  const pwdBtn = document.getElementById('btnOpenChangePasswordModal');
  if (pwdBtn) pwdBtn.onclick = openChangePasswordModal;

  document.getElementById('linkRepertoireCatalog').onclick = async () => {
    const sRes = await window.LouvorAPI.request('/api/repertoire');
    const songs = sRes.songs || [];
    openInfoModal(
      `Repertório Geral & Cifras (${songs.length})`,
      songs.length === 0
        ? '<p>Nenhuma música cadastrada no repertório ainda.</p>'
        : songs
            .map(
              (s) => `
        <div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between">
          <div>
            <strong class="text-on-surface block">${window.LouvorAPI.escapeHtml(s.title)}</strong>
            <span>${window.LouvorAPI.escapeHtml(s.artist)} • ${s.bpm} BPM</span>
          </div>
          <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-bold">${window.LouvorAPI.escapeHtml(s.musical_key)}</span>
        </div>
      `
            )
            .join('')
    );
  };

  document.getElementById('linkMinistryManual').onclick = () => {
    openInfoModal(
      'Manual do Ministério de Louvor',
      `
        <p><strong class="text-on-surface">1. Pontualidade e Passagem de Som:</strong> Chegar rigorosamente no horário de passagem de som definido na escala.</p>
        <p><strong class="text-on-surface">2. Preparação Musical:</strong> Ouça as versões de referência e estude as cifras e tons com antecedência mínima de 48h.</p>
        <p><strong class="text-on-surface">3. Indisponibilidades &amp; Trocas:</strong> Cadastre períodos de viagem no seu perfil com antecedência ou solicite trocas pelo LouvorApp com até 24h antes do culto.</p>
        <p><strong class="text-on-surface">4. Vestimenta (Dress-code):</strong> Tons sóbrios e alinhados à iluminação de palco.</p>
      `
    );
  };

  document.getElementById('linkTermsPrivacy').onclick = () => {
    openInfoModal(
      'Termos & Privacidade (LGPD)',
      `
        <p>Os dados pessoais (Nome, E-mail, Telefone/WhatsApp, Foto de Perfil e Períodos de Indisponibilidade) armazenados no LouvorApp destinam-se exclusivamente à organização interna das escalas, ensaios e comunicados do Ministério de Louvor.</p>
        <p>Senhas são criptografadas com hash seguro (scrypt + salt) e o controle de acesso é validado em todas as rotas do servidor.</p>
      `
    );
  };

  document.getElementById('btnSwitchCampus').onclick = async () => {
    const curr = profileUser.campus || 'Campus Central';
    const nextIdx = (CAMPUSES.indexOf(curr) + 1) % CAMPUSES.length;
    const nextCampus = CAMPUSES[nextIdx];
    try {
      const r = await window.LouvorAPI.request('/api/users/profile', {
        method: 'PUT',
        body: { campus: nextCampus }
      });
      renderProfileData(r.user);
      showLocalToast(`Campus alterado para ${nextCampus}!`);
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };

  document.getElementById('btnLogout').onclick = () => {
    showLocalToast('Encerrando sessão com segurança...');
    setTimeout(() => {
      window.LouvorNav.logout();
    }, 400);
  };
})();
