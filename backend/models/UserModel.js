const db = require('../config/database');

const MAX_AVATAR_LENGTH = 200 * 1024; // Máximo ~150KB em Base64
const DATA_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

const UserModel = {
  async findByEmail(email) {
    return db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [String(email || '').trim()]);
  },

  async findById(id) {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return null;
    user.skills = await this.getUserSkills(user.id);
    return user;
  },

  async getAll({ search = '', role = '', status = '' } = {}) {
    let sql =
      'SELECT id, full_name, email, whatsapp, role, status, avatar_url, team_badge, schedule_badge, title, campus, favorite_services, favorite_frequency_badge, desired_frequency, recurring_restriction, notif_convocacoes, notif_ensaios, notif_enquetes, notif_trocas, calendar_sync, completed_schedules_count, attendance_rate, first_access_completed, created_at FROM users WHERE 1=1';
    const params = [];
    if (search) {
      sql += ' AND (LOWER(full_name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) OR LOWER(title) LIKE LOWER(?))';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY role ASC, full_name ASC';

    const users = await db.all(sql, params);
    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      const placeholders = userIds.map(() => '?').join(',');
      const allSkills = await db.all(
        `SELECT * FROM user_skills WHERE user_id IN (${placeholders}) ORDER BY id ASC`,
        userIds
      );
      const skillsByUser = new Map();
      for (const sk of allSkills) {
        if (!skillsByUser.has(sk.user_id)) skillsByUser.set(sk.user_id, []);
        skillsByUser.get(sk.user_id).push(sk);
      }
      for (const u of users) {
        u.skills = skillsByUser.get(u.id) || [];
      }
    }
    return users;
  },

  async getUserSkills(userId) {
    return db.all('SELECT * FROM user_skills WHERE user_id = ? ORDER BY id ASC', [userId]);
  },

  async createUser({
    full_name,
    email,
    whatsapp,
    password_hash,
    role,
    notif_convocacoes = 1,
    campus = 'Campus Central',
    title = 'Membro do Ministério',
    team_badge = 'Novo Membro'
  }) {
    const res = await db.run(
      `INSERT INTO users (
        full_name, email, whatsapp, password_hash, role, status, avatar_url,
        team_badge, schedule_badge, title, campus,
        favorite_services, favorite_frequency_badge, desired_frequency, recurring_restriction,
        notif_convocacoes, notif_ensaios, notif_enquetes, notif_trocas,
        calendar_sync, completed_schedules_count, attendance_rate, first_access_completed
      ) VALUES (?, ?, ?, ?, ?, 'active', '', ?, 'Sem escala', ?, ?, 'Não definido', '-', 'Não definida', 'Nenhuma restrição cadastrada', ?, ?, ?, ?, 0, 0, 0, 0)`,
      [
        full_name,
        email.trim().toLowerCase(),
        whatsapp,
        password_hash,
        role,
        team_badge,
        title,
        campus,
        notif_convocacoes ? 1 : 0,
        notif_convocacoes ? 1 : 0,
        notif_convocacoes ? 1 : 0,
        notif_convocacoes ? 1 : 0
      ]
    );
    return this.findById(res.lastID);
  },

  async setUserSkills(userId, rolesArray = []) {
    const roleMap = {
      vocal: { name: 'Vocal Solo & Backing', icon: 'mic', color: 'secondary', notes: 'Voz Principal & Harmonia Vocal' },
      violao: { name: 'Violão Acústico', icon: 'queue_music', color: 'tertiary', notes: 'Violão Aço & Base Harmônica' },
      guitarra: { name: 'Guitarra', icon: 'electric_bolt', color: 'primary', notes: 'Guitarra Base & Solo' },
      teclado: { name: 'Teclado & Synth', icon: 'piano', color: 'primary', notes: 'Piano & Worship Pads' },
      baixo: { name: 'Contrabaixo', icon: 'graphic_eq', color: 'secondary', notes: 'Contrabaixo 4/5 Cordas' },
      bateria: { name: 'Bateria Acústica', icon: 'album', color: 'primary', notes: 'Bateria / Metrônomo (In-Ear)' }
    };

    const statements = [{ sql: 'DELETE FROM user_skills WHERE user_id = ?', params: [userId] }];
    let idx = 0;
    for (const rKey of rolesArray) {
      const key = String(rKey).toLowerCase();
      const meta = roleMap[key] || { name: rKey, icon: 'music_note', color: 'primary', notes: 'Instrumento / Apoio' };
      const level = idx === 0 ? 'Principal' : idx === 1 ? 'Secundário' : 'Suporte';
      statements.push({
        sql: `INSERT INTO user_skills (user_id, role_key, skill_name, level_badge, equipment_notes, status, icon, color_variant)
              VALUES (?, ?, ?, ?, ?, 'Ativo', ?, ?)`,
        params: [userId, key, meta.name, level, meta.notes, meta.icon, meta.color]
      });
      idx++;
    }
    await db.transaction(statements);
    return this.getUserSkills(userId);
  },

  async addSkill(userId, { role_key = 'teclado', skill_name, level_badge = 'Principal', equipment_notes = '', status = 'Ativo', icon = 'music_note', color_variant = 'primary' }) {
    const res = await db.run(
      `INSERT INTO user_skills (user_id, role_key, skill_name, level_badge, equipment_notes, status, icon, color_variant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, role_key, skill_name, level_badge, equipment_notes, status, icon, color_variant]
    );
    return db.get('SELECT * FROM user_skills WHERE id = ?', [res.lastID]);
  },

  async updateSkill(skillId, userId, fields) {
    const skill = await db.get('SELECT * FROM user_skills WHERE id = ? AND user_id = ?', [skillId, userId]);
    if (!skill) return null;
    const skill_name = fields.skill_name !== undefined ? fields.skill_name : skill.skill_name;
    const level_badge = fields.level_badge !== undefined ? fields.level_badge : skill.level_badge;
    const equipment_notes = fields.equipment_notes !== undefined ? fields.equipment_notes : skill.equipment_notes;
    const status = fields.status !== undefined ? fields.status : skill.status;
    await db.run(
      `UPDATE user_skills SET skill_name = ?, level_badge = ?, equipment_notes = ?, status = ? WHERE id = ?`,
      [skill_name, level_badge, equipment_notes, status, skillId]
    );
    return db.get('SELECT * FROM user_skills WHERE id = ?', [skillId]);
  },

  async deleteSkill(skillId, userId) {
    return db.run('DELETE FROM user_skills WHERE id = ? AND user_id = ?', [skillId, userId]);
  },

  validateAvatarUrl(avatarUrl) {
    if (avatarUrl === '' || avatarUrl === null) return '';
    const str = String(avatarUrl).trim();
    if (str.length > MAX_AVATAR_LENGTH) {
      const err = new Error('A imagem de perfil excede o tamanho máximo permitido (150KB).');
      err.status = 400;
      throw err;
    }
    if (str.startsWith('/assets/images/')) return str;
    if (!DATA_IMAGE_REGEX.test(str)) {
      const err = new Error('Formato de imagem inválido. Envie uma imagem PNG, JPEG ou WebP válida.');
      err.status = 400;
      throw err;
    }
    return str;
  },

  async updateProfile(userId, data) {
    const current = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!current) return null;

    if (data.avatar_url !== undefined) {
      data.avatar_url = this.validateAvatarUrl(data.avatar_url);
    }

    const allowed = [
      'full_name', 'whatsapp', 'avatar_url', 'team_badge', 'schedule_badge', 'title', 'campus',
      'favorite_services', 'favorite_frequency_badge', 'desired_frequency', 'recurring_restriction',
      'notif_convocacoes', 'notif_ensaios', 'notif_enquetes', 'notif_trocas', 'calendar_sync',
      'first_access_completed'
    ];

    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        sets.push(`${key} = ?`);
        if (key.startsWith('notif_') || key === 'calendar_sync' || key === 'first_access_completed') {
          params.push(data[key] ? 1 : 0);
        } else {
          params.push(data[key]);
        }
      }
    }
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      params.push(userId);
      await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    return this.findById(userId);
  },

  async recalculateUserStats(userId) {
    const rows = await db.all('SELECT confirmation_status FROM schedule_members WHERE user_id = ?', [userId]);
    const total = rows.length;
    const confirmed = rows.filter((r) => r.confirmation_status === 'confirmed').length;
    const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0;
    const scheduleBadge = total > 0 ? 'Escalado' : 'Sem escala';
    await db.run(
      `UPDATE users SET completed_schedules_count = ?, attendance_rate = ?, schedule_badge = ?, updated_at = datetime('now') WHERE id = ?`,
      [confirmed, rate, scheduleBadge, userId]
    );
    return { completed_schedules_count: confirmed, attendance_rate: rate };
  },

  async updateRoleOrStatusByAdmin(targetUserId, { role, status, team_badge, title, campus, full_name, whatsapp }) {
    const current = await db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!current) return null;
    await db.run(
      `UPDATE users SET
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        team_badge = COALESCE(?, team_badge),
        title = COALESCE(?, title),
        campus = COALESCE(?, campus),
        full_name = COALESCE(?, full_name),
        whatsapp = COALESCE(?, whatsapp),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        role || null,
        status || null,
        team_badge || null,
        title || null,
        campus || null,
        full_name || null,
        whatsapp || null,
        targetUserId
      ]
    );
    if (status === 'inactive' || (role && role !== current.role)) {
      await db.run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
    }
    return this.findById(targetUserId);
  },

  async deleteUser(targetUserId) {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [targetUserId]);
    return db.run('DELETE FROM users WHERE id = ?', [targetUserId]);
  },

  async getNotifications(userId) {
    return db.all(
      'SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 30',
      [userId]
    );
  },

  async markNotificationsRead(userId) {
    return db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? OR user_id IS NULL', [userId]);
  },

  async createNotification({ user_id = null, title, message, type = 'info' }) {
    return db.run(
      'INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, 0)',
      [user_id, title, message, type]
    );
  },

  async notifyAllAdmins({ title, message, type = 'info' }) {
    const admins = await db.all("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'active'");
    if (admins.length === 0) return;
    const stmts = admins.map((a) => ({
      sql: 'INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, 0)',
      params: [a.id, title, message, type]
    }));
    return db.transaction(stmts);
  },

  sanitize(user) {
    if (!user) return null;
    const copy = { ...user };
    delete copy.password_hash;
    delete copy.reset_token;
    delete copy.reset_token_expires;
    return copy;
  }
};

module.exports = UserModel;
