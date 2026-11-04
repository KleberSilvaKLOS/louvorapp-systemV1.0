let currentUser = null;
let allPolls = [];
let activeFilter = 'todas';
let currentFeaturedPollId = null;

const POLL_CATEGORY_CATALOG = [
  { role_key: 'soprano', role_label: 'Sopranos', icon: 'mic', group: 'Vocais', default_count: 1 },
  { role_key: 'contralto', role_label: 'Contraltos', icon: 'mic', group: 'Vocais', default_count: 1 },
  { role_key: 'tenor', role_label: 'Tenores', icon: 'mic', group: 'Vocais', default_count: 1 },
  { role_key: 'vocal', role_label: 'Vocal Geral / Backing', icon: 'mic', group: 'Vocais', default_count: 0 },
  { role_key: 'teclado', role_label: 'Tecladistas', icon: 'piano', group: 'Instrumentistas', default_count: 1 },
  { role_key: 'violao', role_label: 'Violão', icon: 'queue_music', group: 'Instrumentistas', default_count: 1 },
  { role_key: 'guitarra', role_label: 'Guitarra', icon: 'electric_bolt', group: 'Instrumentistas', default_count: 1 },
  { role_key: 'baixo', role_label: 'Contrabaixo', icon: 'graphic_eq', group: 'Instrumentistas', default_count: 1 },
  { role_key: 'bateria', role_label: 'Bateria', icon: 'album', group: 'Instrumentistas', default_count: 1 },
  { role_key: 'percussao', role_label: 'Percussão / Sopros / Outros', icon: 'music_note', group: 'Instrumentistas', default_count: 0 }
];

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
  const roleSelect = document.getElementById(`voteRoleSelect_${pollId}`);
  let role_key = '';
  let role_label = '';
  if (roleSelect) {
    role_key = roleSelect.value;
    const selectedOpt = roleSelect.options[roleSelect.selectedIndex];
    role_label = selectedOpt ? selectedOpt.getAttribute('data-label') || selectedOpt.textContent : '';
  }

  try {
    const res = await window.LouvorAPI.request(`/api/polls/${pollId}/vote`, {
      method: 'POST',
      body: { is_available: isAvailable, role_key, role_label }
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

function formatVoteTime(isoStr) {
  if (!isoStr) return '';
  const parts = String(isoStr).split(' ');
  const datePart = (parts[0] || '').split('-').reverse().slice(0, 2).join('/');
  const timePart = (parts[1] || '').slice(0, 5);
  return `${datePart} ${timePart}`.trim();
}

function openPollVotesModal(pollId) {
  const poll = allPolls.find((p) => p.id === pollId);
  if (!poll) return;

  const votes = poll.votes || [];
  const availableVotes = votes.filter((v) => v.is_available === 1);
  const unavailableVotes = votes.filter((v) => v.is_available === 0);
  const pendingMembers = poll.pending_members || [];
  const unavailOnDate = poll.unavailable_on_date || [];

  const existing = document.getElementById('pollVotesDetailModal');
  if (existing) existing.remove();

  let activeVoteTab = 'all';

  const modal = document.createElement('div');
  modal.id = 'pollVotesDetailModal';
  modal.className = 'louvor-modal-backdrop';

  function renderModalContent() {
    let listHtml = '';
    if (activeVoteTab === 'all' || activeVoteTab === 'available' || activeVoteTab === 'unavailable') {
      const subset =
        activeVoteTab === 'available'
          ? availableVotes
          : activeVoteTab === 'unavailable'
            ? unavailableVotes
            : votes;

      if (subset.length === 0) {
        listHtml = `<div class="p-4 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">Nenhum voto registrado neste filtro.</div>`;
      } else {
        listHtml = subset
          .map((v) => {
            const isOk = v.is_available === 1;
            const hasAvatar = Boolean(v.avatar_url && String(v.avatar_url).trim() !== '');
            return `
              <div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-2.5 border ${
                isOk ? 'border-secondary/25' : 'border-error/25'
              }">
                <div class="flex items-center gap-2.5 min-w-0">
                  ${
                    hasAvatar
                      ? `<img src="${window.LouvorAPI.escapeHtml(v.avatar_url)}" class="w-9 h-9 rounded-full object-cover shrink-0" alt="" />`
                      : `<div class="w-9 h-9 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[18px]">person</span></div>`
                  }
                  <div class="flex flex-col min-w-0">
                    <span class="font-label-md text-on-surface font-semibold truncate">${window.LouvorAPI.escapeHtml(v.full_name || 'Integrante')}</span>
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="px-2 py-0.2 rounded-full bg-surface-container-highest text-primary font-label-sm text-[10px]">${window.LouvorAPI.escapeHtml(v.role_label || v.role_key || 'Membro')}</span>
                      <span class="font-body-sm text-outline text-[11px]">${window.LouvorAPI.escapeHtml(formatVoteTime(v.voted_at))}</span>
                    </div>
                    ${
                      v.has_date_unavailability
                        ? `<span class="text-[11px] text-tertiary font-medium mt-0.5 flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">event_busy</span> Indisponível no perfil (${window.LouvorAPI.escapeHtml(v.unavailability_reason)})</span>`
                        : ''
                    }
                  </div>
                </div>
                <span class="px-2.5 py-1 rounded-full ${
                  isOk ? 'bg-secondary-container/25 text-secondary' : 'bg-error-container/30 text-error'
                } font-label-sm text-label-sm font-bold flex items-center gap-1 shrink-0">
                  <span class="material-symbols-outlined text-[14px]">${isOk ? 'check_circle' : 'cancel'}</span>
                  ${isOk ? 'Disponível' : 'Indisponível'}
                </span>
              </div>
            `;
          })
          .join('');
      }
    } else if (activeVoteTab === 'pending') {
      if (pendingMembers.length === 0) {
        listHtml = `<div class="p-4 rounded-xl bg-surface-container-low text-center text-secondary font-body-sm">Todos os integrantes ativos já responderam a esta enquete!</div>`;
      } else {
        listHtml = pendingMembers
          .map(
            (m) => `
          <div class="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-2">
            <div class="flex flex-col min-w-0">
              <span class="font-label-md text-on-surface truncate">${window.LouvorAPI.escapeHtml(m.full_name)}</span>
              <span class="font-body-sm text-on-surface-variant text-[11px]">${window.LouvorAPI.escapeHtml(m.title || 'Membro')}</span>
              ${
                m.has_date_unavailability
                  ? `<span class="text-[11px] text-tertiary font-medium mt-0.5 flex items-center gap-1"><span class="material-symbols-outlined text-[13px]">event_busy</span> Em período de indisponibilidade (${window.LouvorAPI.escapeHtml(m.unavailability_reason)})</span>`
                  : ''
              }
            </div>
            <span class="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm">Pendente</span>
          </div>
        `
          )
          .join('');
      }
    }

    modal.innerHTML = `
      <div class="louvor-modal-card flex flex-col gap-3.5">
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <h3 class="font-headline-sm text-on-surface">Respostas Individuais da Enquete</h3>
            <span class="font-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(poll.title)} (${window.LouvorAPI.escapeHtml(poll.event_date)})</span>
          </div>
          <button type="button" id="closeVotesModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div class="grid grid-cols-4 gap-1.5">
          <button type="button" data-vtab="all" class="py-1.5 px-2 rounded-lg font-label-sm ${
            activeVoteTab === 'all' ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container-high text-on-surface-variant'
          }">Todos (${votes.length})</button>
          <button type="button" data-vtab="available" class="py-1.5 px-2 rounded-lg font-label-sm ${
            activeVoteTab === 'available' ? 'bg-secondary text-on-secondary font-bold' : 'bg-surface-container-high text-on-surface-variant'
          }">Sim (${availableVotes.length})</button>
          <button type="button" data-vtab="unavailable" class="py-1.5 px-2 rounded-lg font-label-sm ${
            activeVoteTab === 'unavailable' ? 'bg-error text-on-error font-bold' : 'bg-surface-container-high text-on-surface-variant'
          }">Não (${unavailableVotes.length})</button>
          <button type="button" data-vtab="pending" class="py-1.5 px-2 rounded-lg font-label-sm ${
            activeVoteTab === 'pending' ? 'bg-tertiary text-on-tertiary font-bold' : 'bg-surface-container-high text-on-surface-variant'
          }">Faltam (${pendingMembers.length})</button>
        </div>

        ${
          unavailOnDate.length > 0
            ? `
          <div class="p-2.5 rounded-xl bg-tertiary-container/20 border border-tertiary/30 text-body-sm text-on-surface flex items-start gap-2">
            <span class="material-symbols-outlined text-tertiary text-[18px] shrink-0">flight_takeoff</span>
            <div>
              <strong class="text-tertiary block font-label-sm uppercase">${unavailOnDate.length} integrante(s) com indisponibilidade cadastrada nesta data:</strong>
              <span>${unavailOnDate.map((u) => `${window.LouvorAPI.escapeHtml(u.full_name)} (${window.LouvorAPI.escapeHtml(u.reason)})`).join(' • ')}</span>
            </div>
          </div>
        `
            : ''
        }

        <div class="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
          ${listHtml}
        </div>

        <button type="button" id="okVotesModalBtn" class="h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">
          Fechar Visualização
        </button>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('#closeVotesModalBtn').onclick = close;
    modal.querySelector('#okVotesModalBtn').onclick = close;
    modal.querySelectorAll('[data-vtab]').forEach((btn) => {
      btn.onclick = () => {
        activeVoteTab = btn.getAttribute('data-vtab');
        renderModalContent();
      };
    });
  }

  document.body.appendChild(modal);
  renderModalContent();
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
                ? 'Clique em "+ Nova Enquete" acima para definir as vagas por categoria e consultar a equipe.'
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

  const myVote = featured.my_vote;
  const targets = featured.targets || [];
  const votes = featured.votes || [];
  const isAdmin = currentUser && currentUser.role === 'ADMIN';
  const isClosed = featured.status === 'closed';

  // Opções de função para o voto do integrante (combina habilidades do usuário + categorias da enquete)
  const userSkills = (currentUser && currentUser.skills) || [];
  const defaultUserRoleKey =
    featured.my_vote_role_key ||
    (userSkills[0] && userSkills[0].role_key) ||
    (targets[0] && targets[0].role_key) ||
    'vocal';

  const roleSelectOptions = [];
  const seenKeys = new Set();
  for (const sk of userSkills) {
    if (!seenKeys.has(sk.role_key)) {
      seenKeys.add(sk.role_key);
      roleSelectOptions.push({ key: sk.role_key, label: `${sk.skill_name} (Sua função)` });
    }
  }
  for (const t of targets) {
    if (!seenKeys.has(t.role_key)) {
      seenKeys.add(t.role_key);
      roleSelectOptions.push({ key: t.role_key, label: t.role_label });
    }
  }
  for (const cat of POLL_CATEGORY_CATALOG) {
    if (!seenKeys.has(cat.role_key)) {
      seenKeys.add(cat.role_key);
      roleSelectOptions.push({ key: cat.role_key, label: cat.role_label });
    }
  }

  // Verifica se o próprio usuário logado tem indisponibilidade cadastrada para a data desta enquete
  const myUnavailOnDate = (featured.unavailable_on_date || []).find((u) => u.user_id === currentUser.id);

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
          <span>${window.LouvorAPI.escapeHtml(featured.subtitle)} (${window.LouvorAPI.escapeHtml(featured.event_date)})</span>
        </div>
      </div>

      ${
        myUnavailOnDate
          ? `
        <div class="p-3 rounded-xl bg-tertiary-container/20 border border-tertiary/30 flex items-center gap-2.5 text-body-sm text-on-surface">
          <span class="material-symbols-outlined text-tertiary text-[20px] shrink-0">event_busy</span>
          <span>Você cadastrou indisponibilidade no perfil para esta data (<strong>${window.LouvorAPI.escapeHtml(myUnavailOnDate.reason)}</strong>). O sistema não irá escalá-lo automaticamente neste dia.</span>
        </div>
      `
          : ''
      }

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

        <div class="flex items-center justify-between gap-2 pt-0.5">
          <label class="font-body-sm text-body-sm text-on-surface-variant shrink-0" for="voteRoleSelect_${featured.id}">Votar na categoria:</label>
          <select id="voteRoleSelect_${featured.id}" class="h-9 px-2.5 rounded-lg bg-surface-container-highest text-on-surface font-label-sm flex-1 max-w-[230px]">
            ${roleSelectOptions
              .map(
                (opt) =>
                  `<option value="${window.LouvorAPI.escapeHtml(opt.key)}" data-label="${window.LouvorAPI.escapeHtml(opt.label.replace(' (Sua função)', ''))}" ${
                    opt.key === defaultUserRoleKey ? 'selected' : ''
                  }>${window.LouvorAPI.escapeHtml(opt.label)}</option>`
              )
              .join('')}
          </select>
        </div>

        <div class="grid grid-cols-2 gap-space-sm pt-1">
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
      </div>

      <!-- Response Breakdown Section by Category -->
      <div class="bg-surface-container-lowest/80 rounded-xl p-space-md flex flex-col gap-space-sm">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-[18px] text-primary">equalizer</span>
            <span class="font-label-lg text-label-lg text-on-surface">Vagas &amp; Respostas por Categoria</span>
          </div>
          <span class="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">${featured.voted_count || 0} de ${featured.total_invited || 1} votaram</span>
        </div>

        <div class="flex flex-col gap-3 pt-1">
          ${targets
            .map((t) => {
              const confirmed = t.confirmed_count || 0;
              const needed = Math.max(t.target_count || 1, 1);
              const pct = Math.min(100, Math.round((confirmed / needed) * 100));
              const met = confirmed >= needed;
              const remaining = Math.max(0, needed - confirmed);
              return `
                <div class="flex flex-col gap-1">
                  <div class="flex justify-between items-center font-body-sm text-body-sm">
                    <span class="text-on-surface flex items-center gap-1.5 font-medium">
                      <span class="material-symbols-outlined text-[16px] ${met ? 'text-secondary' : 'text-tertiary'}">${window.LouvorAPI.escapeHtml(t.icon || 'music_note')}</span>
                      ${window.LouvorAPI.escapeHtml(t.role_label)}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <span class="font-label-sm text-label-sm ${met ? 'text-secondary' : 'text-tertiary-fixed-dim'} font-bold">
                        ${confirmed}/${needed} confirmados
                      </span>
                      <span class="px-1.5 py-0.2 rounded-full text-[10px] font-label-sm ${
                        met
                          ? 'bg-secondary-container/25 text-secondary'
                          : 'bg-tertiary-container/25 text-tertiary'
                      }">
                        ${met ? 'Completo ✓' : `Falta(m) ${remaining}`}
                      </span>
                    </div>
                  </div>
                  <div class="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                    <div class="h-full ${met ? 'bg-secondary' : 'bg-tertiary-container'} rounded-full transition-all" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        ${
          isAdmin
            ? `
          <!-- Seção Exclusiva do Administrador: Quem Votou (Respostas Individuais) -->
          <div class="mt-3 pt-3 border-t border-outline-variant/30 flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px] text-secondary">fact_check</span>
                <span class="font-label-md text-on-surface font-bold">Quem Votou (${votes.length} resposta(s))</span>
              </div>
              <button type="button" onclick="openPollVotesModal(${featured.id})" class="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-label-sm flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">visibility</span>
                <span>Ver Detalhes / Faltantes</span>
              </button>
            </div>

            ${
              votes.length === 0
                ? `<div class="p-3 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">Nenhum integrante votou nesta enquete ainda.</div>`
                : `
              <div class="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                ${votes
                  .map((v) => {
                    const isOk = v.is_available === 1;
                    return `
                      <div class="px-3 py-2 rounded-xl bg-surface-container-low flex items-center justify-between gap-2 text-body-sm">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-2 h-2 rounded-full ${isOk ? 'bg-secondary' : 'bg-error'} shrink-0"></span>
                          <span class="font-label-md text-on-surface truncate">${window.LouvorAPI.escapeHtml(v.full_name || 'Integrante')}</span>
                          <span class="px-1.5 py-0.2 rounded bg-surface-container-highest text-primary font-label-sm text-[10px] shrink-0">${window.LouvorAPI.escapeHtml(v.role_label || v.role_key || 'Membro')}</span>
                        </div>
                        <span class="font-label-sm ${isOk ? 'text-secondary' : 'text-error'} font-bold shrink-0">
                          ${isOk ? 'Disponível' : 'Indisponível'}
                        </span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
            }
          </div>

          <button type="button" onclick="handleGenerateRoster(${featured.id}, this)" class="mt-2 w-full h-12 bg-primary text-on-primary hover:bg-primary-fixed-dim rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-all">
            <span class="material-symbols-outlined text-[20px]">auto_awesome</span>
            <span>Gerar Escala Respeitando Vagas &amp; Indisponibilidades</span>
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
      <div class="bg-surface-container-low rounded-xl p-space-md flex items-center justify-between shadow-md gap-2">
        <div class="flex flex-col min-w-0">
          <span class="font-label-sm text-primary uppercase font-bold">${p.status === 'open' ? 'Aberta' : 'Encerrada'} • ${window.LouvorAPI.escapeHtml(p.deadline_label)}</span>
          <span class="font-headline-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(p.title)}</span>
          <span class="font-body-sm text-on-surface-variant">${p.voted_count || 0} voto(s) (${p.available_count || 0} disponíveis)</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${
            isAdmin
              ? `
            <button type="button" onclick="openPollVotesModal(${p.id})" class="px-2.5 py-1 rounded-lg bg-surface-container-high text-secondary font-label-sm text-[11px]" title="Ver quem votou">
              Votos (${p.voted_count || 0})
            </button>
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

  const vocalCats = POLL_CATEGORY_CATALOG.filter((c) => c.group === 'Vocais');
  const instCats = POLL_CATEGORY_CATALOG.filter((c) => c.group === 'Instrumentistas');

  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <div class="flex flex-col">
          <h3 class="font-headline-sm text-on-surface">Abrir Nova Enquete de Disponibilidade</h3>
          <span class="font-body-sm text-on-surface-variant">Defina a data e a quantidade necessária por categoria</span>
        </div>
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

      <!-- Definição da Quantidade de Integrantes por Categoria -->
      <div class="p-3 rounded-xl bg-surface-container-low flex flex-col gap-2.5 max-h-[42vh] overflow-y-auto">
        <div class="flex items-center justify-between">
          <span class="font-label-md text-primary uppercase font-bold flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">group_add</span>
            Quantidade por Categoria / Função
          </span>
          <span class="font-body-sm text-outline text-[11px]">0 = Não necessário</span>
        </div>

        <span class="font-label-sm text-secondary uppercase tracking-wider pt-0.5">Vocais (Sopranos, Contraltos, Tenores)</span>
        <div class="grid grid-cols-2 gap-2">
          ${vocalCats
            .map(
              (c) => `
            <div class="p-2 rounded-lg bg-surface-container flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="material-symbols-outlined text-[15px] text-secondary">${c.icon}</span>
                <span class="font-label-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(c.role_label)}</span>
              </div>
              <input type="number" min="0" max="15" value="${c.default_count}" data-cat-key="${c.role_key}" data-cat-label="${window.LouvorAPI.escapeHtml(c.role_label)}" data-cat-icon="${c.icon}" class="poll-target-input w-12 h-8 px-1.5 rounded bg-surface-container-lowest text-on-surface text-center font-label-md" />
            </div>
          `
            )
            .join('')}
        </div>

        <span class="font-label-sm text-primary uppercase tracking-wider pt-1">Tecladistas &amp; Instrumentistas</span>
        <div class="grid grid-cols-2 gap-2">
          ${instCats
            .map(
              (c) => `
            <div class="p-2 rounded-lg bg-surface-container flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="material-symbols-outlined text-[15px] text-primary">${c.icon}</span>
                <span class="font-label-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(c.role_label)}</span>
              </div>
              <input type="number" min="0" max="15" value="${c.default_count}" data-cat-key="${c.role_key}" data-cat-label="${window.LouvorAPI.escapeHtml(c.role_label)}" data-cat-icon="${c.icon}" class="poll-target-input w-12 h-8 px-1.5 rounded bg-surface-container-lowest text-on-surface text-center font-label-md" />
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="flex gap-2 pt-1">
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

    const targets = [];
    modal.querySelectorAll('.poll-target-input').forEach((inp) => {
      const count = parseInt(inp.value || '0', 10);
      if (count > 0) {
        targets.push({
          role_key: inp.getAttribute('data-cat-key'),
          role_label: inp.getAttribute('data-cat-label'),
          icon: inp.getAttribute('data-cat-icon'),
          target_count: count
        });
      }
    });

    if (targets.length === 0) {
      window.LouvorAPI.showToast('Defina ao menos 1 vaga em alguma categoria para a enquete.', 'warning');
      return;
    }

    try {
      const res = await window.LouvorAPI.request('/api/polls', {
        method: 'POST',
        body: { title, event_date, deadline_label, event_time, soundcheck_time, targets }
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
