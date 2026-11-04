const SwapModel = require('../models/SwapModel');
const ScheduleModel = require('../models/ScheduleModel');
const UserModel = require('../models/UserModel');
const SettingsModel = require('../models/SettingsModel');
const AuditService = require('../services/auditService');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const SwapController = {
  async list(req, res) {
    await requirePermission(req, 'swaps', 'view');
    const statusFilter = req.query.status || '';
    const [swaps, kpis, settings, candidates] = await Promise.all([
      SwapModel.getAll({ status: statusFilter }),
      SwapModel.getKpiMetrics(),
      SettingsModel.getAllSettings(),
      UserModel.getAll({ status: 'active' })
    ]);

    sendJson(res, 200, {
      ok: true,
      swaps,
      kpis,
      guidelines: {
        swap_deadline_hours: settings.swap_deadline_hours || '24',
        swap_deadline_active: settings.swap_deadline_active !== 'false',
        rehearsal_auto_approve: settings.rehearsal_auto_approve !== 'false'
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        title: c.title,
        whatsapp: c.whatsapp
      }))
    });
  },

  async create(req, res) {
    await requirePermission(req, 'swaps', 'create');
    const { schedule_id, substitute_id, role_label, instrument_detail, song_key_badge, reason } = req.body;
    if (!schedule_id || !reason || String(reason).trim().length < 3) {
      const err = new Error('Informe a escala e o motivo da solicitação de troca.');
      err.status = 400;
      throw err;
    }

    const schedule = await ScheduleModel.getById(parseInt(schedule_id, 10));
    if (!schedule) {
      const err = new Error('Escala informada não existe.');
      err.status = 404;
      throw err;
    }

    const settings = await SettingsModel.getAllSettings();
    const deadlineActive = settings.swap_deadline_active !== 'false';
    const deadlineHours = parseInt(settings.swap_deadline_hours || '24', 10);

    if (deadlineActive && deadlineHours > 0 && req.body.bypass_deadline !== true) {
      const eventIso = `${schedule.event_date}T${schedule.event_time || '19:00'}:00`;
      const eventTs = new Date(eventIso).getTime();
      if (!Number.isNaN(eventTs)) {
        const diffHours = (eventTs - Date.now()) / (1000 * 3600);
        // Bloqueia apenas se o evento estiver dentro da janela crítica (ex: entre -2h e +deadlineHours)
        if (diffHours >= -2 && diffHours < deadlineHours) {
          const err = new Error(
            `Prazo limite encerrado: solicitações de troca devem ser feitas com no mínimo ${deadlineHours}h de antecedência.`
          );
          err.status = 400;
          throw err;
        }
      }
    }

    let created = await SwapModel.createSwapRequest({
      schedule_id: parseInt(schedule_id, 10),
      requester_id: req.user.id,
      substitute_id: substitute_id ? parseInt(substitute_id, 10) : null,
      role_label: role_label || req.user.title || 'Instrumento',
      instrument_detail: instrument_detail || 'Equipe de Louvor',
      song_key_badge: song_key_badge || '',
      reason: String(reason).trim()
    });

    // Verifica diretriz de Autoaprovação de Ensaios (por event_type === 'ensaio' ou título contendo 'ensaio')
    const autoApproveRehearsal = settings.rehearsal_auto_approve !== 'false';
    const isRehearsalEvent =
      schedule.event_type === 'ensaio' || String(schedule.title || '').toLowerCase().includes('ensaio');
    let wasAutoApproved = false;
    if (autoApproveRehearsal && isRehearsalEvent && substitute_id) {
      created = await SwapModel.resolveSwap(
        created.id,
        {
          action: 'approve',
          admin_note: 'Autoaprovada (Diretriz de Ensaio)',
          substitute_id: parseInt(substitute_id, 10)
        },
        req.user.id
      );
      wasAutoApproved = true;
    }

    // Notifica todos os administradores reais (e nunca user_id: 1 fixo)
    await UserModel.notifyAllAdmins({
      title: wasAutoApproved ? 'Troca de Ensaio Autoaprovada' : 'Nova Solicitação de Troca',
      message: `${req.user.full_name} solicitou troca para ${schedule.title}: "${reason}"`,
      type: 'swap'
    });

    await AuditService.record(
      req,
      wasAutoApproved ? 'AUTO_APPROVE_REHEARSAL_SWAP' : 'CREATE_SWAP_REQUEST',
      'swap_request',
      created.id,
      `Solicitou troca na escala #${schedule_id}: ${reason}`
    );

    sendJson(res, 201, {
      ok: true,
      message: wasAutoApproved
        ? 'Troca de ensaio aprovada automaticamente conforme diretriz do ministério!'
        : 'Solicitação de troca publicada e enviada para os substitutos!',
      swap: created
    });
  },

  async confirmWithLeader(req, res) {
    await requirePermission(req, 'swaps', 'edit');
    const swap = await SwapModel.getById(req.params.id);
    if (!swap) {
      const err = new Error('Solicitação de troca não encontrada.');
      err.status = 404;
      throw err;
    }
    if (req.user.role !== 'ADMIN' && swap.requester_id !== req.user.id && swap.substitute_id !== req.user.id) {
      const err = new Error('Você não tem permissão para alterar esta solicitação de troca.');
      err.status = 403;
      throw err;
    }

    const updated = await SwapModel.confirmWithLeader(req.params.id);
    await AuditService.record(
      req,
      'CONFIRM_SWAP_LEADER',
      'swap_request',
      updated.id,
      'Encaminhou troca para homologação final do líder'
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Troca encaminhada para homologação final do líder!',
      swap: updated
    });
  },

  async cancel(req, res) {
    await requirePermission(req, 'swaps', 'edit');
    const swap = await SwapModel.getById(req.params.id);
    if (!swap) {
      const err = new Error('Solicitação de troca não encontrada.');
      err.status = 404;
      throw err;
    }
    if (req.user.role !== 'ADMIN' && swap.requester_id !== req.user.id) {
      const err = new Error('Apenas o solicitante ou um administrador pode cancelar este pedido.');
      err.status = 403;
      throw err;
    }

    const cancelled = await SwapModel.cancelSwap(req.params.id);
    await AuditService.record(
      req,
      'CANCEL_SWAP_REQUEST',
      'swap_request',
      cancelled.id,
      'Cancelou pedido de troca'
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Pedido de troca cancelado com sucesso.',
      swap: cancelled
    });
  },

  async resolve(req, res) {
    await requirePermission(req, 'swaps', 'approve');
    const { action, admin_note, substitute_id } = req.body;
    const validActions = ['approve', 'approve_with_note', 'reject', 'dispense', 'manual_assign'];
    if (!validActions.includes(action)) {
      const err = new Error('Ação de resolução inválida.');
      err.status = 400;
      throw err;
    }

    const resolved = await SwapModel.resolveSwap(
      req.params.id,
      { action, admin_note, substitute_id: substitute_id ? parseInt(substitute_id, 10) : null },
      req.user.id
    );
    if (!resolved) {
      const err = new Error('Solicitação de troca não encontrada.');
      err.status = 404;
      throw err;
    }

    await UserModel.createNotification({
      user_id: resolved.requester_id,
      title: action.startsWith('approve') || action === 'manual_assign'
        ? 'Sua troca foi aprovada!'
        : action === 'dispense'
          ? 'Posto dispensado na escala'
          : 'Solicitação de troca recusada',
      message: `O líder avaliou sua solicitação para ${resolved.schedule ? resolved.schedule.title : 'o culto'}: ${resolved.admin_note || ''}`,
      type: 'swap'
    });

    await AuditService.record(
      req,
      `RESOLVE_SWAP_${action.toUpperCase()}`,
      'swap_request',
      resolved.id,
      `Resolveu troca #${resolved.id} com ação '${action}'`
    );

    sendJson(res, 200, {
      ok: true,
      message:
        action === 'approve'
          ? 'Troca aprovada com sucesso!'
          : action === 'approve_with_note'
            ? 'Troca aprovada com ressalva!'
            : action === 'dispense'
              ? 'Posto dispensado na escala!'
              : action === 'manual_assign'
                ? 'Substituto escalado manualmente com sucesso!'
                : 'Troca recusada.',
      swap: resolved
    });
  },

  async dispatchAlert(req, res) {
    await requirePermission(req, 'swaps', 'approve');
    const updated = await SwapModel.dispatchEmergencyAlert(req.params.id);
    if (!updated) {
      const err = new Error('Solicitação de troca não encontrada.');
      err.status = 404;
      throw err;
    }
    await AuditService.record(
      req,
      'DISPATCH_SWAP_ALERT',
      'swap_request',
      updated.id,
      `Disparou alerta de emergência para ${updated.notified_count || 0} músico(s) (${updated.role_label})`
    );
    sendJson(res, 200, {
      ok: true,
      message: `Alerta enviado para ${updated.notified_count || 0} músico(s) da equipe!`,
      swap: updated
    });
  },

  async batchSmartApprove(req, res) {
    await requirePermission(req, 'swaps', 'approve');
    const allPending = await SwapModel.getAll({ status: 'pending' });
    const readySwaps = allPending.filter((s) => s.substitute_id && s.urgency_type !== 'conflict');
    const approvedIds = [];
    for (const s of readySwaps) {
      await SwapModel.resolveSwap(s.id, { action: 'approve', admin_note: 'Aprovação Inteligente' }, req.user.id);
      approvedIds.push(s.id);
    }
    await AuditService.record(
      req,
      'BATCH_SMART_APPROVE',
      'swap_request',
      approvedIds.join(',') || 'none',
      `Aprovou automaticamente ${approvedIds.length} troca(s) com par ideal`
    );
    sendJson(res, 200, {
      ok: true,
      approvedCount: approvedIds.length,
      approvedIds,
      message:
        approvedIds.length > 0
          ? `${approvedIds.length} troca(s) com par ideal aprovada(s) com sucesso!`
          : 'Nenhuma troca pendente com par ideal sem conflito na fila.'
    });
  }
};

module.exports = SwapController;
