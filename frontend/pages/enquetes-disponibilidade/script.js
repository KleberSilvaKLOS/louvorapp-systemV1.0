let currentUser = null;
let allPolls = [];
let activeFilter = 'todas';
let currentFeaturedPollId = null;

function setActiveFilter(filterName) {
  activeFilter = filterName;
  const filters = ['todas', 'pendentes', 'encerradas'];
  filters.forEach((f) => {
    const el = document.getElementById('filter-' + f);
    if (!el) return;
    if (f === filterName) {
      el.className =
        'px-3 py-1.5 rounded-full font-label-md text-label-md bg-primary text-on-primary font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95';
    } else {
      el.className =
        'px-3 py-1.5 rounded-full font-label-md text-label-md bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 transition-all active:scale-95';
    }
  });
  renderPollsUI();
}

async function castVote(pollId, isAvailable) {
  try {
    const res = await window.LouvorAPI.request(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      body: { is_available: isAvailable }
    });
    window.LouvorAPI.showToast(res.message);
    await loadPolls();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function togglePollStatus(pollId, currentStatus) {
  const nextStatus = currentStatus === 'open' ? 'closed' : 'open';
  try {
    const res = await window.LouvorAPI.request(`/api/polls/${pollId}/status`, {
      method: 'PUT',
      body: { status: nextStatus }
    });
    window.LouvorAPI.showToast(res.message);
    await loadPolls();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function deletePollById(pollId) {
  if (!confirm('Tem certeza de que deseja excluir esta enquete permanentemente?')) return;
  try {
    const res = await window.LouvorAPI.request(`/api/polls/${pollId}`, {
      method: 'DELETE'
    });
    window.LouvorAPI.showToast(res.message);
    currentFeaturedPollId = null;
    await loadPolls();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function handleGenerateRoster(pollId, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> <span>Gerando Escala...</span>';

  try {
    const res = await window.LouvorAPI.request(`/api/polls/${pollId}/generate-roster`, {
      method: 'POST'
    });
    window.LouvorAPI.showToast(res.message);
    btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">task_alt</span> <span>Escala Gerada no Calendário!</span>';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = orig;
    }, 2000);
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

function selectFeaturedPoll(pollId) {
  currentFeaturedPollId = pollId;
  renderPollsUI();
}

function renderPollsUI() {
  const wrapper = document.getElementById('featuredPollWrapper');
  const otherList = document.getElementById('otherPollsListContainer');

  const filtered = allPolls.filter((p) => {
    if (activeFilter === 'pendentes') return p.status === 'open';
    if (activeFilter === 'encerradas') return p.status === 'closed';
    return true;
  });

  if (filtered.length === 0) {
    wrapper.innerHTML = `
      <div class="p-6 rounded-2xl bg-surface-container-low text-center flex flex-col items-center gap-3 shadow-md">
        <div class="w-12 h-12 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center">
          <span class="material-symbols-outlined text-[26px]">how_to_vote</span>
        </div>
        <div class="flex flex-col gap-1">
          <h3 class="font-headline-sm text-on-surface">Nenhuma enquete encontrada</h3>
          <p class="font-body-sm text-on-surface-variant max-w-xs">
            ${
              currentUser && currentUser.role === 'ADMIN'
                ? 'Clique em "+ Nova Enquete" acima para consultar a disponibilidade da equipe.'
                : 'Aguarde a liderança abrir a próxima enquete de disponibilidade mensal.'
            }
          </p>
        </div>
      </div>
    `;
    otherList.innerHTML = '';
    return;
  }

  const featured = filtered.find((p) => p.id === currentFeaturedPollId) || filtered[0];
  currentFeaturedPollId = featured.id;

  const userSkillsHint =
    currentUser.skills && currentUser.skills.length > 0
      ? currentUser.skills.map((s) => s.skill_name.split(' ')[0]).slice(0, 2).join(' & ')
      : 'Membro';

  const myVote = featured.my_vote;
  const targets = featured.targets || [];
  const isAdmin = currentUser && currentUser.role === 'ADMIN';
  const isClosed = featured.status === 'closed';

  wrapper.innerHTML = `
    <div class="relative bg-surface-container rounded-xl p-space-md flex flex-col gap-space-md shadow-lg overflow-hidden">
      <div class="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary-container"></div>
      <div class="flex flex-col gap-space-xs">
        <div class="flex items-center justify-between gap-space-xs">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full ${
              featured.status === 'open' ? 'bg-secondary animate-pulse shadow-[0_0_8px_#4edea3]' : 'bg-outline'
            }"></span>
            <span class="font-label-sm text-label-sm uppercase tracking-wider ${
              featured.status === 'open' ? 'text-secondary' : 'text-on-surface-variant'
            } font-bold">${featured.status === 'open' ? 'Enquete Aberta' : 'Enquete Encerrada'}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="flex items-center gap-1 bg-tertiary-container/30 px-2 py-0.5 rounded-full text-tertiary-fixed-dim">
              <span class="material-symbols-outlined text-[14px]">timer</span>
              <span class="font-label-sm text-label-sm font-semibold">${window.LouvorAPI.escapeHtml(featured.deadline_label)}</span>
            </div>
            ${
              isAdmin
                ? `
              <button type="button" onclick="togglePollStatus(${featured.id}, '${featured.status}')" class="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-label-sm text-[11px]" title="Alternar status da enquete">
                ${featured.status === 'open' ? 'Encerrar' : 'Reabrir'}
              </button>
              <button type="button" onclick="deletePollById(${featured.id})" class="p-1 rounded-full text-outline hover:text-error" title="Excluir enquete">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            `
                : ''
            }
          </div>
        </div>
        <h3 class="font-headline-md text-headline-md text-on-surface mt-1 leading-snug">${window.LouvorAPI.escapeHtml(featured.title)}</h3>
        <div class="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm">
          <span class="material-symbols-outlined text-[16px] text-primary">schedule</span>
          <span>${window.LouvorAPI.escapeHtml(featured.subtitle)}</span>
        </div>
      </div>

      <!-- Member Voting Interface -->
      <div class="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm shadow-inner">
        <div class="flex items-center justify-between">
          <span class="font-label-lg text-label-lg text-on-surface">Você pode ministrar nesta data?</span>
          <span class="font-label-sm text-label-sm ${
            myVote === true ? 'text-secondary' : myVote === false ? 'text-error' : 'text-on-surface-variant'
          } flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">${
              myVote === true ? 'check_circle' : myVote === false ? 'cancel' : 'help'
            }</span>
            ${myVote === true ? 'Confirmado' : myVote === false ? 'Indisponível' : 'Pendente'}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-space-sm">
          <button type="button" ${isClosed ? 'disabled' : ''} onclick="castVote(${featured.id}, true)" class="flex items-center justify-center gap-2 py-3 px-space-sm rounded-xl ${
            myVote === true
              ? 'bg-secondary-container text-on-secondary shadow-md'
              : 'bg-surface-container-high text-on-surface-variant'
          } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''} font-label-lg text-label-lg transition-all active:scale-95">
            <span class="material-symbols-outlined text-[20px]">check_circle</span>
            <span>Disponível</span>
          </button>
          <button type="button" ${isClosed ? 'disabled' : ''} onclick="castVote(${featured.id}, false)" class="flex items-center justify-center gap-2 py-3 px-space-sm rounded-xl ${
            myVote === false
              ? 'bg-error-container text-on-error-container shadow-md'
              : 'bg-surface-container-high text-on-surface-variant'
          } ${isClosed ? 'opacity-60 cursor-not-allowed' : ''} font-label-lg text-label-lg transition-all active:scale-95">
            <span class="material-symbols-outlined text-[20px]">cancel</span>
            <span>Indisponível</span>
          </button>
        </div>
        <div class="flex items-center justify-between pt-1">
          <span class="font-body-sm text-body-sm text-on-surface-variant">Sua função cadastrada:</span>
          <div class="flex items-center gap-1 bg-surface-container-highest px-2 py-0.5 rounded-full">
            <span class="material-symbols-outlined text-[14px] text-primary">straighten</span>
            <span class="font-label-sm text-label-sm text-on-surface font-semibold">${window.LouvorAPI.escapeHtml(userSkillsHint)}</span>
          </div>
        </div>
      </div>

      <!-- Response Breakdown Section -->
      <div class="bg-surface-container-lowest/80 rounded-xl p-space-md flex flex-col gap-space-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">equalizer</span>
            <span class="font-label-lg text-label-lg text-on-surface">Balanço de Respostas</span>
          </div>
          <span class="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">${featured.voted_count || 0} de ${featured.total_invited || 1} votaram</span>
        </div>

        <div class="flex flex-col gap-3 pt-1">
          ${targets
            .map((t) => {
              const pct = Math.min(100, Math.round(((t.confirmed_count || 0) / Math.max(t.target_count || 1, 1)) * 100));
              const met = (t.confirmed_count || 0) >= (t.target_count || 1);
              return `
                <div class="flex flex-col gap-1">
                  <div class="flex justify-between items-center font-body-sm text-body-sm">
                    <span class="text-on-surface flex items-center gap-1.5">
                      <span class="material-symbols-outlined text-[16px] ${met ? 'text-secondary' : 'text-tertiary'}">${window.LouvorAPI.escapeHtml(t.icon || 'music_note')}</span>
                      ${window.LouvorAPI.escapeHtml(t.role_label)}
                    </span>
                    <span class="font-label-sm text-label-sm ${met ? 'text-secondary' : 'text-tertiary-fixed-dim'} font-bold">
                      ${t.confirmed_count || 0}/${t.target_count || 1} confirmados
                    </span>
                  </div>
                  <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div class="h-full ${met ? 'bg-secondary' : 'bg-tertiary-container'} rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        ${
          isAdmin
            ? `
          <button type="button" onclick="handleGenerateRoster(${featured.id}, this)" class="mt-2 w-full h-12 bg-primary text-on-primary hover:bg-primary-fixed-dim rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all">
            <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
            <span>Gerar Escala com IA / Respostas</span>
          </button>
        `
            : ''
        }
      </div>
    </div>
  `;

  const others = filtered.filter((p) => p.id !== featured.id);
  otherList.innerHTML = others
    .map(
      (p) => `
      <div class="bg-surface-container-low rounded-xl p-space-md flex items-center justify-between shadow-md">
        <div class="flex flex-col">
          <span class="font-label-sm text-primary uppercase font-bold">${p.status === 'open' ? 'Aberta' : 'Encerrada'} • ${window.LouvorAPI.escapeHtml(p.deadline_label)}</span>
          <span class="font-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(p.title)}</span>
          <span class="font-body-sm text-on-surface-variant">${p.voted_count || 0} membro(s) responderam</span>
        </div>
        <div class="flex items-center gap-1.5">
          ${
            isAdmin
              ? `
            <button type="button" onclick="togglePollStatus(${p.id}, '${p.status}')" class="px-2 py-1 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-label-sm text-[11px]">
              ${p.status === 'open' ? 'Encerrar' : 'Reabrir'}
            </button>
            <button type="button" onclick="deletePollById(${p.id})" class="p-1 text-outline hover:text-error" title="Excluir enquete">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          `
              : ''
          }
          <button type="button" onclick="selectFeaturedPoll(${p.id})" class="px-3 py-1.5 rounded-lg bg-surface-container-high text-primary font-label-sm">Abrir</button>
        </div>
      </div>
    `
    )
    .join('');
}

function openCreatePollModal() {
  if (currentUser.role !== 'ADMIN') {
    window.LouvorAPI.showToast('Apenas líderes (ADMIN) podem criar novas enquetes.', 'warning');
    return;
  }
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Abrir Nova Enquete de Disponibilidade</h3>
        <button type="button" id="closePollModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <input id="newPollTitle" placeholder="Título (Ex: Escala Culto de Domingo)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      <div class="grid grid-cols-2 gap-2">
        <input id="newPollDate" type="date" value="${todayIso}" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        <input id="newPollDeadline" placeholder="Prazo (Ex: Até Qui, 22:00)" value="Até Qui, 22:00" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input id="newPollTime" placeholder="Horário Culto (19:00)" value="19:00" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        <input id="newPollSoundcheck" placeholder="Passagem de Som (17:30)" value="17:30" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelPollBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="savePollBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Publicar Enquete</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closePollModalBtn').onclick = close;
  modal.querySelector('#cancelPollBtn').onclick = close;
  modal.querySelector('#savePollBtn').onclick = async () => {
    const title = modal.querySelector('#newPollTitle').value.trim();
    const event_date = modal.querySelector('#newPollDate').value;
    const deadline_label = modal.querySelector('#newPollDeadline').value.trim();
    const event_time = modal.querySelector('#newPollTime').value.trim();
    const soundcheck_time = modal.querySelector('#newPollSoundcheck').value.trim();
    try {
      const res = await window.LouvorAPI.request('/api/polls', {
        method: 'POST',
        body: { title, event_date, deadline_label, event_time, soundcheck_time }
      });
      window.LouvorAPI.showToast(res.message);
      currentFeaturedPollId = res.poll.id;
      close();
      await loadPolls();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

async function loadPolls() {
  const res = await window.LouvorAPI.request('/api/polls?filter=todas');
  allPolls = res.polls || [];
  const openPolls = allPolls.filter((p) => p.status === 'open');
  const badgeEl = document.getElementById('pendingPollsBadgeCount');
  if (badgeEl) badgeEl.textContent = String(openPolls.length);
  renderPollsUI();
}

(async function () {
  currentUser = await window.LouvorNav.initPage({ activeTab: 'enquetes' });
  if (!currentUser) return;

  document.getElementById('btnOpenNewPollModal').onclick = openCreatePollModal;
  const newPollIconBtn = document.getElementById('btnNewPollIcon');
  if (newPollIconBtn) newPollIconBtn.onclick = openCreatePollModal;

  await loadPolls();
})();
