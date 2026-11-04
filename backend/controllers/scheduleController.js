const ScheduleModel = require('../models/ScheduleModel');
const SwapModel = require('../models/SwapModel');
const UserModel = require('../models/UserModel');
const AuditService = require('../services/auditService');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const ScheduleController = {
  async list(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const schedules = await ScheduleModel.getAll({
      month: req.query.month || '',
      campus: req.query.campus || '',
      status: req.query.status || '',
      search: req.query.search || ''
    });
    sendJson(res, 200, { ok: true, schedules });
  },

  async mySchedules(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const [myItems, mySwaps, candidates] = await Promise.all([
      ScheduleModel.getSchedulesForUser(req.user.id),
      SwapModel.getAll({ requester_id: req.user.id }),
      UserModel.getAll({ status: 'active' })
    ]);

    const now = new Date();
    const currentMonthPrefix = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthItems = myItems.filter((i) => String(i.event_date || '').startsWith(currentMonthPrefix));
    const confirmedInMonth = monthItems.filter((i) => i.confirmation_status === 'confirmed').length;

    const totalConfirmedAllTime = myItems.filter((i) => i.confirmation_status === 'confirmed').length;
    const attendanceRate =
      monthItems.length > 0
        ? `${Math.round((confirmedInMonth / monthItems.length) * 100)}%`
        : myItems.length > 0
          ? `${Math.round((totalConfirmedAllTime / myItems.length) * 100)}%`
          : '0%';

    sendJson(res, 200, {
      ok: true,
      schedules: myItems,
      swaps: mySwaps,
      candidates: candidates
        .filter((c) => c.id !== req.user.id)
        .map((c) => ({
          id: c.id,
          full_name: c.full_name,
          title: c.title,
          whatsapp: c.whatsapp,
          skills: c.skills
        })),
      stats: {
        monthSchedules: monthItems.length,
        confirmedSchedules: confirmedInMonth,
        totalSchedulesAllTime: myItems.length,
        attendanceRate,
        swapsDone: mySwaps.filter((s) => s.requester_id === req.user.id).length,
        calendarSync: Boolean(req.user.calendar_sync)
      }
    });
  },

  async exportIcs(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const myItems = await ScheduleModel.getSchedulesForUser(req.user.id);
    const icsContent = ScheduleModel.generateIcsFeed(myItems, req.user);
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="louvorapp-minhas-escalas.ics"',
      'Cache-Control': 'no-store'
    });
    res.end(icsContent);
  },

  async getOne(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const schedule = await ScheduleModel.getById(req.params.id);
    if (!schedule) {
      const err = new Error('Escala não encontrada.');
      err.status = 404;
      throw err;
    }
    sendJson(res, 200, { ok: true, schedule });
  },

  async create(req, res) {
    await requirePermission(req, 'schedules', 'create');
    if (!req.body.title || !req.body.event_date) {
      const err = new Error('Título e data do evento são obrigatórios.');
      err.status = 400;
      throw err;
    }
    const created = await ScheduleModel.createSchedule(req.body, req.user.id);
    await AuditService.record(
      req,
      'CREATE_SCHEDULE',
      'schedule',
      created.id,
      `Criou escala/evento: ${created.title} (${created.event_date})`
    );
    sendJson(res, 201, {
      ok: true,
      message: 'Evento / Escala criado com sucesso!',
      schedule: created
    });
  },

  async update(req, res) {
    await requirePermission(req, 'schedules', 'edit');
    const updated = await ScheduleModel.updateSchedule(req.params.id, req.body);
    if (!updated) {
      const err = new Error('Escala não encontrada.');
      err.status = 404;
      throw err;
    }
    await AuditService.record(
      req,
      'UPDATE_SCHEDULE',
      'schedule',
      updated.id,
      `Atualizou escala/evento: ${updated.title} (${updated.event_date})`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Escala atualizada com sucesso!',
      schedule: updated
    });
  },

  async remove(req, res) {
    await requirePermission(req, 'schedules', 'delete');
    const existing = await ScheduleModel.getById(req.params.id);
    if (!existing) {
      const err = new Error('Escala não encontrada.');
      err.status = 404;
      throw err;
    }
    await ScheduleModel.deleteSchedule(req.params.id);
    await AuditService.record(
      req,
      'DELETE_SCHEDULE',
      'schedule',
      req.params.id,
      `Excluiu escala/evento: ${existing.title} (${existing.event_date})`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Evento / Escala excluído com sucesso!'
    });
  },

  async addMember(req, res) {
    await requirePermission(req, 'schedules', 'edit');
    if (!req.body.user_id) {
      const err = new Error('Selecione um membro para escalar.');
      err.status = 400;
      throw err;
    }
    const updated = await ScheduleModel.addMemberToSchedule(req.params.id, req.body);
    await AuditService.record(
      req,
      'ADD_SCHEDULE_MEMBER',
      'schedule',
      req.params.id,
      `Adicionou membro ID ${req.body.user_id} na escala ${req.params.id}`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Membro adicionado à escala!',
      schedule: updated
    });
  },

  async removeMember(req, res) {
    await requirePermission(req, 'schedules', 'edit');
    const updated = await ScheduleModel.removeMemberFromSchedule(req.params.id, req.params.memberId);
    await AuditService.record(
      req,
      'REMOVE_SCHEDULE_MEMBER',
      'schedule',
      req.params.id,
      `Removeu item de membro ${req.params.memberId} da escala ${req.params.id}`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Membro removido da escala!',
      schedule: updated
    });
  },

  async respondAttendance(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const status = req.body.status === 'declined' ? 'declined' : 'confirmed';
    const updated = await ScheduleModel.updateMemberAttendance(req.params.id, req.user.id, status);
    if (!updated) {
      const err = new Error('Você não está vinculado a esta escala.');
      err.status = 404;
      throw err;
    }
    await UserModel.notifyAllAdmins({
      title: status === 'confirmed' ? 'Presença Confirmada' : 'Indisponibilidade Informada',
      message: `${req.user.full_name} marcou '${status === 'confirmed' ? 'Confirmado' : 'Não poderei'}' na escala #${req.params.id}.`,
      type: 'schedule'
    });
    sendJson(res, 200, {
      ok: true,
      message: status === 'confirmed'
        ? 'Escala confirmada! A liderança foi notificada.'
        : 'Ausência registrada. Solicite uma troca ou avise a liderança.',
      member: updated
    });
  },

  async notifyTeam(req, res) {
    await requirePermission(req, 'schedules', 'view');
    const schedule = await ScheduleModel.getById(req.params.id);
    if (!schedule) {
      const err = new Error('Escala não encontrada.');
      err.status = 404;
      throw err;
    }
    for (const m of schedule.members || []) {
      await UserModel.createNotification({
        user_id: m.user_id,
        title: `Lembrete de Escala: ${schedule.title}`,
        message: `Passagem de som às ${schedule.soundcheck_time} em ${schedule.location}. Repertório com ${(schedule.songs || []).length} músicas.`,
        type: 'schedule'
      });
    }
    await AuditService.record(
      req,
      'NOTIFY_TEAM',
      'schedule',
      schedule.id,
      `Disparou alerta para ${(schedule.members || []).length} integrantes de ${schedule.title}`
    );
    sendJson(res, 200, {
      ok: true,
      message: `Notificação enviada para ${(schedule.members || []).length} integrantes da escala!`
    });
  }
};

module.exports = ScheduleController;
