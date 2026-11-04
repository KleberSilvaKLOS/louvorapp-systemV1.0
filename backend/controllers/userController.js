const db = require('../config/database');
const UserModel = require('../models/UserModel');
const PermissionModel = require('../models/PermissionModel');
const SettingsModel = require('../models/SettingsModel');
const AuthService = require('../services/authService');
const AuditService = require('../services/auditService');
const { requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const UserController = {
  async getMyProfile(req, res) {
    await requirePermission(req, 'profile', 'view');
    await UserModel.recalculateUserStats(req.user.id);
    const [user, notifications, settings, swapsCountRow] = await Promise.all([
      UserModel.findById(req.user.id),
      UserModel.getNotifications(req.user.id),
      SettingsModel.getAllSettings(),
      db.get('SELECT COUNT(*) as count FROM swap_requests WHERE requester_id = ?', [req.user.id])
    ]);
    const permissions = await PermissionModel.getPermissionsByRole(user.role);
    sendJson(res, 200, {
      ok: true,
      user: {
        ...UserModel.sanitize(user),
        swaps_requested_count: (swapsCountRow && swapsCountRow.count) || 0,
        permissions
      },
      notifications,
      settings
    });
  },

  async updateMyProfile(req, res) {
    await requirePermission(req, 'profile', 'edit');

    if (req.body.role !== undefined && req.body.role !== req.user.role) {
      const err = new Error('Operação bloqueada: usuários não podem alterar o próprio nível de acesso.');
      err.status = 403;
      throw err;
    }

    const updated = await UserModel.updateProfile(req.user.id, req.body);
    AuthService.invalidateSessionCache(null, req.user.id);
    const permissions = await PermissionModel.getPermissionsByRole(updated.role);
    const swapsCountRow = await db.get('SELECT COUNT(*) as count FROM swap_requests WHERE requester_id = ?', [req.user.id]);
    sendJson(res, 200, {
      ok: true,
      message: 'Preferência atualizada com sucesso!',
      user: {
        ...UserModel.sanitize(updated),
        swaps_requested_count: (swapsCountRow && swapsCountRow.count) || 0,
        permissions
      }
    });
  },

  async listUnavailabilities(req, res) {
    await requirePermission(req, 'profile', 'view');
    if (req.query.date || req.query.all === '1') {
      const unavailabilities = await UserModel.getAllUnavailabilities({ date: req.query.date || '' });
      return sendJson(res, 200, { ok: true, unavailabilities });
    }
    const unavailabilities = await UserModel.getUserUnavailabilities(req.user.id);
    sendJson(res, 200, { ok: true, unavailabilities });
  },

  async addMyUnavailability(req, res) {
    await requirePermission(req, 'profile', 'edit');
    const targetUserId =
      req.user.role === 'ADMIN' && req.body.user_id ? parseInt(req.body.user_id, 10) : req.user.id;
    const created = await UserModel.addUnavailability(targetUserId, {
      start_date: req.body.start_date,
      end_date: req.body.end_date || req.body.start_date,
      reason: req.body.reason
    });
    const unavailabilities = await UserModel.getUserUnavailabilities(targetUserId);
    sendJson(res, 201, {
      ok: true,
      message: 'Período de indisponibilidade registrado! O sistema bloqueará escalas nestas datas.',
      unavailability: created,
      unavailabilities
    });
  },

  async deleteMyUnavailability(req, res) {
    await requirePermission(req, 'profile', 'edit');
    const id = parseInt(req.params.unavailabilityId, 10);
    await UserModel.removeUnavailability(id, req.user.id, req.user.role === 'ADMIN');
    const unavailabilities = await UserModel.getUserUnavailabilities(req.user.id);
    sendJson(res, 200, {
      ok: true,
      message: 'Período de indisponibilidade removido.',
      unavailabilities
    });
  },

  async addMySkill(req, res) {
    await requirePermission(req, 'profile', 'edit');
    if (!req.body.skill_name && !req.body.role_key) {
      const err = new Error('Informe o nome da função, voz ou instrumento.');
      err.status = 400;
      throw err;
    }
    const skill = await UserModel.addSkill(req.user.id, req.body);
    AuthService.invalidateSessionCache(null, req.user.id);
    const skills = await UserModel.getUserSkills(req.user.id);
    sendJson(res, 201, {
      ok: true,
      message: 'Habilidade adicionada com sucesso!',
      skill,
      skills
    });
  },

  async updateMySkill(req, res) {
    await requirePermission(req, 'profile', 'edit');
    const updated = await UserModel.updateSkill(req.params.skillId, req.user.id, req.body);
    if (!updated) {
      const err = new Error('Habilidade não encontrada.');
      err.status = 404;
      throw err;
    }
    AuthService.invalidateSessionCache(null, req.user.id);
    const skills = await UserModel.getUserSkills(req.user.id);
    sendJson(res, 200, {
      ok: true,
      message: 'Habilidade atualizada!',
      skill: updated,
      skills
    });
  },

  async deleteMySkill(req, res) {
    await requirePermission(req, 'profile', 'edit');
    await UserModel.deleteSkill(req.params.skillId, req.user.id);
    AuthService.invalidateSessionCache(null, req.user.id);
    const skills = await UserModel.getUserSkills(req.user.id);
    sendJson(res, 200, {
      ok: true,
      message: 'Habilidade removida!',
      skills
    });
  },

  async listNotifications(req, res) {
    const notifications = await UserModel.getNotifications(req.user.id);
    sendJson(res, 200, { ok: true, notifications });
  },

  async markNotificationsRead(req, res) {
    await UserModel.markNotificationsRead(req.user.id);
    const notifications = await UserModel.getNotifications(req.user.id);
    sendJson(res, 200, { ok: true, message: 'Notificações marcadas como lidas.', notifications });
  },

  async listAllUsers(req, res) {
    await requirePermission(req, 'users', 'view');
    const users = await UserModel.getAll({
      search: req.query.search || '',
      role: req.query.role || '',
      status: req.query.status || ''
    });
    sendJson(res, 200, { ok: true, users });
  },

  async adminCreateUser(req, res) {
    await requirePermission(req, 'users', 'create');
    const { full_name, email, whatsapp, password, role = 'USER', title, campus, roles = ['vocal'] } = req.body;
    if (!full_name || !email || !whatsapp || !password) {
      const err = new Error('Preencha nome, e-mail, WhatsApp e senha.');
      err.status = 400;
      throw err;
    }
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      const err = new Error('Já existe um usuário com este e-mail.');
      err.status = 409;
      throw err;
    }
    const passwordHash = await AuthService.hashPasswordAsync(password);
    const created = await UserModel.createUser({
      full_name,
      email,
      whatsapp,
      password_hash: passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
      title: title || 'Membro do Ministério',
      campus: campus || 'Campus Central',
      team_badge: role === 'ADMIN' ? 'Líder • Admin' : 'Novo Membro'
    });
    await UserModel.setUserSkills(created.id, Array.isArray(roles) ? roles : ['vocal']);
    await AuditService.record(
      req,
      'ADMIN_CREATE_USER',
      'user',
      created.id,
      `Criou usuário ${created.email} com perfil ${created.role}`
    );
    sendJson(res, 201, {
      ok: true,
      message: 'Usuário cadastrado com sucesso!',
      user: UserModel.sanitize(await UserModel.findById(created.id))
    });
  },

  async adminUpdateUser(req, res) {
    await requirePermission(req, 'users', 'edit');
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.user.id && req.body.role && req.body.role !== req.user.role) {
      const err = new Error('Você não pode alterar seu próprio nível de acesso.');
      err.status = 403;
      throw err;
    }

    const updated = await UserModel.updateRoleOrStatusByAdmin(targetId, req.body);
    if (!updated) {
      const err = new Error('Usuário não encontrado.');
      err.status = 404;
      throw err;
    }
    AuthService.invalidateSessionCache(null, targetId);

    await AuditService.record(
      req,
      'ADMIN_UPDATE_USER',
      'user',
      updated.id,
      `Atualizou usuário ${updated.email} (role=${updated.role}, status=${updated.status})`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Dados e permissões do usuário atualizados!',
      user: UserModel.sanitize(updated)
    });
  },

  async adminDeleteUser(req, res) {
    await requirePermission(req, 'users', 'delete');
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      const err = new Error('Você não pode excluir sua própria conta ativa.');
      err.status = 400;
      throw err;
    }
    const existing = await UserModel.findById(targetId);
    if (!existing) {
      const err = new Error('Usuário não encontrado.');
      err.status = 404;
      throw err;
    }
    await UserModel.deleteUser(targetId);
    AuthService.invalidateSessionCache(null, targetId);
    await AuditService.record(
      req,
      'ADMIN_DELETE_USER',
      'user',
      targetId,
      `Excluiu usuário ${existing.email}`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Usuário removido do sistema.'
    });
  }
};

module.exports = UserController;
