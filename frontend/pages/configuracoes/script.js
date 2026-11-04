let currentAdminEmails = [];
let permissionsRows = [];

async function loadSystemSettings() {
  const res = await window.LouvorAPI.request('/api/settings');
  currentAdminEmails = (res.settings && res.settings.ADMIN_EMAILS) || [];
  permissionsRows = res.permissions || [];
  renderAdminEmails();
  renderPermissionsMatrix();
  renderAuditLogs(res.auditLogs || []);
}

function renderAdminEmails() {
  const container = document.getElementById('adminEmailsChips');
  if (!container) return;
  container.innerHTML = currentAdminEmails
    .map(
      (email) => `
      <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container-high text-on-surface font-label-md">
        <span class="w-2 h-2 rounded-full bg-secondary"></span>
        <span>${window.LouvorAPI.escapeHtml(email)}</span>
        <button type="button" onclick="removeAdminEmail('${window.LouvorAPI.escapeHtml(email)}')" class="text-outline hover:text-error flex items-center">
          <span class="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>
    `
    )
    .join('');
}

async function removeAdminEmail(email) {
  if (currentAdminEmails.length <= 1) {
    window.LouvorAPI.showToast('Mantenha pelo menos 1 e-mail administrador na lista.', 'warning');
    return;
  }
  const updatedList = currentAdminEmails.filter((e) => e !== email);
  try {
    const res = await window.LouvorAPI.request('/api/settings', {
      method: 'PUT',
      body: { ADMIN_EMAILS: updatedList }
    });
    currentAdminEmails = res.settings.ADMIN_EMAILS;
    renderAdminEmails();
    window.LouvorAPI.showToast(`E-mail ${email} removido de ADMIN_EMAILS.`);
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function renderPermissionsMatrix() {
  const tbody = document.getElementById('permissionsMatrixBody');
  if (!tbody) return;

  const userPerms = permissionsRows.filter((p) => p.role === 'USER');
  const cols = ['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve'];

  tbody.innerHTML = userPerms
    .map(
      (row) => `
      <tr>
        <td class="py-3 pr-3 font-medium text-on-surface">${window.LouvorAPI.escapeHtml(row.module_label)}</td>
        ${cols
          .map(
            (c) => `
          <td class="py-3 px-2 text-center">
            <input type="checkbox" class="w-4 h-4 rounded accent-emerald-400 cursor-pointer"
              ${row[c] ? 'checked' : ''}
              onchange="togglePermissionFlag('USER', '${row.module}', '${c}', this.checked)" />
          </td>
        `
          )
          .join('')}
      </tr>
    `
    )
    .join('');
}

async function togglePermissionFlag(role, moduleName, flagKey, isChecked) {
  try {
    const res = await window.LouvorAPI.request('/api/settings/permissions', {
      method: 'PUT',
      body: {
        role,
        module: moduleName,
        flags: { [flagKey]: isChecked }
      }
    });
    permissionsRows = res.permissions || [];
    window.LouvorAPI.showToast(res.message);
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
    await loadSystemSettings();
  }
}

function renderAuditLogs(logs) {
  const container = document.getElementById('auditLogsContainer');
  if (!container) return;
  container.innerHTML = logs
    .map(
      (l) => `
      <div class="p-2.5 rounded-xl bg-surface-container flex items-center justify-between gap-3">
        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-primary/15 text-primary font-label-sm">${window.LouvorAPI.escapeHtml(l.action)}</span>
            <span class="font-label-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(l.user_email || 'sistema')}</span>
          </div>
          <span class="font-body-sm text-on-surface truncate mt-0.5">${window.LouvorAPI.escapeHtml(l.details || '')}</span>
        </div>
        <span class="font-label-sm text-outline shrink-0">${window.LouvorAPI.escapeHtml((l.created_at || '').slice(0, 16))}</span>
      </div>
    `
    )
    .join('');
}

(async function () {
  const user = await window.LouvorNav.initPage({ activeTab: 'configuracoes', adminOnly: true });
  if (!user) return;

  document.getElementById('btnAddAdminEmail').onclick = async () => {
    const input = document.getElementById('newAdminEmailInput');
    const email = input.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      window.LouvorAPI.showToast('Informe um e-mail válido.', 'warning');
      return;
    }
    const updatedList = Array.from(new Set([...currentAdminEmails, email]));
    try {
      const res = await window.LouvorAPI.request('/api/settings', {
        method: 'PUT',
        body: { ADMIN_EMAILS: updatedList }
      });
      currentAdminEmails = res.settings.ADMIN_EMAILS;
      input.value = '';
      renderAdminEmails();
      window.LouvorAPI.showToast(`E-mail ${email} adicionado à lista ADMIN_EMAILS!`);
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };

  await loadSystemSettings();
})();
