const db = require('../config/database');

const PollModel = {
  async batchEnrichPolls(polls, currentUserId = null) {
    if (!polls || polls.length === 0) return [];
    const ids = polls.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(',');

    const [allTargets, allVotes, totalUsersRow] = await Promise.all([
      db.all(`SELECT * FROM poll_targets WHERE poll_id IN (${placeholders}) ORDER BY id ASC`, ids),
      db.all(
        `SELECT pv.*, u.full_name, u.avatar_url, u.title
         FROM poll_votes pv
         LEFT JOIN users u ON u.id = pv.user_id
         WHERE pv.poll_id IN (${placeholders})
         ORDER BY pv.voted_at DESC`,
        ids
      ),
      db.get("SELECT COUNT(*) as total FROM users WHERE status = 'active'")
    ]);

    const targetsByPoll = new Map();
    for (const t of allTargets) {
      if (!targetsByPoll.has(t.poll_id)) targetsByPoll.set(t.poll_id, []);
      targetsByPoll.get(t.poll_id).push(t);
    }

    const votesByPoll = new Map();
    for (const v of allVotes) {
      if (!votesByPoll.has(v.poll_id)) votesByPoll.set(v.poll_id, []);
      votesByPoll.get(v.poll_id).push(v);
    }

    const activeUsersCount = (totalUsersRow && totalUsersRow.total) || 1;

    for (const poll of polls) {
      poll.targets = targetsByPoll.get(poll.id) || [];
      poll.votes = votesByPoll.get(poll.id) || [];
      poll.total_invited = Math.max(activeUsersCount, poll.votes.length);
      poll.voted_count = poll.votes.length;
      poll.available_count = poll.votes.filter((v) => v.is_available === 1).length;
      if (currentUserId) {
        const userVote = poll.votes.find((v) => v.user_id === currentUserId);
        poll.my_vote = userVote ? Boolean(userVote.is_available) : null;
      }
    }
    return polls;
  },

  async getAll({ filter = 'todas', currentUserId = null } = {}) {
    let sql = 'SELECT * FROM polls WHERE 1=1';
    if (filter === 'pendentes') {
      sql += " AND status = 'open'";
    } else if (filter === 'encerradas') {
      sql += " AND status = 'closed'";
    }
    sql += ' ORDER BY is_featured DESC, event_date ASC, id DESC';
    const rows = await db.all(sql);
    return this.batchEnrichPolls(rows, currentUserId);
  },

  async getById(id, currentUserId = null) {
    const row = await db.get('SELECT * FROM polls WHERE id = ?', [id]);
    if (!row) return null;
    const [enriched] = await this.batchEnrichPolls([row], currentUserId);
    return enriched;
  },

  async castVote(pollId, userId, isAvailable, roleLabel = 'Membro') {
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (!poll) return null;
    if (poll.status === 'closed') {
      const err = new Error('Esta enquete já foi encerrada e não aceita novos votos.');
      err.status = 400;
      throw err;
    }

    const availInt = isAvailable ? 1 : 0;
    await db.run(
      `INSERT INTO poll_votes (poll_id, user_id, is_available, role_label, voted_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(poll_id, user_id) DO UPDATE SET
         is_available = excluded.is_available,
         role_label = excluded.role_label,
         voted_at = datetime('now')`,
      [pollId, userId, availInt, roleLabel]
    );

    // Recalcula contadores por instrumento a partir da tabela user_skills (Principal)
    const availableVoters = await db.all(
      `SELECT pv.user_id, COALESCE(
         (SELECT us.role_key FROM user_skills us WHERE us.user_id = pv.user_id ORDER BY CASE WHEN us.level_badge = 'Principal' THEN 0 ELSE 1 END, us.id ASC LIMIT 1),
         'vocal'
       ) as primary_role_key
       FROM poll_votes pv
       WHERE pv.poll_id = ? AND pv.is_available = 1`,
      [pollId]
    );

    const countsByRole = {};
    for (const v of availableVoters) {
      const k = v.primary_role_key || 'vocal';
      countsByRole[k] = (countsByRole[k] || 0) + 1;
    }

    const targets = await db.all('SELECT * FROM poll_targets WHERE poll_id = ?', [pollId]);
    if (targets.length > 0) {
      const stmts = targets.map((t) => ({
        sql: 'UPDATE poll_targets SET confirmed_count = ? WHERE id = ?',
        params: [countsByRole[t.role_key] || 0, t.id]
      }));
      await db.transaction(stmts);
    }

    return this.getById(pollId, userId);
  },

  async createPoll(data, createdBy) {
    const totalUsersRow = await db.get("SELECT COUNT(*) as total FROM users WHERE status = 'active'");
    const totalInvited = data.total_invited
      ? parseInt(data.total_invited, 10)
      : Math.max((totalUsersRow && totalUsersRow.total) || 1, 1);

    const res = await db.run(
      `INSERT INTO polls (title, subtitle, event_date, event_time, soundcheck_time, deadline_label, poll_type, status, total_invited, is_featured, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [
        data.title,
        data.subtitle || `Culto ${data.event_time || '19:00'} • Passagem de som ${data.soundcheck_time || '17:30'}`,
        data.event_date,
        data.event_time || '19:00',
        data.soundcheck_time || '17:30',
        data.deadline_label || 'Até Qui, 22:00',
        data.poll_type || 'culto',
        totalInvited,
        data.is_featured !== undefined ? (data.is_featured ? 1 : 0) : 1,
        createdBy
      ]
    );
    const pollId = res.lastID;
    const defaultTargets = [
      { role_key: 'vocal', role_label: 'Vocal', icon: 'mic', target_count: 3 },
      { role_key: 'teclado', role_label: 'Teclado', icon: 'piano', target_count: 2 },
      { role_key: 'bateria', role_label: 'Bateria', icon: 'album', target_count: 1 },
      { role_key: 'violao', role_label: 'Violão', icon: 'music_note', target_count: 1 },
      { role_key: 'baixo', role_label: 'Baixo', icon: 'speaker', target_count: 1 },
      { role_key: 'guitarra', role_label: 'Guitarra', icon: 'graphic_eq', target_count: 1 }
    ];
    const targetList = Array.isArray(data.targets) && data.targets.length > 0 ? data.targets : defaultTargets;
    const stmts = targetList.map((t) => ({
      sql: 'INSERT INTO poll_targets (poll_id, role_key, role_label, icon, target_count, confirmed_count) VALUES (?, ?, ?, ?, ?, 0)',
      params: [pollId, t.role_key || 'vocal', t.role_label || 'Vocal', t.icon || 'music_note', parseInt(t.target_count || 1, 10)]
    }));
    await db.transaction(stmts);
    return this.getById(pollId, createdBy);
  },

  async updatePollStatus(id, status) {
    await db.run('UPDATE polls SET status = ? WHERE id = ?', [status, id]);
    return this.getById(id);
  },

  async deletePoll(id) {
    return db.run('DELETE FROM polls WHERE id = ?', [id]);
  }
};

module.exports = PollModel;
