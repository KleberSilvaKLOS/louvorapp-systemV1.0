const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const MONTH_SHORT_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const machineNow = new Date();
let currentUser = null;
let currentYear = machineNow.getFullYear();
let currentMonth = machineNow.getMonth();
let selectedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(machineNow.getDate()).padStart(2, '0')}`;
let allSchedules = [];
let allSongs = [];
let allUsers = [];
let selectedSchedule = null;
const statusCycleMap = { confirmed: 0, rehearsal: 0, cancelled: 0 };

function formatMonthParam(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

async function loadCalendarData() {
  const monthParam = formatMonthParam(currentYear, currentMonth);
  const [schedRes, songsRes] = await Promise.all([
    window.LouvorAPI.request(`/api/schedules?month=${monthParam}`),
    window.LouvorAPI.request('/api/repertoire')
  ]);
  allSchedules = schedRes.schedules || [];
  allSongs = songsRes.songs || [];

  if (window.LouvorAPI.hasPermission(currentUser, 'users', 'view') || currentUser.role === 'ADMIN') {
    try {
      const uRes = await window.LouvorAPI.request('/api/users');
      allUsers = uRes.users || [];
    } catch (e) {}
  }

  document.getElementById('currentMonthLabel').textContent = MONTH_NAMES_PT[currentMonth];
  document.getElementById('currentYearLabel').textContent = String(currentYear);

  renderCalendarGrid();
  selectDate(selectedDateStr);
}

function renderCalendarGrid() {
  const grid = document.getElementById('calendarDaysGrid');
  if (!grid) return;

  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  let html = '';
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    html += `<div class="h-10 flex items-center justify-center text-outline-variant font-label-md text-label-md opacity-30">${d}</div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const eventsOnDay = allSchedules.filter((s) => s.event_date === dateStr);
    const ev = eventsOnDay[0] || null;
    const isSelected = dateStr === selectedDateStr;

    let dotHtml = '';
    if (ev) {
      if (ev.status === 'confirmed') {
        dotHtml = '<span class="w-1.5 h-1.5 rounded-full bg-secondary shadow-[0_0_5px_#4edea3] mt-0.5"></span>';
      } else if (ev.status === 'rehearsal') {
        dotHtml = '<span class="w-1.5 h-1.5 rounded-full bg-tertiary shadow-[0_0_5px_#ffb95f] mt-0.5"></span>';
      } else if (ev.status === 'cancelled') {
        dotHtml = '<span class="w-1.5 h-1.5 rounded-full bg-error shadow-[0_0_5px_#ffb4ab] mt-0.5"></span>';
      }
    }

    const btnClasses = isSelected
      ? 'h-10 rounded-lg flex flex-col items-center justify-center bg-primary-container text-on-primary-container shadow-[0_0_14px_rgba(77,142,255,0.45)] scale-105 active:scale-100 transition-all relative'
      : ev
        ? 'h-10 rounded-lg flex flex-col items-center justify-center bg-surface-container/80 text-on-surface hover:bg-surface-container-high active:scale-95 transition-all relative'
        : 'h-10 rounded-lg flex flex-col items-center justify-center bg-surface-container/40 text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all relative';

    html += `
      <button type="button" data-date="${dateStr}" onclick="selectDate('${dateStr}')" class="${btnClasses}">
        <span class="font-label-md text-label-md ${isSelected ? 'font-bold' : ev ? 'font-semibold' : ''}">${day}</span>
        ${dotHtml}
      </button>
    `;
  }

  grid.innerHTML = html;
}

function selectDate(dateStr, specificScheduleId = null) {
  selectedDateStr = dateStr;
  renderCalendarGrid();

  const matching = specificScheduleId
    ? allSchedules.find((s) => s.id === specificScheduleId)
    : allSchedules.find((s) => s.event_date === dateStr);
  selectedSchedule = matching || null;
  renderSelectedScheduleCard(dateStr, selectedSchedule);
}

