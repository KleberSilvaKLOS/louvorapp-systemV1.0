const db = require('../config/database');
const config = require('../config/env');

const SettingsModel = {
  async getAllSettings() {
    const rows = await db.all('SELECT * FROM system_settings ORDER BY setting_key ASC');
    const settings = {};
    for (const r of rows) {
      settings[r.setting_key] = r.setting_value;
    }
    settings.ADMIN_EMAILS = config.ADMIN_EMAILS;
    return settings;
  },

  async updateSettings(updates, userId) {
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'ADMIN_EMAILS') {
        const list = Array.isArray(val)
          ? val
          : String(val)
              .split(',')
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
        config.ADMIN_EMAILS = Array.from(new Set(list));
        await db.run(
          `INSERT INTO system_settings (setting_key, setting_value, description, updated_by, updated_at)
           VALUES ('admin_emails_override', ?, 'Lista de e-mails ADMIN autorizados', ?, datetime('now'))
           ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
          [config.ADMIN_EMAILS.join(','), userId]
        );
        // Sincroniza automaticamente usuários existentes cujo e-mail está na lista ADMIN_EMAILS
        for (const adminEmail of config.ADMIN_EMAILS) {
          await db.run("UPDATE users SET role = 'ADMIN' WHERE LOWER(email) = LOWER(?)", [adminEmail]);
        }
        continue;
      }

      await db.run(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
        [key, String(val), userId]
      );
    }
    return this.getAllSettings();
  },

  async logAudit({ user_id = null, user_email = '', action, target_type, target_id = '', details = '', ip_address = '' }) {
    return db.run(
      `INSERT INTO audit_logs (user_id, user_email, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, user_email, action, target_type, String(target_id), details, ip_address]
    );
  },

  async getAuditLogs(limit = 50) {
    return db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]);
  }
};

module.exports = SettingsModel;
