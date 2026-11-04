const AuthService = require('../services/authService');
const AuditService = require('../services/auditService');
const config = require('../config/env');
const { sendJson } = require('../middlewares/errorMiddleware');

function getClientIp(req) {
  if (config.trustProxy) {
    const realIp = req.headers['x-real-ip'];
    if (realIp) return String(realIp).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function buildAuthCookie(req, token, maxAgeSeconds) {
  const isSecure =
    config.nodeEnv === 'production' || req.headers['x-forwarded-proto'] === 'https';
  const secureAttr = isSecure ? '; Secure' : '';
  return `louvorapp_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureAttr}`;
}

const AuthController = {
  async register(req, res) {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const result = await AuthService.register(req.body, ip, ua);
    const maxAge = config.sessionTtlHours * 3600;
    sendJson(
      res,
      201,
      {
        ok: true,
        message: 'Cadastro realizado com sucesso!',
        user: result.user,
        token: result.token,
        expires_at: result.expires_at
      },
      { 'Set-Cookie': buildAuthCookie(req, result.token, maxAge) }
    );
  },

  async login(req, res) {
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const result = await AuthService.login(req.body, ip, ua);
    const maxAge = config.sessionTtlHours * 3600;
    req.user = result.user;
    await AuditService.record(
      req,
      'USER_LOGIN',
      'session',
      result.user.id,
      `Login efetuado (${result.user.role})`
    );
    sendJson(
      res,
      200,
      {
        ok: true,
        message: 'Autenticado com sucesso!',
        user: result.user,
        token: result.token,
        expires_at: result.expires_at
      },
      { 'Set-Cookie': buildAuthCookie(req, result.token, maxAge) }
    );
  },

  async logout(req, res) {
    await AuthService.logout(req.token);
    sendJson(
      res,
      200,
      { ok: true, message: 'Sessão encerrada com segurança.' },
      { 'Set-Cookie': 'louvorapp_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' }
    );
  },

  async me(req, res) {
    sendJson(res, 200, {
      ok: true,
      user: req.user
    });
  },

  async forgotPassword(req, res) {
    const ip = getClientIp(req);
    const info = await AuthService.requestPasswordReset(req.body.email, ip);
    sendJson(res, 200, info);
  },

  async resetPassword(req, res) {
    const ip = getClientIp(req);
    const result = await AuthService.resetPassword(req.body, ip);
    sendJson(res, 200, result);
  },

  async changePassword(req, res) {
    await AuthService.changePassword(req.user.id, req.body, req.token);
    await AuditService.record(req, 'CHANGE_PASSWORD', 'user', req.user.id, 'Alterou a própria senha');
    sendJson(res, 200, {
      ok: true,
      message: 'Senha atualizada com sucesso!'
    });
  }
};

module.exports = AuthController;
