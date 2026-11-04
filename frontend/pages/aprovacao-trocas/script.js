let currentUser = null;
let allSwaps = [];
let allCandidates = [];
let activeStatusFilter = 'pending';
let currentGuidelines = {
  swap_deadline_hours: '24',
  swap_deadline_active: true,
  rehearsal_auto_approve: true
};

async function resolveSwapCard(swapId, action, feedbackText, substituteId = null) {
  try {
    const res = await window.LouvorAPI.request(`/api/swaps/${swapId}/resolve`, {
      method: 'POST',
      body: {
        action,
        admin_note: feedbackText,
        substitute_id: substituteId
      }
    });
    window.LouvorAPI.showToast(res.message);
    await refreshSwapKpisAndHistory();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function approveSwapWithNote(swapId) {
  const note = prompt('Digite a ressalva ou observação pastoral para esta troca:', 'Aprovada c/ Ressalva');
  if (note === null) return;
  resolveSwapCard(swapId, 'approve_with_note', note.trim() || 'Aprovada c/ Ressalva');
}

async function dispatchAlertForSwap(swapId) {
  try {
    const res = await window.LouvorAPI.request(`/api/swaps/${swapId}/alert`, {
      method: 'POST'
    });
    window.LouvorAPI.showToast(res.message);
    await refreshSwapKpisAndHistory();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

async function runSmartBatchApprove() {
  try {
    const res = await window.LouvorAPI.request('/api/swaps/batch-approve', {
      method: 'POST'
    });
    window.LouvorAPI.showToast(res.message);
    await refreshSwapKpisAndHistory();
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openManualAssignModal(swapId) {
  if (allCandidates.length === 0) {
    window.LouvorAPI.showToast('Nenhum membro disponível cadastrado.', 'warning');
    return;
  }
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Selecionar Substituto Manualmente</h3>
        <button type="button" id="closeManualModalBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <p class="font-body-sm text-on-surface-variant">Escolha o músico que assumirá este posto na escala:</p>
      <select id="manualCandidateSelect" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface">
        ${allCandidates
          .map(
            (c) =>
              `<option value="${c.id}">${window.LouvorAPI.escapeHtml(c.full_name)} (${window.LouvorAPI.escapeHtml(c.title)})</option>`
          )
          .join('')}
      </select>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelManualBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="confirmManualBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Escalar e Aprovar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeManualModalBtn').onclick = close;
  modal.querySelector('#cancelManualBtn').onclick = close;
  modal.querySelector('#confirmManualBtn').onclick = async () => {
    const subId = parseInt(modal.querySelector('#manualCandidateSelect').value, 10);
    const chosen = allCandidates.find((c) => c.id === subId);
    close();
    await resolveSwapCard(
      swapId,
      'manual_assign',
      `Escalado manualmente: ${chosen ? chosen.full_name : 'Substituto'}`,
      subId
    );
  };
}

function filterSwapsByStatus(statusFilter, clickedBtn) {
  activeStatusFilter = statusFilter;
  document.querySelectorAll('#filter-pill-group button').forEach((btn) => {
    btn.className =
      'flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors';
  });
  clickedBtn.className =
    'flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md transition-all shadow-sm';

  renderSwapsQueue();
}

async function toggleGuidelineSetting(settingKey) {
  const newVal = !currentGuidelines[settingKey];
  currentGuidelines[settingKey] = newVal;
  try {
    await window.LouvorAPI.request('/api/settings', {
      method: 'PUT',
      body: { [settingKey]: String(newVal) }
    });
    renderGuidelinesUI();
    window.LouvorAPI.showToast('Diretriz de trocas atualizada!');
  } catch (err) {
    window.LouvorAPI.showToast(err.message, 'error');
  }
}

function openGuidelinesConfigModal() {
  const modal = document.createElement('div');
  modal.className = 'louvor-modal-backdrop';
  modal.innerHTML = `
    <div class="louvor-modal-card flex flex-col gap-3.5">
      <div class="flex items-center justify-between">
        <h3 class="font-headline-sm text-on-surface">Configurar Diretrizes de Trocas</h3>
        <button type="button" id="closeGuideBtn" class="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
      <div class="flex flex-col gap-2">
        <label class="font-label-sm text-on-surface-variant uppercase">Prazo Limite Antes do Culto (Horas)</label>
        <input id="inputDeadlineHours" type="number" value="${currentGuidelines.swap_deadline_hours || 24}" class="w-full h-11 px-3 rounded-lg bg-surface-container-lowest text-on-surface" />
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" id="cancelGuideBtn" class="flex-1 h-11 rounded-xl bg-surface-container-highest text-on-surface font-label-md">Cancelar</button>
        <button type="button" id="saveGuideBtn" class="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-label-md font-bold">Salvar Diretrizes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#closeGuideBtn').onclick = close;
  modal.querySelector('#cancelGuideBtn').onclick = close;
  modal.querySelector('#saveGuideBtn').onclick = async () => {
    const hours = modal.querySelector('#inputDeadlineHours').value.trim() || '24';
    try {
      await window.LouvorAPI.request('/api/settings', {
        method: 'PUT',
        body: { swap_deadline_hours: hours }
      });
      currentGuidelines.swap_deadline_hours = hours;
      renderGuidelinesUI();
      window.LouvorAPI.showToast('Prazo limite atualizado!');
      close();
    } catch (err) {
      window.LouvorAPI.showToast(err.message, 'error');
    }
  };
}

function renderGuidelinesUI() {
  document.getElementById('guidelineDeadlineDesc').textContent = `Até ${currentGuidelines.swap_deadline_hours}h antes do culto`;
  const b1 = document.getElementById('guidelineDeadlineBadge');
  b1.textContent = currentGuidelines.swap_deadline_active ? 'Ativo' : 'Inativo';
  const b2 = document.getElementById('guidelineAutoApproveBadge');
  b2.textContent = currentGuidelines.rehearsal_auto_approve ? 'Ligado' : 'Desligado';
}

function renderSwapsQueue() {
  const dynQueue = document.getElementById('dynamicSwapsQueue');
  const recentContainer = document.getElementById('recentDecisionsContainer');

  const filtered = allSwaps.filter((s) => {
    if (activeStatusFilter === 'pending') return s.status === 'pending';
    if (activeStatusFilter === 'approved') {
      return s.status === 'approved' || s.status === 'approved_with_note' || s.status === 'slot_dispensed';
    }
    return s.status === 'rejected' || s.status === 'cancelled';
  });

  if (filtered.length === 0) {
    dynQueue.innerHTML = `
      <div class="p-6 rounded-2xl bg-surface-container-low text-center flex flex-col items-center gap-2 shadow-sm">
        <span class="material-symbols-outlined text-[28px] text-outline">inbox</span>
        <span class="font-headline-sm text-on-surface">Nenhuma solicitação nesta categoria</span>
        <span class="font-body-sm text-on-surface-variant">Quando um músico solicitar substituição, o pedido aparecerá aqui para aprovação.</span>
      </div>
    `;
  } else {
    dynQueue.innerHTML = filtered
      .map((s) => {
        const isPending = s.status === 'pending';
        return `
          <article class="flex flex-col p-4 rounded-2xl bg-surface-container-low shadow-md relative overflow-hidden">
            <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-tertiary via-primary to-transparent"></div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary/15 text-tertiary font-label-sm uppercase">
                ${window.LouvorAPI.escapeHtml(s.badge_text || 'Solicitação de Troca')}
              </span>
              <span class="font-label-sm text-primary font-semibold">${window.LouvorAPI.escapeHtml(s.role_label)}</span>
            </div>
            <h4 class="font-headline-sm text-on-surface">${window.LouvorAPI.escapeHtml(s.schedule ? s.schedule.title : 'Escala')}</h4>
            <span class="font-body-sm text-on-surface-variant mb-3">${window.LouvorAPI.escapeHtml(s.schedule ? s.schedule.event_date + ' • ' + s.schedule.event_time : '')}</span>

            <div class="p-3 rounded-xl bg-surface-container mb-3 flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span class="font-body-sm text-on-surface-variant">Solicitante:</span>
                <strong class="font-label-md text-on-surface">${window.LouvorAPI.escapeHtml(s.requester ? s.requester.full_name : '-')}</strong>
              </div>
              <div class="flex items-center justify-between">
                <span class="font-body-sm text-on-surface-variant">Substituto:</span>
                <strong class="font-label-md text-secondary">${window.LouvorAPI.escapeHtml(s.substitute ? s.substitute.full_name : 'Vaga em aberto')}</strong>
              </div>
            </div>

            <div class="p-2.5 rounded-lg bg-surface-container-high/60 mb-3 font-body-sm italic text-on-surface">
              “${window.LouvorAPI.escapeHtml(s.reason)}”
            </div>

            ${
              isPending
                ? `
              <div class="grid grid-cols-2 gap-2">
                <button type="button" onclick="resolveSwapCard(${s.id}, 'approve', 'Aprovada com Sucesso!')" class="h-11 rounded-xl bg-secondary text-on-secondary font-label-md font-bold flex items-center justify-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">check_circle</span> Aprovar Troca
                </button>
                <button type="button" onclick="resolveSwapCard(${s.id}, 'reject', 'Troca Recusada')" class="h-11 rounded-xl bg-surface-container-high text-error font-label-md flex items-center justify-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px]">close</span> Recusar
                </button>
              </div>
              <div class="flex items-center justify-between pt-2 text-label-sm text-on-surface-variant flex-wrap gap-2">
                <button type="button" onclick="approveSwapWithNote(${s.id})" class="hover:text-tertiary flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">rate_review</span> Aprovar c/ Ressalva
                </button>
                <button type="button" onclick="openManualAssignModal(${s.id})" class="hover:text-primary flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">person_add</span> Escalar Manual
                </button>
                <button type="button" onclick="dispatchAlertForSwap(${s.id})" class="hover:text-secondary flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">campaign</span> Disparar Alerta
                </button>
                <button type="button" onclick="resolveSwapCard(${s.id}, 'dispense', 'Posto Dispensado')" class="hover:text-on-surface flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">visibility_off</span> Dispensar Posto
                </button>
              </div>
            `
                : `
              <div class="p-2 rounded-lg bg-surface-container text-center font-label-sm text-secondary">
                ${window.LouvorAPI.escapeHtml(s.admin_note || 'Resolvida')}
              </div>
            `
            }
          </article>
        `;
      })
      .join('');
  }

  const resolvedList = allSwaps.filter((s) => s.status !== 'pending');
  if (resolvedList.length === 0) {
    recentContainer.innerHTML = `
      <div class="p-4 rounded-xl bg-surface-container-low text-center font-body-sm text-on-surface-variant">
        Nenhuma decisão registrada ainda.
      </div>
    `;
  } else {
    recentContainer.innerHTML = resolvedList
      .slice(0, 10)
      .map((r) => {
        const isOk = r.status === 'approved' || r.status === 'approved_with_note' || r.status === 'slot_dispensed';
        return `
          <div class="flex items-center justify-between p-3 rounded-xl bg-surface-container-low">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-full ${
                isOk ? 'bg-secondary/15 text-secondary' : 'bg-error/15 text-error'
              } flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[18px]">${isOk ? 'check' : 'close'}</span>
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-label-md text-on-surface font-medium truncate">
                  ${window.LouvorAPI.escapeHtml(r.requester ? r.requester.full_name : '')} → ${window.LouvorAPI.escapeHtml(r.substitute ? r.substitute.full_name : 'Posto')}
                </span>
                <span class="font-body-sm text-on-surface-variant truncate">${window.LouvorAPI.escapeHtml(r.role_label)} • ${window.LouvorAPI.escapeHtml(r.schedule ? r.schedule.title : '')}</span>
              </div>
            </div>
            <span class="font-label-sm text-on-surface-variant shrink-0">${window.LouvorAPI.escapeHtml(r.admin_note || '')}</span>
          </div>
        `;
      })
      .join('');
  }
}

async function refreshSwapKpisAndHistory() {
  try {
    const res = await window.LouvorAPI.request('/api/swaps');
    allSwaps = res.swaps || [];
    allCandidates = res.candidates || [];
    if (res.guidelines) {
      currentGuidelines = res.guidelines;
      renderGuidelinesUI();
    }
    if (res.kpis) {
      document.getElementById('kpiQueueCount').textContent = String(res.kpis.pendingCount || 0);
      document.getElementById('kpiAvgTime').textContent = res.kpis.avgResponseTime || '0h';
      document.getElementById('kpiCoverage').textContent = res.kpis.coveragePercent || '0%';
      document.getElementById('headerPendingBadge').textContent = `${res.kpis.pendingCount || 0} Pendentes`;
      document.getElementById('queueCountSubtitle').textContent = `${res.kpis.pendingCount || 0} na fila`;
      document.getElementById('pillPendingLabel').textContent = `Pendentes (${res.kpis.pendingCount || 0})`;
      document.getElementById('pillApprovedLabel').textContent = `Aprovadas (${res.kpis.approvedCount || 0})`;
      document.getElementById('pillRejectedLabel').textContent = `Recusadas (${res.kpis.rejectedCount || 0})`;
      document.getElementById('smartApproveDesc').textContent = `${res.kpis.smartReadyCount || 0} troca(s) com par ideal pronta(s)`;
    }
    renderSwapsQueue();
  } catch (err) {
    console.error(err);
  }
}

(async function () {
  currentUser = await window.LouvorNav.initPage({ activeTab: 'aprovacao-trocas' });
  if (!currentUser) return;
  await refreshSwapKpisAndHistory();
})();
