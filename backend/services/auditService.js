const SettingsModel = require('../models/SettingsModel');

const AuditService = {
  async record(req, action, targetType, targetId, details) {
    const user = (req && req.user) || {};
    const headers = (req && req.headers) || {};
    const ip = headers['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
    return SettingsModel.logAudit({
      user_id: user.id || null,
      user_email: user.email || 'anonymous',
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: String(ip)
    });
  }
};

module.exports = AuditService;