function renderSelectedScheduleCard(dateStr, schedule) {
  const parts = dateStr.split('-');
  const dayNum = parseInt(parts[2] || '1', 10);
  const monthIdx = parseInt(parts[1] || '1', 10) - 1;
  const shortDate = `${dayNum} ${MONTH_SHORT_PT[monthIdx] || ''}`;

  document.getElementById('fastSetlistLabel').textContent = `Setlist Rápido • ${shortDate}`;
  const adminActionsEl = document.getElementById('adminScheduleActions');

  if (!schedule) {
    if (adminActionsEl) {
      adminActionsEl.classList.add('hidden');
      adminActionsEl.classList.remove('flex');
    }
    document.getElementById('eventSubtitle').textContent = `Data Selecionada • ${shortDate}`;
    document.getElementById('eventTitle').textContent = 'Nenhum culto ou ensaio agendado';
    document.getElementById('eventSoundcheckLocation').innerHTML =
      currentUser && currentUser.role === 'ADMIN'
        ? 'Clique em <strong>+ Novo Evento / Escala</strong> abaixo para cadastrar.'
        : 'Não há eventos registrados nesta data.';
    document.getElementById('eventStatusBadge').className =
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm uppercase font-bold shrink-0';
    document.getElementById('eventStatusBadge').innerHTML = 'Livre';
    document.getElementById('rosterConfirmedCount').textContent = '0 Escalados';
    document.getElementById('rosterRowsContainer').innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">
        Nenhuma equipe escalada para ${shortDate}.
      </div>
    `;
    document.getElementById('btnRepertoireCountLabel').textContent = 'Repertório (0)';
    document.getElementById('fastSetlistStrip').innerHTML = `
      <span class="font-body-sm text-on-surface-variant py-1">Sem músicas vinculadas nesta data.</span>
    `;
    return;
  }

  if (adminActionsEl && currentUser && currentUser.role === 'ADMIN') {
    adminActionsEl.classList.remove('hidden');
    adminActionsEl.classList.add('flex');
  }

  document.getElementById('eventSubtitle').textContent = schedule.subtitle || `Escala • ${shortDate}`;
  document.getElementById('eventTitle').textContent = schedule.title;
  document.getElementById('eventSoundcheckLocation').innerHTML = `Passagem de som: <strong class="text-on-surface font-medium">${window.LouvorAPI.escapeHtml(schedule.soundcheck_time)}</strong> • ${window.LouvorAPI.escapeHtml(schedule.location)}`;

  const badgeEl = document.getElementById('eventStatusBadge');
  if (schedule.status === 'confirmed') {
    badgeEl.className =
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container/20 text-secondary font-label-sm text-label-sm uppercase font-bold shrink-0 shadow-[0_0_12px_rgba(78,222,163,0.25)]';
    badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span> Confirmado';
  } else if (schedule.status === 'rehearsal') {
    badgeEl.className =
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-container/25 text-tertiary font-label-sm text-label-sm uppercase font-bold shrink-0';
    badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-tertiary"></span> Ensaio';
  } else {
    badgeEl.className =
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-error-container/30 text-error font-label-sm text-label-sm uppercase font-bold shrink-0';
    badgeEl.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-error"></span> Cancelado';
  }

  const members = schedule.members || [];
  const confirmedTotal = members.filter((m) => m.confirmation_status === 'confirmed').length;
  document.getElementById('rosterConfirmedCount').textContent = `${confirmedTotal} de ${members.length} Confirmados`;

  const canEditSchedule = window.LouvorAPI.hasPermission(currentUser, 'schedules', 'edit');

  if (members.length === 0) {
    document.getElementById('rosterRowsContainer').innerHTML = `
      <div class="p-3 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">
        Nenhum integrante escalado ainda.
      </div>
    `;
  } else {
    document.getElementById('rosterRowsContainer').innerHTML = members
      .map((m) => {
        const colorMap = {
          primary: 'bg-primary-container/20 text-primary',
          tertiary: 'bg-tertiary/20 text-tertiary',
          secondary: 'bg-secondary/20 text-secondary',
          error: 'bg-error-container/30 text-error'
        };
        const iconBg = colorMap[m.color_variant] || colorMap.primary;
        const labelHtml = m.role_label.includes('(Líder)')
          ? window.LouvorAPI.escapeHtml(m.role_label).replace(
              '(Líder)',
              '<span class="text-primary text-[11px] font-semibold">(Líder)</span>'
            )
          : window.LouvorAPI.escapeHtml(m.role_label);

        return `
          <div class="flex items-center justify-between p-2 rounded-lg bg-surface-container-high/60 hover:bg-surface-container-high transition-colors">
            <div class="flex items-center gap-space-sm min-w-0">
              <div class="w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[16px]">${window.LouvorAPI.escapeHtml(m.icon || 'music_note')}</span>
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-label-md text-label-md text-on-surface truncate">${labelHtml}</span>
                <span class="font-body-sm text-body-sm text-on-surface-variant text-[11px]">${window.LouvorAPI.escapeHtml(m.instrument_detail)}</span>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span class="material-symbols-outlined ${
                m.confirmation_status === 'confirmed' ? 'text-secondary' : 'text-tertiary'
              } text-[20px]" title="${m.confirmation_status === 'confirmed' ? 'Confirmado' : 'Pendente / Troca'}">${
          m.confirmation_status === 'confirmed' ? 'check_circle' : 'schedule'
        }</span>
              ${
                canEditSchedule
                  ? `<button type="button" onclick="removeMemberFromCurrentSchedule(${m.id})" class="text-outline hover:text-error ml-1" title="Remover da escala"><span class="material-symbols-outlined text-[16px]">close</span></button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  }

  const songs = schedule.songs || [];
  document.getElementById('btnRepertoireCountLabel').textContent = `Repertório (${songs.length})`;

  const stripEl = document.getElementById('fastSetlistStrip');
  if (songs.length === 0) {
    stripEl.innerHTML = '<span class="font-body-sm text-on-surface-variant py-1">Nenhuma música definida.</span>';
  } else {
    stripEl.innerHTML = songs
      .map(
        (s) => `
        <button type="button" onclick="openRepertoireModal(${s.song_id})" class="flex items-center gap-2 bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-lg shrink-0 transition-colors">
          <span class="px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm text-[10px] font-bold">${window.LouvorAPI.escapeHtml(s.musical_key)}</span>
          <span class="font-label-md text-label-md text-on-surface font-medium">${window.LouvorAPI.escapeHtml(s.title)}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant text-[11px]">${s.bpm} BPM</span>
        </button>
      `
      )
      .join('');
  }
}

// Cicla por todos os eventos do mês que possuem o status clicado
function filterCalendarByStatus(status) {
  const matches = allSchedules.filter((s) => s.status === status);
  if (matches.length === 0) {
    window.LouvorAPI.showToast('Nenhum evento com este status no mês atual.', 'warning');
    return;
  }
  const idx = (statusCycleMap[status] || 0) % matches.length;
  statusCycleMap[status] = idx + 1;
  const chosen = matches[idx];
  selectDate(chosen.event_date, chosen.id);
  window.LouvorAPI.showToast(`Exibindo (${idx + 1}/${matches.length}): ${chosen.title}`);
}

async function removeMemberFromCurrentSchedule(memberRowId) {
  if (!selectedSchedule) return;
  if (!confirm('Deseja remover este integrante da escala atual?')) return;
  try {
    const res = await window.LouvorAPI.request(
      `/api/schedules/${selectedSchedule.id}/members/${memberRowId}`,
      { method: 'DELETE' }
    );
    window.LouvorAPI.showToast(res.message);
    await loadCalendarData();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function getUserUnavailabilityForDate(userObj, eventDate) {
  const list = (userObj && userObj.unavailabilities) || [];
  return list.find((uu) => eventDate >= uu.start_date && eventDate <= uu.end_date) || null;
}

function openAddMemberModal() {
  if (!selectedSchedule) {
    window.LouvorAPI.showToast('Selecione ou crie primeiro um evento no calendário.', 'warning');
    return;
  }

  const eventDate = selectedSchedule.event_date;
  const unavailableUsers = [];
  const optionsHtml = allUsers
    .map((u) => {
      const un = getUserUnavailabilityForDate(u, eventDate);
      if (un) {
        unavailableUsers.push({ user: u, un });
        return `<option value="${u.id}" disabled>[INDISPONÍVEL: ${window.LouvorAPI.escapeHtml(un.reason)}] ${window.LouvorAPI.escapeHtml(u.full_name)}</option>`;
      }
      const skillsText =
        u.skills && u.skills.length > 0 ? u.skills.map((s) => s.skill_name).join(', ') : u.title || 'Membro';
      return `<option value="${u.id}">${window.LouvorAPI.escapeHtml(u.full_name)} (${window.LouvorAPI.escapeHtml(skillsText)})</option>`;
    })
    .join('');

  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-headline-sm text-on-surface">Escalar Membro • ${window.LouvorAPI.escapeHtml(selectedSchedule.title)}</h3>
        <button type="button" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant" id="closeAddMemberBtn">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      ${
        unavailableUsers.length > 0
          ? `
        <div class="p-2.5 rounded-xl bg-tertiary-container/20 border border-tertiary/30 text-body-sm text-on-surface flex items-start gap-2">
          <span class="material-symbols-outlined text-tertiary text-[18px] shrink-0">event_busy</span>
          <div>
            <strong class="text-tertiary block font-label-sm uppercase">Indisponíveis em ${window.LouvorAPI.escapeHtml(eventDate)}:</strong>
            <span>${unavailableUsers.map((item) => `${window.LouvorAPI.escapeHtml(item.user.full_name)} (${window.LouvorAPI.escapeHtml(item.un.reason)})`).join(' • ')}</span>
          </div>
        </div>
      `
          : ''
      }
      <div class="flex flex-col gap-3">
        <label class="font-label-sm text-on-surface-variant uppercase">Membro da Equipe</label>
        <select id="selectMemberUserId" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface">
          ${optionsHtml}
        </select>
        <label class="font-label-sm text-on-surface-variant uppercase">Função / Categoria na Escala</label>
        <input id="inputMemberDetail" type="text" placeholder="Ex: Vocal • Soprano / Teclado / Guitarra" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
        <label class="font-label-sm text-on-surface-variant uppercase">Ícone da Função</label>
        <select id="selectMemberIcon" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface">
          <option value="mic">Vocal • Soprano / Contralto / Tenor (mic)</option>
          <option value="piano">Tecladista (piano)</option>
          <option value="queue_music">Violão (queue_music)</option>
          <option value="electric_bolt">Guitarra (electric_bolt)</option>
          <option value="graphic_eq">Contrabaixo (graphic_eq)</option>
          <option value="album">Bateria (album)</option>
        </select>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelAddMemberBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="confirmAddMemberBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Confirmar Escala</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeAddMemberBtn').onclick = close;
  modal.querySelector('#cancelAddMemberBtn').onclick = close;
  modal.querySelector('#confirmAddMemberBtn').onclick = async () => {
    const user_id = parseInt(modal.querySelector('#selectMemberUserId').value, 10);
    if (!user_id) {
      window.LouvorAPI.showToast('Selecione um integrante disponível.', 'warning');
      return;
    }
    const instrument_detail = modal.querySelector('#inputMemberDetail').value.trim();
    const icon = modal.querySelector('#selectMemberIcon').value;
    const chosenUser = allUsers.find((u) => u.id === user_id);
    try {
      await window.LouvorAPI.request(`/api/schedules/${selectedSchedule.id}/members`, {
        method: 'POST',
        body: {
          user_id,
          role_label: chosenUser ? chosenUser.full_name : 'Músico Escalado',
          instrument_detail:
            instrument_detail ||
            (chosenUser && chosenUser.skills && chosenUser.skills[0]
              ? chosenUser.skills[0].skill_name
              : chosenUser
                ? chosenUser.title
                : 'Instrumento'),
          icon
        }
      });
      window.LouvorAPI.showToast('Membro escalado com sucesso!');
      close();
      await loadCalendarData();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function openRepertoireModal(highlightSongId = null, editSongObj = null) {
  const songs =
    selectedSchedule && selectedSchedule.songs && selectedSchedule.songs.length > 0 && !editSongObj
      ? selectedSchedule.songs
      : allSongs;
  const canCreateSong = window.LouvorAPI.hasPermission(currentUser, 'repertoire', 'create');
  const canEditSong = window.LouvorAPI.hasPermission(currentUser, 'repertoire', 'edit');
  const canDeleteSong = window.LouvorAPI.hasPermission(currentUser, 'repertoire', 'delete');

  const existingModal = document.getElementById('repertoireCatalogModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'repertoireCatalogModal';
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-primary">queue_music</span>
          <h3 class="font-headline-sm text-headline-sm text-on-surface">Repertório &amp; Cifras (${songs.length})</h3>
        </div>
        <button type="button" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant" id="closeRepModalBtn">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2.5 max-h-[45vh] overflow-y-auto">
        ${
          songs.length === 0
            ? '<div class="p-4 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm">Nenhuma música cadastrada no repertório ainda.</div>'
            : songs
                .map((s) => {
                  const realId = s.song_id || s.id;
                  return `
          <div class="p-3 rounded-xl ${
            highlightSongId === realId
              ? 'bg-surface-container-high border border-primary'
              : 'bg-surface-container-low'
          } flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-label-sm font-bold">${window.LouvorAPI.escapeHtml(s.musical_key)}</span>
                <span class="font-headline-sm text-headline-sm text-on-surface truncate">${window.LouvorAPI.escapeHtml(s.title)}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <span class="font-label-sm text-on-surface-variant">${s.bpm} BPM</span>
                ${
                  canEditSong
                    ? `<button type="button" onclick="editSongInModal(${realId})" class="p-1 text-on-surface-variant hover:text-primary" title="Editar Música"><span class="material-symbols-outlined text-[16px]">edit</span></button>`
                    : ''
                }
                ${
                  canDeleteSong
                    ? `<button type="button" onclick="deleteSongFromCatalog(${realId})" class="p-1 text-on-surface-variant hover:text-error" title="Excluir Música"><span class="material-symbols-outlined text-[16px]">delete</span></button>`
                    : ''
                }
              </div>
            </div>
            <div class="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>${window.LouvorAPI.escapeHtml(s.artist || '')}${s.lead_vocal ? ' • Vocal: ' + window.LouvorAPI.escapeHtml(s.lead_vocal) : ''}</span>
              ${
                s.audio_url
                  ? `<a href="${window.LouvorAPI.escapeHtml(s.audio_url)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline flex items-center gap-0.5 text-[11px]">Áudio <span class="material-symbols-outlined text-[12px]">open_in_new</span></a>`
                  : ''
              }
            </div>
            ${
              s.chords_text
                ? `<pre class="mt-1 p-2.5 rounded-lg bg-surface-container-lowest text-primary font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">${window.LouvorAPI.escapeHtml(s.chords_text)}</pre>`
                : ''
            }
          </div>
        `;
                })
                .join('')
        }
      </div>
      ${
        canCreateSong || (canEditSong && editSongObj)
          ? `
        <div class="pt-2 border-t border-outline-variant/30 flex flex-col gap-2">
          <span class="font-label-sm text-secondary uppercase">${
            editSongObj ? 'Editar Música: ' + window.LouvorAPI.escapeHtml(editSongObj.title) : 'Cadastrar Nova Música no Catálogo'
          }</span>
          <div class="grid grid-cols-3 gap-2">
            <input id="newSongTitle" value="${window.LouvorAPI.escapeHtml(editSongObj ? editSongObj.title : '')}" placeholder="Título da música" class="col-span-2 h-10 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
            <input id="newSongKey" value="${window.LouvorAPI.escapeHtml(editSongObj ? editSongObj.musical_key : '')}" placeholder="Tom (Ex: G)" class="h-10 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <input id="newSongArtist" value="${window.LouvorAPI.escapeHtml(editSongObj ? editSongObj.artist : '')}" placeholder="Artista / Ministério" class="col-span-2 h-10 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
            <input id="newSongBpm" type="number" value="${editSongObj ? editSongObj.bpm : ''}" placeholder="BPM (72)" class="h-10 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          </div>
          <input id="newSongAudio" value="${window.LouvorAPI.escapeHtml(editSongObj ? editSongObj.audio_url || '' : '')}" placeholder="Link de Áudio / Referência (opcional)" class="w-full h-10 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          <textarea id="newSongChords" rows="2" placeholder="Cifra / Acordes (ex: [Intro] G C Em D)" class="w-full p-2.5 rounded-lg bg-surface-container-lowest text-on-surface font-mono text-[11px]">${window.LouvorAPI.escapeHtml(editSongObj ? editSongObj.chords_text || '' : '')}</textarea>
          <button type="button" id="saveNewSongBtn" class="h-10 rounded-xl bg-secondary text-on-secondary font-label-md font-bold">${
            editSongObj ? 'Salvar Alterações da Música' : 'Adicionar ao Repertório'
          }</button>
        </div>
      `
          : ''
      }
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#closeRepModalBtn').onclick = () => modal.remove();

  const saveSongBtn = modal.querySelector('#saveNewSongBtn');
  if (saveSongBtn) {
    saveSongBtn.onclick = async () => {
      const title = modal.querySelector('#newSongTitle').value.trim();
      const musical_key = modal.querySelector('#newSongKey').value.trim() || 'G';
      const artist = modal.querySelector('#newSongArtist').value.trim() || 'Ministério de Louvor';
      const bpm = parseInt(modal.querySelector('#newSongBpm').value || '70', 10);
      const audio_url = modal.querySelector('#newSongAudio').value.trim();
      const chords_text = modal.querySelector('#newSongChords').value;
      try {
        if (editSongObj) {
          await window.LouvorAPI.request(`/api/repertoire/${editSongObj.id}`, {
            method: 'PUT',
            body: { title, musical_key, artist, bpm, audio_url, chords_text }
          });
          window.LouvorAPI.showToast('Música atualizada com sucesso!');
        } else {
          await window.LouvorAPI.request('/api/repertoire', {
            method: 'POST',
            body: { title, musical_key, artist, bpm, audio_url, chords_text }
          });
          window.LouvorAPI.showToast('Música cadastrada no repertório!');
        }
        modal.remove();
        await loadCalendarData();
      } catch (err) {
        window.LouvorAPI.showToast(err.message, 'error');
      }
    };
  }
}

function editSongInModal(songId) {
  const found = allSongs.find((s) => s.id === songId);
  if (found) {
    openRepertoireModal(songId, found);
  }
}

async function deleteSongFromCatalog(songId) {
  if (!confirm('Deseja excluir esta música do repertório?')) return;
  try {
    const res = await window.LouvorAPI.request(`/api/repertoire/${songId}`, { method: 'DELETE' });
    window.LouvorAPI.showToast(res.message);
    const modal = document.getElementById('repertoireCatalogModal');
    if (modal) modal.remove();
    await loadCalendarData();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openScheduleFormModal(editMode = false) {
  const s = editMode && selectedSchedule ? selectedSchedule : null;
  const currentSongsMap = new Map((s?.songs || []).map((item) => [item.song_id, item]));

  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-headline-sm text-on-surface">${
          s ? 'Editar Evento / Escala' : 'Novo Evento / Escala'
        }</h3>
        <button type="button" id="closeSchedModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2.5">
        <input id="schedTitle" value="${window.LouvorAPI.escapeHtml(s ? s.title : '')}" placeholder="Título (Ex: Culto de Celebração - 19h)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        <input id="schedSubtitle" value="${window.LouvorAPI.escapeHtml(s ? s.subtitle : '')}" placeholder="Subtítulo (Ex: Domingo Especial)" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label class="font-label-sm text-on-surface-variant">Data</label>
            <input id="schedDate" type="date" value="${s ? s.event_date : selectedDateStr}" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-sm text-on-surface-variant">Status / Tipo</label>
            <select id="schedStatus" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm">
              <option value="confirmed" ${s?.status === 'confirmed' ? 'selected' : ''}>Culto Confirmado</option>
              <option value="rehearsal" ${s?.status === 'rehearsal' ? 'selected' : ''}>Ensaio Agendado</option>
              <option value="cancelled" ${s?.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label class="font-label-sm text-on-surface-variant">Passagem de Som</label>
            <input id="schedSoundcheck" value="${window.LouvorAPI.escapeHtml(s ? s.soundcheck_time : '17:30')}" placeholder="17:30" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-label-sm text-on-surface-variant">Local / Auditório</label>
            <input id="schedLocation" value="${window.LouvorAPI.escapeHtml(s ? s.location : 'Templo Principal')}" placeholder="Templo Principal" class="h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm" />
          </div>
        </div>
        ${
          !s
            ? `
          <label class="flex items-center gap-2 text-body-sm text-on-surface cursor-pointer pt-1">
            <input type="checkbox" id="includeSelfInScheduleCheck" class="w-4 h-4 rounded accent-blue-500" />
            <span>Incluir-me como integrante escalado neste evento</span>
          </label>
        `
            : ''
        }
        <div class="flex flex-col gap-1">
          <label class="font-label-sm text-on-surface-variant">Músicas do Repertório (com Tom Customizado opcional)</label>
          <div class="max-h-36 overflow-y-auto p-2 rounded-lg bg-surface-container-lowest flex flex-col gap-2">
            ${
              allSongs.length === 0
                ? '<span class="text-body-sm text-outline">Cadastre músicas no botão Repertório para vincular à escala.</span>'
                : allSongs
                    .map((song) => {
                      const existingSong = currentSongsMap.get(song.id);
                      return `
              <div class="flex items-center justify-between gap-2 text-body-sm text-on-surface">
                <label class="flex items-center gap-2 cursor-pointer flex-1 truncate">
                  <input type="checkbox" class="sched-song-check" value="${song.id}" ${
                        existingSong ? 'checked' : ''
                      } />
                  <span class="truncate">${window.LouvorAPI.escapeHtml(song.title)}</span>
                </label>
                <input type="text" class="sched-song-key w-14 h-7 px-1.5 rounded bg-surface-container text-primary text-center font-mono text-[11px]" data-song-id="${song.id}" value="${window.LouvorAPI.escapeHtml(existingSong ? existingSong.musical_key : song.musical_key)}" title="Tom na escala" />
              </div>
            `;
                    })
                    .join('')
            }
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelSchedModalBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveSchedModalBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar Escala</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeSchedModalBtn').onclick = close;
  modal.querySelector('#cancelSchedModalBtn').onclick = close;

  modal.querySelector('#saveSchedModalBtn').onclick = async () => {
    const title = modal.querySelector('#schedTitle').value.trim();
    const subtitle = modal.querySelector('#schedSubtitle').value.trim();
    const event_date = modal.querySelector('#schedDate').value;
    const status = modal.querySelector('#schedStatus').value;
    const soundcheck_time = modal.querySelector('#schedSoundcheck').value.trim() || '17:30';
    const location = modal.querySelector('#schedLocation').value.trim() || 'Templo Principal';
    const song_ids = Array.from(modal.querySelectorAll('.sched-song-check:checked')).map((el) => {
      const sId = parseInt(el.value, 10);
      const keyInput = modal.querySelector(`.sched-song-key[data-song-id="${sId}"]`);
      return {
        song_id: sId,
        custom_key: keyInput ? keyInput.value.trim() : null
      };
    });
    const event_type = status === 'rehearsal' ? 'ensaio' : status === 'cancelled' ? 'cancelado' : 'culto';

    try {
      if (s) {
        const res = await window.LouvorAPI.request(`/api/schedules/${s.id}`, {
          method: 'PUT',
          body: { title, subtitle, event_date, status, event_type, soundcheck_time, location, song_ids }
        });
        window.LouvorAPI.showToast(res.message);
      } else {
        const includeSelf = modal.querySelector('#includeSelfInScheduleCheck')?.checked;
        const primarySkill = (currentUser.skills && currentUser.skills[0]) || {
          role_key: 'vocal',
          skill_name: currentUser.title || 'Direção Musical',
          icon: 'mic'
        };
        const members = includeSelf
          ? [
              {
                user_id: currentUser.id,
                role_key: primarySkill.role_key || 'vocal',
                role_label: `${currentUser.full_name} (Líder)`,
                instrument_detail: primarySkill.skill_name || currentUser.title || 'Líder',
                is_leader: 1,
                confirmation_status: 'confirmed',
                icon: primarySkill.icon || 'mic',
                color_variant: 'primary'
              }
            ]
          : [];

        const res = await window.LouvorAPI.request('/api/schedules', {
          method: 'POST',
          body: {
            title,
            subtitle: subtitle || `Escala • ${event_date}`,
            event_date,
            status,
            event_type,
            soundcheck_time,
            location,
            leader_name: currentUser.full_name,
            song_ids,
            members
          }
        });
        window.LouvorAPI.showToast(res.message);
      }
      selectedDateStr = event_date;
      const dParts = event_date.split('-');
      currentYear = parseInt(dParts[0], 10);
      currentMonth = parseInt(dParts[1], 10) - 1;
      close();
      await loadCalendarData();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

(async function () {
  currentUser = await window.LouvorNav.initPage({ activeTab: 'calendario' });
  if (!currentUser) return;

  await loadCalendarData();

  document.getElementById('prevMonthBtn').onclick = async () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    selectedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    await loadCalendarData();
  };

  document.getElementById('nextMonthBtn').onclick = async () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    selectedDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    await loadCalendarData();
  };

  document.getElementById('btnOpenRepertoireModal').onclick = () => openRepertoireModal();
  document.getElementById('btnOpenBpmTons').onclick = () => openRepertoireModal();
  document.getElementById('btnNewScheduleFab').onclick = () => openScheduleFormModal(false);
  document.getElementById('btnEditSchedule').onclick = () => openScheduleFormModal(true);
  document.getElementById('btnAddRosterMember').onclick = () => openAddMemberModal();

  document.getElementById('btnDeleteSchedule').onclick = async () => {
    if (!selectedSchedule) return;
    if (!confirm(`Tem certeza que deseja excluir "${selectedSchedule.title}"?`)) return;
    try {
      const res = await window.LouvorAPI.request(`/api/schedules/${selectedSchedule.id}`, {
        method: 'DELETE'
      });
      window.LouvorAPI.showToast(res.message);
      await loadCalendarData();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };

  document.getElementById('btnNotifyTeam').onclick = async () => {
    if (!selectedSchedule) {
      window.LouvorAPI.showToast('Nenhum evento selecionado nesta data.', 'warning');
      return;
    }
    try {
      const res = await window.LouvorAPI.request(`/api/schedules/${selectedSchedule.id}/notify`, {
        method: 'POST'
      });
      window.LouvorAPI.showToast(res.message);
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
})();
