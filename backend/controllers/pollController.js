const PollModel = require('../models/PollModel');
const ScheduleService = require('../services/scheduleService');
const AuditService = require('../services/auditService');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const PollController = {
  async list(req, res) {
    await requirePermission(req, 'polls', 'view');
    const filter = req.query.filter || 'todas';
    const polls = await PollModel.getAll({ filter, currentUserId: req.user.id });
    sendJson(res, 200, { ok: true, polls });
  },

  async getVotesDetail(req, res) {
    await requirePermission(req, 'polls', 'view');
    const poll = await PollModel.getById(req.params.id, req.user.id);
    if (!poll) {
      const err = new Error('Enquete não encontrada.');
      err.status = 404;
      throw err;
    }
    sendJson(res, 200, {
      ok: true,
      poll,
      votes: poll.votes || [],
      pending_members: poll.pending_members || [],
      unavailable_on_date: poll.unavailable_on_date || []
    });
  },

  async create(req, res) {
    await requirePermission(req, 'polls', 'create');
    if (req.user.role !== 'ADMIN') {
      const err = new Error('Apenas administradores podem abrir novas enquetes oficiais.');
      err.status = 403;
      throw err;
    }
    if (!req.body.title || !req.body.event_date) {
      const err = new Error('Título e data da enquete são obrigatórios.');
      err.status = 400;
      throw err;
    }
    const created = await PollModel.createPoll(req.body, req.user.id);
    await AuditService.record(
      req,
      'CREATE_POLL',
      'poll',
      created.id,
      `Abriu nova enquete: ${created.title} (${created.event_date}) com ${(created.targets || []).length} categorias`
    );
    sendJson(res, 201, {
      ok: true,
      message: 'Enquete de disponibilidade criada com quantidades definidas por categoria!',
      poll: created
    });
  },

  async vote(req, res) {
    await requirePermission(req, 'polls', 'edit');
    const isAvailable = Boolean(req.body.is_available);
    const roleKey = req.body.role_key || (req.user.skills && req.user.skills[0] ? req.user.skills[0].role_key : '');
    const roleLabel =
      req.body.role_label ||
      (req.user.skills && req.user.skills.length > 0
        ? req.user.skills[0].skill_name
        : 'Vocal');
    const notes = req.body.notes || '';

    const updated = await PollModel.castVote(req.params.id, req.user.id, isAvailable, roleLabel, roleKey, notes);
    if (!updated) {
      const err = new Error('Enquete não encontrada.');
      err.status = 404;
      throw err;
    }
    sendJson(res, 200, {
      ok: true,
      message: isAvailable
        ? `Disponibilidade confirmada (${roleLabel})!`
        : 'Indisponibilidade registrada para esta data.',
      poll: updated
    });
  },

  async generateRoster(req, res) {
    await requirePermission(req, 'polls', 'approve');
    const result = await ScheduleService.generateRosterFromPoll(req.params.id, req.user.id);
    const schedule = result.schedule || result;
    await AuditService.record(
      req,
      'GENERATE_ROSTER_FROM_POLL',
      'schedule',
      schedule.id,
      `Gerou escala otimizada a partir da enquete #${req.params.id} (${result.addedMembersCount || 0} escalados, ${result.skippedUnavailableCount || 0} indisponíveis ignorados)`
    );
    sendJson(res, 200, {
      ok: true,
      addedMembersCount: result.addedMembersCount || (schedule.members || []).length,
      skippedUnavailableCount: result.skippedUnavailableCount || 0,
      message:
        result.skippedUnavailableCount > 0
          ? `Escala "${schedule.title}" gerada com ${(schedule.members || []).length} integrantes (${result.skippedUnavailableCount} ignorado(s) por indisponibilidade cadastrada)!`
          : `Escala "${schedule.title}" gerada e sincronizada no Calendário com ${(schedule.members || []).length} integrantes!`,
      schedule
    });
  },

  async updateStatus(req, res) {
    await requirePermission(req, 'polls', 'approve');
    const status = req.body.status === 'closed' ? 'closed' : 'open';
    const updated = await PollModel.updatePollStatus(req.params.id, status);
    await AuditService.record(
      req,
      'UPDATE_POLL_STATUS',
      'poll',
      req.params.id,
      `Alterou status da enquete #${req.params.id} para ${status}`
    );
    sendJson(res, 200, {
      ok: true,
      message: status === 'closed' ? 'Enquete encerrada.' : 'Enquete reaberta.',
      poll: updated
    });
  },

  async remove(req, res) {
    await requirePermission(req, 'polls', 'delete');
    await PollModel.deletePoll(req.params.id);
    await AuditService.record(req, 'DELETE_POLL', 'poll', req.params.id, `Excluiu enquete #${req.params.id}`);
    sendJson(res, 200, { ok: true, message: 'Enquete excluída com sucesso.' });
  }
};

module.exports = PollController;
