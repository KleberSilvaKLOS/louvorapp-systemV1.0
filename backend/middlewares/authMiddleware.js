const AuthService = require('../services/authService');

function parseCookies(cookieHeader = '') {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = decodeURIComponent(pair.slice(idx + 1).trim());
    cookies[k] = v;
  }
  return cookies;
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers['cookie']);
  if (cookies.louvorapp_token) {
    return cookies.louvorapp_token;
  }
  return null;
}

/**
 * Middleware de autenticação obrigatória no backend.
 * Valida o token de sessão no banco de dados e injeta req.user e req.token.
 */
async function requireAuth(req, res) {
  const token = extractToken(req);
  if (!token) {
    const err = new Error('Não autenticado. Faça login para acessar este recurso.');
    err.status = 401;
    throw err;
  }

  const user = await AuthService.getSessionUser(token);
  if (!user) {
    const err = new Error('Sessão inválida ou expirada. Faça login novamente.');
    err.status = 401;
    throw err;
  }

  req.user = user;
  req.token = token;
  return user;
}

module.exports = {
  extractToken,
  parseCookies,
  requireAuth
};
