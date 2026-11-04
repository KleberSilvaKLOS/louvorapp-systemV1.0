let adminUser = null;
let usersList = [];
let searchDebounceTimer = null;

async function loadUsers() {
  const search = document.getElementById('searchUsersInput').value.trim();
  const role = document.getElementById('filterUserRole').value;
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (role) q.set('role', role);

  const res = await window.LouvorAPI.request(`/api/users?${q.toString()}`);
  usersList = res.users || [];
  renderUsersGrid();
}

function renderUsersGrid() {
  const grid = document.getElementById('usersListGrid');
  if (!grid) return;

  grid.innerHTML = usersList
    .map((u) => {
      const isSelf = u.id === adminUser.id;
      const isAdmin = u.role === 'ADMIN';
      const hasPhoto = Boolean(u.avatar_url && String(u.avatar_url).trim() !== '');
      const avatarHtml = hasPhoto
        ? `<img src="${window.LouvorAPI.escapeHtml(u.avatar_url)}" class="w-11 h-11 rounded-full object-cover shrink-0" alt="${window.LouvorAPI.escapeHtml(u.full_name)}" />`
        : `<div class="w-11 h-11 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[22px]">person</span></div>`;

      return `
        <div class="p-4 rounded-2xl bg-surface-container-low border ${
          isAdmin ? 'border-secondary/30' : 'border-outline-variant/20'
        } flex flex-col justify-between gap-3 shadow-sm">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              ${avatarHtml}
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="font-headline-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(u.full_name)}</span>
                  ${isSelf ? '<span class="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-label-sm text-[10px]">Você</span>' : ''}
                </div>
                <span class="font-body-sm text-on-surface-variant truncate">${window.LouvorAPI.escapeHtml(u.email)} • ${window.LouvorAPI.escapeHtml(u.whatsapp)}</span>
                <span class="font-label-sm text-primary mt-0.5">${window.LouvorAPI.escapeHtml(u.title || 'Membro')} • ${window.LouvorAPI.escapeHtml(u.campus || 'Campus Central')}</span>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full ${
              isAdmin ? 'bg-secondary-container/25 text-secondary' : 'bg-surface-container-highest text-on-surface-variant'
            } font-label-sm uppercase font-bold shrink-0">${u.role}</span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-outline-variant/20 gap-2">
            <div class="flex items-center gap-1.5">
              <button type="button" ${isSelf ? 'disabled title="Você não pode alterar seu próprio nível de acesso"' : ''} onclick="toggleUserRole(${u.id}, '${u.role}')" class="px-2.5 py-1.5 rounded-lg ${
        isSelf
          ? 'bg-surface-container text-outline opacity-50 cursor-not-allowed'
          : 'bg-surface-container-high hover:bg-surface-bright text-on-surface'
      } font-label-sm flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">swap_horiz</span>
                <span>Tornar ${isAdmin ? 'USER' : 'ADMIN'}</span>
              </button>
              <button type="button" onclick="openEditUserModal(${u.id})" class="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-label-sm">
                Editar
              </button>
            </div>
            ${
              !isSelf
                ? `<button type="button" onclick="deleteUserById(${u.id}, '${window.LouvorAPI.escapeHtml(u.full_name)}')" class="px-2.5 py-1.5 rounded-lg bg-error-container/30 hover:bg-error-container/50 text-error font-label-sm">Excluir</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

async function toggleUserRole(userId, currentRole) {
  const nextRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
  try {
    const res = await window.LouvorAPI.request(`/api/users/${userId}`, {
      method: 'PUT',
      body: { role: nextRole }
    });
    window.LouvorAPI.showToast(res.message);
    await loadUsers();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function deleteUserById(userId, fullName) {
  if (!confirm(`Tem certeza que deseja remover o usuário "${fullName}"?`)) return;
  try {
    const res = await window.LouvorAPI.request(`/api/users/${userId}`, { method: 'DELETE' });
    window.LouvorAPI.showToast(res.message);
    await loadUsers();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openEditUserModal(userId = null) {
  const u = userId ? usersList.find((item) => item.id === userId) : null;
  const isSelf = u && u.id === adminUser.id;
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">${u ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}</h3>
        <button type="button" id="closeUsrModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <input id="usrFullName" value="${window.LouvorAPI.escapeHtml(u ? u.full_name : '')}" placeholder="Nome Completo" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      ${
        !u
          ? `<input id="usrEmail" type="email" placeholder="E-mail (ex: musico@igreja.org)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
             <input id="usrPassword" type="password" placeholder="Senha Inicial (mín. 6 caracteres)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />`
          : ''
      }
      <input id="usrWhatsapp" value="${window.LouvorAPI.escapeHtml(u ? u.whatsapp : '')}" placeholder="WhatsApp (11) 98888-7777" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      <input id="usrTitle" value="${window.LouvorAPI.escapeHtml(u ? u.title : 'Instrumentista')}" placeholder="Cargo / Função Principal" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      <div class="grid grid-cols-2 gap-2">
        <select id="usrRole" ${isSelf ? 'disabled' : ''} class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm">
          <option value="USER" ${u?.role === 'USER' ? 'selected' : ''}>Perfil: USER</option>
          <option value="ADMIN" ${u?.role === 'ADMIN' ? 'selected' : ''}>Perfil: ADMIN</option>
        </select>
        <select id="usrStatus" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm">
          <option value="active" ${u?.status !== 'inactive' ? 'selected' : ''}>Status: Ativo</option>
          <option value="inactive" ${u?.status === 'inactive' ? 'selected' : ''}>Status: Inativo</option>
        </select>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelUsrBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveUsrBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeUsrModalBtn').onclick = close;
  modal.querySelector('#cancelUsrBtn').onclick = close;
  modal.querySelector('#saveUsrBtn').onclick = async () => {
    const full_name = modal.querySelector('#usrFullName').value.trim();
    const whatsapp = modal.querySelector('#usrWhatsapp').value.trim();
    const title = modal.querySelector('#usrTitle').value.trim();
    const role = modal.querySelector('#usrRole').value;
    const status = modal.querySelector('#usrStatus').value;

    try {
      if (u) {
        const body = { full_name, whatsapp, title, status };
        if (!isSelf) body.role = role;
        const res = await window.LouvorAPI.request(`/api/users/${u.id}`, { method: 'PUT', body });
        window.LouvorAPI.showToast(res.message);
      } else {
        const email = modal.querySelector('#usrEmail').value.trim();
        const password = modal.querySelector('#usrPassword').value;
        const res = await window.LouvorAPI.request('/api/users', {
          method: 'POST',
          body: { full_name, email, whatsapp, password, title, role }
        });
        window.LouvorAPI.showToast(res.message);
      }
      close();
      await loadUsers();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

(async function () {
  adminUser = await window.LouvorNav.initPage({ activeTab: 'usuarios', adminOnly: true });
  if (!adminUser) return;

  document.getElementById('searchUsersInput').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      loadUsers();
    }, 300);
  });
  document.getElementById('filterUserRole').addEventListener('change', () => loadUsers());
  document.getElementById('btnNewUserModal').onclick = () => openEditUserModal(null);

  await loadUsers();
})();
