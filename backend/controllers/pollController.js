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
      `Abriu nova enquete: ${created.title} (${created.event_date})`
    );
    sendJson(res, 201, {
      ok: true,
      message: 'Enquete de disponibilidade criada com sucesso!',
      poll: created
    });
  },

  async vote(req, res) {
    await requirePermission(req, 'polls', 'edit');
    const isAvailable = Boolean(req.body.is_available);
    const roleLabel =
      req.body.role_label ||
      (req.user.skills && req.user.skills.length > 0
        ? req.user.skills.map((s) => s.skill_name.split(' ')[0]).slice(0, 2).join(' & ')
        : 'Teclado & Vocal');

    const updated = await PollModel.castVote(req.params.id, req.user.id, isAvailable, roleLabel);
    if (!updated) {
      const err = new Error('Enquete não encontrada.');
      err.status = 404;
      throw err;
    }
    sendJson(res, 200, {
      ok: true,
      message: isAvailable
        ? 'Disponibilidade confirmada com sucesso!'
        : 'Indisponibilidade registrada para esta data.',
      poll: updated
    });
  },

  async generateRoster(req, res) {
    await requirePermission(req, 'polls', 'approve');
    const schedule = await ScheduleService.generateRosterFromPoll(req.params.id, req.user.id);
    await AuditService.record(
      req,
      'GENERATE_ROSTER_FROM_POLL',
      'schedule',
      schedule.id,
      `Gerou escala otimizada a partir da enquete #${req.params.id}`
    );
    sendJson(res, 200, {
      ok: true,
      message: `Escala "${schedule.title}" gerada e sincronizada no Calendário com ${(schedule.members || []).length} músicos!`,
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
