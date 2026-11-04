const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

let mySchedulesData = [];
let mySwapsData = [];
let availableCandidates = [];
let currentSwapScheduleId = null;
let currentSwapRoleName = 'Instrumento';
let activeTabId = 'proximas';

function getTodayIsoLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  if (!toast || !toastMsg) {
    window.LouvorAPI.showToast(msg);
    return;
  }
  toastMsg.textContent = msg;
  toast.classList.remove('translate-y-32', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-32', 'opacity-0');
  }, 2800);
}

function switchTab(btn, tabId) {
  activeTabId = tabId;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.remove('bg-surface-container-high', 'text-on-surface', 'shadow-sm');
    b.classList.add('text-on-surface-variant');
  });
  btn.classList.add('bg-surface-container-high', 'text-on-surface', 'shadow-sm');
  btn.classList.remove('text-on-surface-variant');

  const secHero = document.getElementById('sectionHeroSchedule');
  const secSwap = document.getElementById('sectionActiveSwap');
  const secOther = document.getElementById('sectionOtherSchedules');
  const secStats = document.getElementById('sectionMonthStats');

  if (tabId === 'proximas') {
    secHero.classList.remove('hidden');
    secSwap.classList.remove('hidden');
    secOther.classList.remove('hidden');
    secStats.classList.remove('hidden');
  } else if (tabId === 'trocas') {
    secHero.classList.add('hidden');
    secSwap.classList.remove('hidden');
    secOther.classList.add('hidden');
    secStats.classList.add('hidden');
  } else if (tabId === 'historico') {
    secHero.classList.add('hidden');
    secSwap.classList.add('hidden');
    secOther.classList.remove('hidden');
    secStats.classList.remove('hidden');
  }

  renderMySchedulesUI();
}

