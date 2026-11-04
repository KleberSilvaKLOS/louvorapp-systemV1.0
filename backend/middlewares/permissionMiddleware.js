const PermissionModel = require('../models/PermissionModel');

/**
 * Validação obrigatória de permissões no backend.
 * Reutiliza req.user.permissions já carregado na sessão para evitar queries repetidas.
 */
async function requireAdmin(req) {
  if (!req.user || req.user.role !== 'ADMIN') {
    const err = new Error('Acesso negado: esta operação exige privilégios de Administrador (ADMIN).');
    err.status = 403;
    throw err;
  }
  return true;
}

async function requirePermission(req, moduleName, action) {
  if (!req.user) {
    const err = new Error('Não autenticado.');
    err.status = 401;
    throw err;
  }
  if (req.user.role === 'ADMIN') return true;

  const cachedMod = req.user.permissions && req.user.permissions[moduleName];
  const allowed = cachedMod
    ? Boolean(cachedMod[`can_${action}`])
    : await PermissionModel.checkPermission(req.user.role, moduleName, action);

  if (!allowed) {
    const err = new Error(
      `Acesso negado: seu perfil (${req.user.role}) não possui permissão para '${action}' no módulo '${moduleName}'.`
    );
    err.status = 403;
    throw err;
  }
  return true;
}

module.exports = {
  requireAdmin,
  requirePermission
};
