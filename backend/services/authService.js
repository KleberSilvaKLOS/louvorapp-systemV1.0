const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../config/database');
const config = require('../config/env');
const UserModel = require('../models/UserModel');
const PermissionModel = require('../models/PermissionModel');
const SettingsModel = require('../models/SettingsModel');

const scryptAsync = promisify(crypto.scrypt);
const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 15 * 1000;

const AuthService = {
  invalidateSessionCache(token = null, userId = null) {
    if (token) {
      sessionCache.delete(token);
    }
    if (userId) {
      for (const [k, v] of sessionCache.entries()) {
        if (v.user && v.user.id === userId) {
          sessionCache.delete(k);
        }
      }
    }
    if (!token && !userId) {
      sessionCache.clear();
    }
  },

  async hashPasswordAsync(password, customSalt = null) {
    const salt = customSalt || crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(String(password), salt, 64);
    return `scrypt$${salt}$${derived.toString('hex')}`;
  },

  // Mantém compatibilidade caso algum script síncrono chame hashPasswordSync
  hashPasswordSync(password, customSalt = null) {
    const salt = customSalt || crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  },

  async hashPassword(password, customSalt = null) {
    return this.hashPasswordAsync(password, customSalt);
  },

  async verifyPasswordAsync(password, storedHash) {
    if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHex] = parts;
    const derivedBuf = await scryptAsync(String(password), salt, 64);
    const a = Buffer.from(originalHex, 'hex');
    if (a.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(a, derivedBuf);
  },

  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email || '').trim());
  },

  createSignedToken(sessionId, userId) {
    const payload = `${sessionId}.${userId}.${crypto.randomBytes(24).toString('hex')}`;
    const sig = crypto
      .createHmac('sha256', config.sessionSecret)
      .update(payload)
      .digest('hex');
    return `${payload}.${sig}`;
  },

  verifyTokenSignature(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 4) return false;
    const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const expectedSig = crypto
      .createHmac('sha256', config.sessionSecret)
      .update(payload)
      .digest('hex');
    const a = Buffer.from(parts[3]);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  },

  async createSession(userId, ipAddress = '', userAgent = '') {
    const tempToken = crypto.randomBytes(32).toString('hex');
    const expiresDate = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000).toISOString();
    const res = await db.run(
      'INSERT INTO sessions (token, user_id, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
      [tempToken, userId, ipAddress, userAgent, expiresDate]
    );
    const finalToken = this.createSignedToken(res.lastID, userId);
    await db.run('UPDATE sessions SET token = ? WHERE id = ?', [finalToken, res.lastID]);
    return { token: finalToken, expires_at: expiresDate };
  },

  async getSessionUser(token) {
    if (!token || !this.verifyTokenSignature(token)) return null;

    const cached = sessionCache.get(token);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.user;
    }

    const session = await db.get(
      "SELECT * FROM sessions WHERE token = ? AND datetime(expires_at) > datetime('now')",
      [token]
    );
    if (!session) return null;
    const user = await UserModel.findById(session.user_id);
    if (!user || user.status !== 'active') {
      sessionCache.delete(token);
      return null;
    }
    const permissions = await PermissionModel.getPermissionsByRole(user.role);
    const enrichedUser = {
      ...UserModel.sanitize(user),
      permissions
    };
    sessionCache.set(token, { user: enrichedUser, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
    return enrichedUser;
  },

  async register({ fullName, email, whatsapp, password, roles = ['vocal', 'violao'], notifEnabled = true }, ipAddress = '', userAgent = '') {
    const cleanName = String(fullName || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanWhatsapp = String(whatsapp || '').trim();

    if (!cleanName || cleanName.length < 3) {
      const err = new Error('Informe seu nome completo (mínimo 3 caracteres).');
      err.status = 400;
      throw err;
    }
    if (!this.validateEmail(cleanEmail)) {
      const err = new Error('Informe um endereço de e-mail válido.');
      err.status = 400;
      throw err;
    }
    if (!cleanWhatsapp || cleanWhatsapp.replace(/\D/g, '').length < 8) {
      const err = new Error('Informe um telefone/WhatsApp válido com DDD.');
      err.status = 400;
      throw err;
    }
    if (!password || String(password).length < 6) {
      const err = new Error('A senha deve possuir pelo menos 6 caracteres.');
      err.status = 400;
      throw err;
    }

    const existing = await UserModel.findByEmail(cleanEmail);
    if (existing) {
      const err = new Error('Este e-mail já está cadastrado no sistema.');
      err.status = 409;
      throw err;
    }

    const assignedRole = config.isEmailAuthorizedAdmin(cleanEmail) ? 'ADMIN' : 'USER';
    const passwordHash = await this.hashPasswordAsync(password);

    const roleTitles = {
      vocal: 'Vocalista & Backing',
      violao: 'Violão & Harmonia',
      guitarra: 'Guitarrista',
      teclado: 'Teclado & Synth',
      baixo: 'Contrabaixista',
      bateria: 'Baterista'
    };
    const primaryRole = Array.isArray(roles) && roles.length > 0 ? roles[0] : 'vocal';
    const title = assignedRole === 'ADMIN'
      ? 'Líder / Coordenador'
      : (roleTitles[primaryRole] || 'Membro do Ministério');

    const newUser = await UserModel.createUser({
      full_name: cleanName,
      email: cleanEmail,
      whatsapp: cleanWhatsapp,
      password_hash: passwordHash,
      role: assignedRole,
      notif_convocacoes: notifEnabled ? 1 : 0,
      title,
      team_badge: assignedRole === 'ADMIN' ? 'Líder • Admin' : 'Novo Membro'
    });

    await UserModel.setUserSkills(newUser.id, Array.isArray(roles) && roles.length > 0 ? roles : ['vocal']);

    await SettingsModel.logAudit({
      user_id: newUser.id,
      user_email: newUser.email,
      action: 'USER_REGISTER',
      target_type: 'user',
      target_id: newUser.id,
      details: `Cadastro realizado com perfil automático ${assignedRole} (Funções: ${(roles || []).join(', ')})`,
      ip_address: ipAddress
    });

    const session = await this.createSession(newUser.id, ipAddress, userAgent);
    const fullUser = await this.getSessionUser(session.token);
    return { user: fullUser, token: session.token, expires_at: session.expires_at };
  },

  async login({ email, password }, ipAddress = '', userAgent = '') {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      const err = new Error('Informe e-mail e senha para entrar.');
      err.status = 400;
      throw err;
    }

    const user = await UserModel.findByEmail(cleanEmail);
    const isValid = user ? await this.verifyPasswordAsync(password, user.password_hash) : false;
    if (!user || !isValid) {
      const err = new Error('E-mail ou senha inválidos.');
      err.status = 401;
      throw err;
    }

    if (user.status !== 'active') {
      const err = new Error('Sua conta está temporariamente inativa. Contate a liderança.');
      err.status = 403;
      throw err;
    }

    if (config.isEmailAuthorizedAdmin(cleanEmail) && user.role !== 'ADMIN') {
      await db.run("UPDATE users SET role = 'ADMIN' WHERE id = ?", [user.id]);
      this.invalidateSessionCache(null, user.id);
    }

    const session = await this.createSession(user.id, ipAddress, userAgent);
    const fullUser = await this.getSessionUser(session.token);
    return { user: fullUser, token: session.token, expires_at: session.expires_at };
  },

  async logout(token) {
    if (!token) return;
    this.invalidateSessionCache(token);
    await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  },

  async requestPasswordReset(email, ipAddress = '') {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!this.validateEmail(cleanEmail)) {
      const err = new Error('Informe um e-mail válido para recuperação.');
      err.status = 400;
      throw err;
    }

    const user = await UserModel.findByEmail(cleanEmail);
    if (!user) {
      // Resposta uniforme para evitar enumeração e jamais vazar código na API
      return {
        ok: true,
        message: 'Se o e-mail estiver cadastrado, o código de verificação foi enviado.'
      };
    }

    const resetCode = String(crypto.randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetCode, expires, user.id]
    );

    await SettingsModel.logAudit({
      user_id: user.id,
      user_email: user.email,
      action: 'PASSWORD_RESET_REQUEST',
      target_type: 'user',
      target_id: user.id,
      details: 'Solicitou código de recuperação de senha',
      ip_address: ipAddress
    });

    // O código NUNCA é retornado no JSON da API HTTP (corrige CVSS 9.8)
    return {
      ok: true,
      message: 'Se o e-mail estiver cadastrado, o código de verificação foi enviado.'
    };
  },

  async resetPassword({ email, code, newPassword }, ipAddress = '') {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = await UserModel.findByEmail(cleanEmail);
    if (!user) {
      const err = new Error('Código de recuperação inválido ou expirado.');
      err.status = 400;
      throw err;
    }

    const providedCode = String(code || '').trim();
    const storedCode = String(user.reset_token || '');
    const isExpired =
      !user.reset_token_expires || new Date(user.reset_token_expires).getTime() < Date.now();

    let codeMatch = false;
    if (storedCode && providedCode.length === storedCode.length) {
      codeMatch = crypto.timingSafeEqual(Buffer.from(providedCode), Buffer.from(storedCode));
    }

    if (!storedCode || !codeMatch || isExpired) {
      const err = new Error('Código de recuperação inválido ou expirado.');
      err.status = 400;
      throw err;
    }

    if (!newPassword || String(newPassword).length < 6) {
      const err = new Error('A nova senha deve ter pelo menos 6 caracteres.');
      err.status = 400;
      throw err;
    }

    const newHash = await this.hashPasswordAsync(newPassword);
    await db.transaction([
      {
        sql: `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?`,
        params: [newHash, user.id]
      },
      {
        sql: 'DELETE FROM sessions WHERE user_id = ?',
        params: [user.id]
      }
    ]);
    this.invalidateSessionCache(null, user.id);

    await SettingsModel.logAudit({
      user_id: user.id,
      user_email: user.email,
      action: 'PASSWORD_RESET_COMPLETE',
      target_type: 'user',
      target_id: user.id,
      details: 'Senha redefinida com sucesso e sessões anteriores invalidadas',
      ip_address: ipAddress
    });

    return { ok: true, message: 'Senha redefinida com sucesso! Você já pode fazer login.' };
  },

  async changePassword(userId, { currentPassword, newPassword }, currentToken = null) {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      const err = new Error('Usuário não encontrado.');
      err.status = 404;
      throw err;
    }
    const isValid = await this.verifyPasswordAsync(currentPassword, user.password_hash);
    if (!isValid) {
      const err = new Error('A senha atual informada está incorreta.');
      err.status = 400;
      throw err;
    }
    if (!newPassword || String(newPassword).length < 6) {
      const err = new Error('A nova senha deve possuir no mínimo 6 caracteres.');
      err.status = 400;
      throw err;
    }
    const newHash = await this.hashPasswordAsync(newPassword);
    await db.run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [newHash, userId]);
    if (currentToken) {
      await db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [userId, currentToken]);
    } else {
      await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    }
    this.invalidateSessionCache(null, userId);
    return { ok: true };
  }
};

module.exports = AuthService;