async function handleScheduleResponse(scheduleId, action) {
  try {
    const res = await window.LouvorAPI.request(`/api/schedules/${scheduleId}/attendance`, {
      method: 'POST',
      body: { status: action === 'confirm' ? 'confirmed' : 'declined' }
    });
    showToast(res.message);
    await loadMySchedulesData();
    if (action === 'decline') {
      const sched = mySchedulesData.find((s) => s.schedule_id === scheduleId);
      if (sched) {
        openSwapModal(scheduleId, `${sched.title} (${sched.event_date})`, sched.instrument_detail || sched.role_label);
      }
    }
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function confirmSwapAction(swapId, button) {
  try {
    const res = await window.LouvorAPI.request(`/api/swaps/${swapId}/confirm-leader`, {
      method: 'POST'
    });
    button.innerHTML = '<span class="material-symbols-outlined text-[18px]">task_alt</span> Encaminhado ao Líder!';
    button.classList.remove('bg-secondary-container');
    button.classList.add('bg-surface-container-highest', 'text-secondary');
    button.disabled = true;
    showToast(res.message);
    await loadMySchedulesData();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function cancelSwap(swapId) {
  if (!confirm('Tem certeza de que deseja cancelar esta solicitação de troca?')) return;
  try {
    const res = await window.LouvorAPI.request(`/api/swaps/${swapId}/cancel`, {
      method: 'POST'
    });
    showToast(res.message);
    await loadMySchedulesData();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openSwapModal(scheduleId, dateLabel, roleName) {
  currentSwapScheduleId = scheduleId;
  currentSwapRoleName = roleName || 'Instrumento';
  const desc = document.getElementById('swapDialogTargetDesc');
  if (desc) {
    desc.innerHTML = `Você está solicitando troca para: <strong class="text-on-surface">${window.LouvorAPI.escapeHtml(dateLabel)}</strong> na função <strong class="text-on-surface">${window.LouvorAPI.escapeHtml(currentSwapRoleName)}</strong>.`;
  }

  const candContainer = document.getElementById('swapCandidatesContainer');
  if (candContainer) {
    if (availableCandidates.length === 0) {
      candContainer.innerHTML = `
        <div class="p-2.5 rounded-xl bg-surface-container-lowest text-on-surface-variant font-body-sm">
          Nenhum outro membro cadastrado ainda. O pedido ficará em aberto para a liderança.
        </div>
      `;
    } else {
      candContainer.innerHTML = availableCandidates
        .map(
          (c, idx) => `
          <label class="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-high cursor-pointer hover:bg-surface-bright">
            <div class="flex items-center gap-2.5">
              <span class="w-2.5 h-2.5 rounded-full bg-secondary"></span>
              <span class="font-label-md text-label-md text-on-surface">${window.LouvorAPI.escapeHtml(c.full_name)}</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">(${window.LouvorAPI.escapeHtml(c.title || 'Membro')})</span>
            </div>
            <input ${idx === 0 ? 'checked' : ''} class="w-4 h-4 rounded text-primary focus:ring-0 swap-candidate-check" data-user-id="${c.id}" name="swapCandidateRadio" type="radio"/>
          </label>
        `
        )
        .join('');
    }
  }

  const modal = document.getElementById('swap-dialog');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeSwapModal() {
  const modal = document.getElementById('swap-dialog');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function submitSwapRequest() {
  if (!currentSwapScheduleId) {
    window.LouvorAPI.showToast('Selecione uma escala válida.', 'warning');
    return;
  }
  const reasonInput = document.getElementById('swapReasonTextarea');
  const reason = (reasonInput && reasonInput.value.trim()) || '';
  if (reason.length < 3) {
    window.LouvorAPI.showToast('Informe o motivo da solicitação de troca.', 'warning');
    return;
  }
  const checkedCandidate = document.querySelector('.swap-candidate-check:checked');
  const substitute_id = checkedCandidate ? parseInt(checkedCandidate.getAttribute('data-user-id'), 10) : null;

  try {
    const res = await window.LouvorAPI.request('/api/swaps', {
      method: 'POST',
      body: {
        schedule_id: currentSwapScheduleId,
        substitute_id,
        role_label: currentSwapRoleName,
        instrument_detail: 'Equipe de Louvor',
        reason
      }
    });
    closeSwapModal();
    if (reasonInput) reasonInput.value = '';
    showToast(res.message);
    await loadMySchedulesData();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function exportCalendarIcs() {
  try {
    const token = window.LouvorAPI.getToken();
    const res = await fetch('/api/schedules/ics', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('Falha ao gerar arquivo .ics');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minhas-escalas-louvorapp.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Arquivo .ics exportado para seu Calendário!');
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function toggleSyncFeedback(input) {
  try {
    await window.LouvorAPI.request('/api/users/profile', {
      method: 'PUT',
      body: { calendar_sync: input.checked }
    });
    if (input.checked) {
      await exportCalendarIcs();
    } else {
      showToast('Sincronização com o Calendário desativada.');
    }
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openChordsPreviewModal(scheduleId) {
  const sched = mySchedulesData.find((s) => s.schedule_id === scheduleId) || mySchedulesData[0];
  const songs = (sched && sched.songs) || [];
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-headline-sm text-on-surface">Cifras &amp; Áudios do Culto</h3>
        <button type="button" id="closeChordsBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto">
        ${
          songs.length === 0
            ? '<div class="p-4 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">Nenhuma música cadastrada nesta escala ainda.</div>'
            : songs
                .map(
                  (s) => `
          <div class="p-3 rounded-xl bg-surface-container-low flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="font-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(s.title)}</span>
              <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm font-bold">Tom: ${window.LouvorAPI.escapeHtml(s.musical_key)}</span>
            </div>
            <pre class="mt-1 p-2 rounded-lg bg-surface-container-lowest text-primary font-mono text-[11px] whitespace-pre-wrap">${window.LouvorAPI.escapeHtml(s.chords_text || 'Acordes no tom oficial.')}</pre>
          </div>
        `
                )
                .join('')
        }
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#closeChordsBtn').onclick = () => modal.remove();
}

function openTeamRosterModal(scheduleId) {
  const sched = mySchedulesData.find((s) => s.schedule_id === scheduleId) || mySchedulesData[0];
  const team = (sched && sched.team_members) || [];
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-headline-sm text-on-surface">Equipe Escalada (${team.length})</h3>
        <button type="button" id="closeTeamModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2">
        ${team
          .map(
            (m) => `
          <div class="p-2.5 rounded-xl bg-surface-container-low flex items-center justify-between">
            <div class="flex flex-col">
              <span class="font-label-md text-on-surface">${window.LouvorAPI.escapeHtml(m.user_full_name || m.role_label)}</span>
              <span class="font-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(m.instrument_detail)}</span>
            </div>
            <span class="material-symbols-outlined ${
              m.confirmation_status === 'confirmed' ? 'text-secondary' : 'text-tertiary'
            }">${m.confirmation_status === 'confirmed' ? 'check_circle' : 'schedule'}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#closeTeamModalBtn').onclick = () => modal.remove();
}

function renderMySchedulesUI() {
  const heroContainer = document.getElementById('sectionHeroSchedule');
  const swapContainer = document.getElementById('sectionActiveSwap');
  const otherContainer = document.getElementById('sectionOtherSchedules');
  const todayIso = getTodayIsoLocal();

  const upcomingSchedules = mySchedulesData.filter((s) => (s.event_date || '') >= todayIso);
  const pastSchedules = mySchedulesData.filter((s) => (s.event_date || '') < todayIso);
  const resolvedSwaps = mySwapsData.filter((s) => s.status !== 'pending');

  document.getElementById('tabCountProximas').textContent = String(upcomingSchedules.length);
  const pendingSwaps = mySwapsData.filter((s) => s.status === 'pending');
  document.getElementById('tabCountTrocas').textContent = String(pendingSwaps.length);

  if (activeTabId === 'historico') {
    if (pastSchedules.length === 0 && resolvedSwaps.length === 0) {
      otherContainer.innerHTML = `
        <div class="p-6 rounded-2xl bg-surface-container-low text-center flex flex-col items-center gap-2 shadow-sm">
          <span class="material-symbols-outlined text-[28px] text-outline">history</span>
          <h3 class="font-headline-sm text-on-surface">Nenhum histórico registrado</h3>
          <p class="font-body-sm text-on-surface-variant">Suas escalas passadas e trocas concluídas aparecerão nesta aba.</p>
        </div>
      `;
    } else {
      otherContainer.innerHTML = `
        <div class="flex items-center justify-between">
          <h3 class="font-headline-sm text-headline-sm text-on-surface">Histórico de Escalas &amp; Trocas</h3>
          <span class="font-label-sm text-label-sm text-on-surface-variant">${pastSchedules.length} escala(s) • ${resolvedSwaps.length} troca(s)</span>
        </div>
        ${pastSchedules
          .map((item) => {
            const dayNum = (item.event_date || '').split('-')[2] || '--';
            const confirmed = item.confirmation_status === 'confirmed';
            return `
              <div class="p-3.5 rounded-2xl bg-surface-container-low flex items-center justify-between gap-2.5 shadow-sm">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-surface-container-highest text-on-surface-variant flex flex-col items-center justify-center shrink-0">
                    <span class="font-headline-sm text-headline-sm text-on-surface leading-none">${dayNum}</span>
                  </div>
                  <div class="flex flex-col min-w-0">
                    <h4 class="font-label-lg text-label-lg text-on-surface truncate">${window.LouvorAPI.escapeHtml(item.title)}</h4>
                    <span class="font-body-sm text-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(item.event_date)} • ${window.LouvorAPI.escapeHtml(item.instrument_detail || item.role_label)}</span>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded-full ${
                  confirmed ? 'bg-secondary-container/20 text-secondary' : 'bg-surface-container-highest text-on-surface-variant'
                } font-label-sm text-label-sm shrink-0">
                  ${confirmed ? 'Cumprida' : 'Não confirmada'}
                </span>
              </div>
            `;
          })
          .join('')}
        ${resolvedSwaps
          .map(
            (sw) => `
          <div class="p-3.5 rounded-2xl bg-surface-container-low flex items-center justify-between gap-2 shadow-sm">
            <div class="flex flex-col">
              <span class="font-label-sm text-primary uppercase font-bold">Troca • ${window.LouvorAPI.escapeHtml(sw.status)}</span>
              <span class="font-label-lg text-on-surface">${window.LouvorAPI.escapeHtml(sw.schedule ? sw.schedule.title : 'Escala')}</span>
              <span class="font-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(sw.admin_note || sw.reason)}</span>
            </div>
          </div>
        `
          )
          .join('')}
      `;
    }
    return;
  }

  // 1. Renderiza Card Herói (Próxima Escala) ou Estado Vazio Limpo
  if (upcomingSchedules.length === 0) {
    heroContainer.innerHTML = `
      <section class="flex flex-col items-center justify-center text-center rounded-2xl bg-surface-container-low shadow-md p-6 space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center">
          <span class="material-symbols-outlined text-[26px]">event_busy</span>
        </div>
        <div class="flex flex-col gap-1">
          <h2 class="font-headline-sm text-headline-sm text-on-surface">Você ainda não possui escalas agendadas</h2>
          <p class="font-body-sm text-body-sm text-on-surface-variant max-w-xs">
            Assim que você for escalado em um culto ou ensaio, seus compromissos, horários de passagem de som e repertórios aparecerão aqui.
          </p>
        </div>
        <a href="/pages/calendario-escalas/index.html" class="px-4 py-2.5 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[18px]">calendar_month</span>
          <span>Ver Calendário do Mês</span>
        </a>
      </section>
    `;
    otherContainer.innerHTML = '';
  } else {
    const hero = upcomingSchedules[0];
    const songs = hero.songs || [];
    const isConfirmed = hero.confirmation_status === 'confirmed';

    heroContainer.innerHTML = `
      <section class="flex flex-col relative rounded-2xl bg-surface-container-low shadow-xl p-4 overflow-hidden">
        <div class="absolute -top-12 -right-12 w-36 h-36 bg-secondary/10 rounded-full blur-2xl pointer-events-none"></div>
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-primary to-primary-container"></div>
        <div class="flex items-start justify-between gap-2 mb-3">
          <div class="flex flex-col">
            <span class="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-bold flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">stars</span> Próximo Compromisso
            </span>
            <h2 class="font-headline-sm text-headline-sm text-on-surface mt-0.5">${window.LouvorAPI.escapeHtml(hero.subtitle || hero.event_date)}</h2>
            <span class="font-body-sm text-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(hero.title)} • ${window.LouvorAPI.escapeHtml(hero.event_time)}</span>
          </div>
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${
            isConfirmed ? 'bg-secondary-container/25 text-secondary' : 'bg-tertiary-container/30 text-tertiary'
          } font-label-sm text-label-sm">
            <span class="material-symbols-outlined text-[14px]">${isConfirmed ? 'check_circle' : 'schedule'}</span>
            ${isConfirmed ? 'Confirmado' : 'Pendente'}
          </span>
        </div>

        <div class="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container mb-3.5">
          <div class="w-8 h-8 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[20px]">${window.LouvorAPI.escapeHtml(hero.icon || 'piano')}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-label-md text-label-md text-on-surface truncate">${window.LouvorAPI.escapeHtml(hero.instrument_detail || hero.role_label)}</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant truncate">${window.LouvorAPI.escapeHtml(hero.team_name || 'Equipe de Louvor')}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-3.5">
          <div class="flex items-center gap-2 p-2 rounded-xl bg-surface-container-lowest">
            <span class="material-symbols-outlined text-primary text-[18px]">equalizer</span>
            <div class="flex flex-col">
              <span class="font-label-sm text-label-sm text-on-surface-variant">Passagem de Som</span>
              <span class="font-headline-sm text-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(hero.soundcheck_time || '17:30')}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 p-2 rounded-xl bg-surface-container-lowest">
            <span class="material-symbols-outlined text-tertiary text-[18px]">volunteer_activism</span>
            <div class="flex flex-col">
              <span class="font-label-sm text-label-sm text-on-surface-variant">Oração da Equipe</span>
              <span class="font-headline-sm text-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(hero.prayer_time || '18:30')}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-col p-3 rounded-xl bg-surface-container-high/60 mb-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="material-symbols-outlined text-primary text-[16px]">library_music</span>
              <span class="font-label-md text-label-md text-on-surface">Repertório Previsto (${songs.length})</span>
            </div>
            <button class="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-0.5" onclick="openChordsPreviewModal(${hero.schedule_id})" type="button">
              Cifras &amp; Áudios
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
            </button>
          </div>
          <div class="grid grid-cols-1 gap-1.5">
            ${
              songs.length === 0
                ? '<span class="font-body-sm text-on-surface-variant">Repertório ainda não definido para esta data.</span>'
                : songs
                    .map(
                      (s, idx) => `
              <div class="flex items-center justify-between py-1 px-2 rounded-lg bg-surface-container-lowest/80 text-on-surface font-body-sm text-body-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-on-surface-variant text-[11px] font-bold">${String(idx + 1).padStart(2, '0')}</span>
                  <span class="truncate">${window.LouvorAPI.escapeHtml(s.title)}</span>
                </div>
                <span class="px-1.5 py-0.5 rounded bg-surface-container-highest font-label-sm text-label-sm text-primary tracking-wide font-mono">${window.LouvorAPI.escapeHtml(s.musical_key)}</span>
              </div>
            `
                    )
                    .join('')
            }
          </div>
        </div>

        ${
          !isConfirmed
            ? `
          <div class="flex items-center gap-2 mb-2">
            <button type="button" onclick="handleScheduleResponse(${hero.schedule_id}, 'confirm')" class="flex-1 h-11 rounded-xl bg-secondary-container text-on-secondary-container font-label-md font-semibold flex items-center justify-center gap-1.5">
              <span class="material-symbols-outlined text-[18px]">done</span> Confirmar Presença
            </button>
            <button type="button" onclick="handleScheduleResponse(${hero.schedule_id}, 'decline')" class="h-11 px-3 rounded-xl bg-surface-container-highest text-on-surface-variant hover:text-error font-label-md flex items-center justify-center gap-1">
              <span class="material-symbols-outlined text-[18px]">close</span> Não poderei
            </button>
          </div>
        `
            : ''
        }

        <div class="flex items-center gap-2">
          <button class="flex-1 h-12 px-3 rounded-xl bg-surface-container-highest hover:bg-surface-bright text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]" onclick="openSwapModal(${hero.schedule_id}, '${window.LouvorAPI.escapeHtml(hero.title)} (${window.LouvorAPI.escapeHtml(hero.event_date)})', '${window.LouvorAPI.escapeHtml(hero.instrument_detail || hero.role_label)}')" type="button">
            <span class="material-symbols-outlined text-[18px] text-tertiary">swap_horiz</span>
            <span class="truncate">Pedir Troca</span>
          </button>
          <button class="flex-1 h-12 px-3 rounded-xl bg-primary-container text-on-primary-fixed font-label-md text-label-md flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]" onclick="openTeamRosterModal(${hero.schedule_id})" type="button">
            <span class="material-symbols-outlined text-[18px]">group</span>
            <span class="truncate">Ver Equipe</span>
          </button>
        </div>
      </section>
    `;

    // Outras escalas agendadas (a partir do 2º item)
    const others = upcomingSchedules.slice(1);
    if (others.length === 0) {
      otherContainer.innerHTML = '';
    } else {
      otherContainer.innerHTML = `
        <div class="flex items-center justify-between">
          <h3 class="font-headline-sm text-headline-sm text-on-surface">Outras Escalas Agendadas</h3>
          <span class="font-label-sm text-label-sm text-on-surface-variant">${others.length} agendada(s)</span>
        </div>
        ${others
          .map((item) => {
            const dayNum = (item.event_date || '').split('-')[2] || '--';
            const confirmed = item.confirmation_status === 'confirmed';
            return `
              <div class="p-3.5 rounded-2xl bg-surface-container-low flex flex-col gap-2.5 shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-surface-container-highest text-primary flex flex-col items-center justify-center shrink-0">
                      <span class="font-headline-sm text-headline-sm text-on-surface leading-none">${dayNum}</span>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <h4 class="font-label-lg text-label-lg text-on-surface truncate">${window.LouvorAPI.escapeHtml(item.title)}</h4>
                      <span class="font-body-sm text-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(item.event_time)} • ${window.LouvorAPI.escapeHtml(item.location)}</span>
                    </div>
                  </div>
                  <span class="px-2 py-0.5 rounded-full ${
                    confirmed ? 'bg-secondary-container/20 text-secondary' : 'bg-tertiary-container/30 text-tertiary'
                  } font-label-sm text-label-sm shrink-0">
                    ${confirmed ? 'Confirmada' : 'Aguardando você'}
                  </span>
                </div>
                ${
                  !confirmed
                    ? `
                  <div class="flex items-center gap-2 pt-1">
                    <button type="button" onclick="handleScheduleResponse(${item.schedule_id}, 'confirm')" class="flex-1 h-10 rounded-xl bg-secondary-container text-on-secondary-container font-label-md font-semibold flex items-center justify-center gap-1.5">
                      <span class="material-symbols-outlined text-[18px]">done</span> Confirmar Presença
                    </button>
                    <button type="button" onclick="handleScheduleResponse(${item.schedule_id}, 'decline')" class="h-10 px-3 rounded-xl bg-surface-container-highest text-on-surface-variant font-label-md flex items-center justify-center gap-1">
                      <span class="material-symbols-outlined text-[18px]">close</span> Não poderei
                    </button>
                  </div>
                `
                    : ''
                }
              </div>
            `;
          })
          .join('')}
      `;
    }
  }

  // 2. Renderiza Trocas Pendentes do Usuário
  if (pendingSwaps.length === 0) {
    swapContainer.innerHTML =
      activeTabId === 'trocas'
        ? `<div class="p-4 rounded-2xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">Você não possui nenhuma solicitação de troca pendente no momento.</div>`
        : '';
  } else {
    swapContainer.innerHTML = pendingSwaps
      .map(
        (sw) => `
      <section class="flex flex-col relative rounded-2xl bg-surface-container-low p-4 shadow-md overflow-hidden">
        <div class="flex items-center justify-between mb-2">
          <span class="font-label-sm text-label-sm text-tertiary tracking-wider uppercase font-bold flex items-center gap-1">
            <span class="material-symbols-outlined text-[16px]">change_circle</span>
            Troca em Andamento
          </span>
          <span class="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary">
            ${sw.substitute ? '1 Voluntário' : 'Em aberto'}
          </span>
        </div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 class="font-headline-sm text-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(sw.schedule ? sw.schedule.title : 'Escala')}</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">${window.LouvorAPI.escapeHtml(sw.schedule ? sw.schedule.event_date + ' • ' + sw.schedule.event_time : '')}</p>
          </div>
          <span class="px-2 py-1 rounded-lg bg-surface-container font-label-sm text-label-sm text-on-surface-variant">
            ${window.LouvorAPI.escapeHtml(sw.role_label)}
          </span>
        </div>
        <div class="p-2.5 rounded-xl bg-surface-container mb-3 text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-outline shrink-0">info</span>
          <span class="italic truncate">"${window.LouvorAPI.escapeHtml(sw.reason)}"</span>
        </div>
        ${
          sw.substitute
            ? `
          <div class="p-3 rounded-xl bg-surface-container-high flex flex-col gap-2.5 mb-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-full bg-surface-container-highest flex items-center justify-center text-secondary">
                  <span class="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div class="flex flex-col">
                  <span class="font-label-md text-label-md text-on-surface">${window.LouvorAPI.escapeHtml(sw.substitute.full_name)}</span>
                  <span class="font-body-sm text-body-sm text-secondary font-medium">Aceitou substituir</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <button type="button" ${sw.member_confirmed_leader ? 'disabled' : ''} onclick="confirmSwapAction(${sw.id}, this)" class="flex-1 h-10 px-3 rounded-xl ${
                sw.member_confirmed_leader
                  ? 'bg-surface-container-highest text-secondary'
                  : 'bg-secondary-container text-on-secondary-container'
              } font-label-md font-semibold flex items-center justify-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">verified</span>
                ${sw.member_confirmed_leader ? 'Encaminhado ao Líder!' : 'Confirmar com Líder'}
              </button>
            </div>
          </div>
        `
            : ''
        }
        <div class="flex justify-end">
          <button type="button" onclick="cancelSwap(${sw.id})" class="font-label-sm text-label-sm text-error hover:underline flex items-center gap-1 py-1">
            <span class="material-symbols-outlined text-[14px]">close</span>
            Cancelar Pedido de Troca
          </button>
        </div>
      </section>
    `
      )
      .join('');
  }
}

async function loadMySchedulesData() {
  const now = new Date();
  const monthName = MONTH_NAMES_PT[now.getMonth()];
  document.getElementById('monthActivityTitle').textContent = `Minha Atividade em ${monthName}`;

  try {
    const res = await window.LouvorAPI.request('/api/schedules/my');
    mySchedulesData = res.schedules || [];
    mySwapsData = res.swaps || [];
    availableCandidates = res.candidates || [];

    if (res.stats) {
      document.getElementById('statSchedulesCount').textContent = String(res.stats.monthSchedules || 0);
      document.getElementById('statAttendancePercent').textContent = res.stats.attendanceRate || '0%';
      document.getElementById('statSwapsCount').textContent = String(res.stats.swapsDone || 0);
      document.getElementById('monthActivitySummary').textContent = `${res.stats.confirmedSchedules || 0} de ${res.stats.monthSchedules || 0} cumpridas`;
      document.getElementById('calendar-sync-toggle').checked = Boolean(res.stats.calendarSync);
    }

    renderMySchedulesUI();
  } catch (err) {
    console.error(err);
  }
}

(async function () {
  const user = await window.LouvorNav.initPage({ activeTab: 'minhas-escalas' });
  if (!user) return;
  await loadMySchedulesData();
})();
