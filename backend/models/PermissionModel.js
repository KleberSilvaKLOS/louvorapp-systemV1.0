const db = require('../config/database');

const rolePermCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

const PermissionModel = {
  invalidateCache() {
    rolePermCache.clear();
  },

  async getAllPermissions() {
    return db.all('SELECT * FROM role_permissions ORDER BY role ASC, id ASC');
  },

  async getPermissionsByRole(role) {
    const cached = rolePermCache.get(role);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const rows = await db.all('SELECT * FROM role_permissions WHERE role = ? ORDER BY id ASC', [role]);
    const map = {};
    for (const r of rows) {
      map[r.module] = {
        module: r.module,
        module_label: r.module_label,
        can_view: Boolean(r.can_view),
        can_create: Boolean(r.can_create),
        can_edit: Boolean(r.can_edit),
        can_delete: Boolean(r.can_delete),
        can_approve: Boolean(r.can_approve)
      };
    }
    rolePermCache.set(role, { data: map, expiresAt: Date.now() + CACHE_TTL_MS });
    return map;
  },

  async checkPermission(role, moduleName, action) {
    if (role === 'ADMIN') return true;
    const roleMap = await this.getPermissionsByRole(role);
    const mod = roleMap[moduleName];
    if (!mod) return false;
    return Boolean(mod[`can_${action}`]);
  },

  async updatePermission(role, moduleName, flags) {
    const current = await db.get(
      'SELECT * FROM role_permissions WHERE role = ? AND module = ?',
      [role, moduleName]
    );
    if (!current) return null;

    const isProtectedAdminModule = role === 'ADMIN' && (moduleName === 'settings' || moduleName === 'users');

    const can_view = isProtectedAdminModule ? 1 : (flags.can_view !== undefined ? (flags.can_view ? 1 : 0) : current.can_view);
    const can_create = isProtectedAdminModule ? 1 : (flags.can_create !== undefined ? (flags.can_create ? 1 : 0) : current.can_create);
    const can_edit = isProtectedAdminModule ? 1 : (flags.can_edit !== undefined ? (flags.can_edit ? 1 : 0) : current.can_edit);
    const can_delete = isProtectedAdminModule ? 1 : (flags.can_delete !== undefined ? (flags.can_delete ? 1 : 0) : current.can_delete);
    const can_approve = isProtectedAdminModule ? 1 : (flags.can_approve !== undefined ? (flags.can_approve ? 1 : 0) : current.can_approve);

    await db.run(
      `UPDATE role_permissions
       SET can_view = ?, can_create = ?, can_edit = ?, can_delete = ?, can_approve = ?, updated_at = datetime('now')
       WHERE role = ? AND module = ?`,
      [can_view, can_create, can_edit, can_delete, can_approve, role, moduleName]
    );
    this.invalidateCache();
    return db.get('SELECT * FROM role_permissions WHERE role = ? AND module = ?', [role, moduleName]);
  }
};

module.exports = PermissionModel;
