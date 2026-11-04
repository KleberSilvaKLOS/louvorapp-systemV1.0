const SettingsModel = require('../models/SettingsModel');
const PermissionModel = require('../models/PermissionModel');
const AuthService = require('../services/authService');
const AuditService = require('../services/auditService');
const { requireAdmin, requirePermission } = require('../middlewares/permissionMiddleware');
const { sendJson } = require('../middlewares/errorMiddleware');

const SettingsController = {
  async getPublicInfo(req, res) {
    const settings = await SettingsModel.getAllSettings();
    sendJson(res, 200, {
      ok: true,
      ministry_name: settings.ministry_name || 'Ministério de Louvor & Adoração',
      current_campus: settings.current_campus || 'Campus Central',
      next_rehearsal_banner: settings.next_rehearsal_banner || 'Consulte o Calendário|Cadastre-se para ver os próximos ensaios e cultos'
    });
  },

  async getAll(req, res) {
    await requireAdmin(req);
    await requirePermission(req, 'settings', 'view');
    const [settings, permissions, auditLogs] = await Promise.all([
      SettingsModel.getAllSettings(),
      PermissionModel.getAllPermissions(),
      SettingsModel.getAuditLogs(60)
    ]);
    sendJson(res, 200, {
      ok: true,
      settings,
      permissions,
      auditLogs
    });
  },

  async updateSettings(req, res) {
    // Exige obrigatoriamente perfil ADMIN estrito (impede escalada de privilégio via ADMIN_EMAILS)
    await requireAdmin(req);
    await requirePermission(req, 'settings', 'edit');
    const updated = await SettingsModel.updateSettings(req.body, req.user.id);
    AuthService.invalidateSessionCache();
    await AuditService.record(
      req,
      'UPDATE_SYSTEM_SETTINGS',
      'settings',
      'global',
      `Atualizou parâmetros do sistema: ${Object.keys(req.body).join(', ')}`
    );
    sendJson(res, 200, {
      ok: true,
      message: 'Configurações do sistema salvas com sucesso!',
      settings: updated
    });
  },

  async updatePermissions(req, res) {
    await requireAdmin(req);
    await requirePermission(req, 'settings', 'edit');
    const { role, module, flags } = req.body;
    if (!role || !module || !flags) {
      const err = new Error('Informe perfil, módulo e permissões.');
      err.status = 400;
      throw err;
    }
    const updated = await PermissionModel.updatePermission(role, module, flags);
    if (!updated) {
      const err = new Error('Módulo de permissão não encontrado.');
      err.status = 404;
      throw err;
    }
    AuthService.invalidateSessionCache();
    await AuditService.record(
      req,
      'UPDATE_ROLE_PERMISSION',
      'role_permission',
      `${role}:${module}`,
      `Atualizou permissões de ${role} em ${module}: ${JSON.stringify(flags)}`
    );
    const allPermissions = await PermissionModel.getAllPermissions();
    sendJson(res, 200, {
      ok: true,
      message: `Permissões do perfil ${role} para "${updated.module_label}" atualizadas!`,
      permission: updated,
      permissions: allPermissions
    });
  }
};

module.exports = SettingsController;
