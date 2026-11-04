const db = require('../config/database');
const UserModel = require('./UserModel');

const DEFAULT_CATEGORY_TARGETS = [
  { role_key: 'soprano', role_label: 'Sopranos', icon: 'mic', target_count: 1 },
  { role_key: 'contralto', role_label: 'Contraltos', icon: 'mic', target_count: 1 },
  { role_key: 'tenor', role_label: 'Tenores', icon: 'mic', target_count: 1 },
  { role_key: 'teclado', role_label: 'Tecladistas', icon: 'piano', target_count: 1 },
  { role_key: 'violao', role_label: 'Violão', icon: 'queue_music', target_count: 1 },
  { role_key: 'guitarra', role_label: 'Guitarra', icon: 'electric_bolt', target_count: 1 },
  { role_key: 'baixo', role_label: 'Contrabaixo', icon: 'graphic_eq', target_count: 1 },
  { role_key: 'bateria', role_label: 'Bateria', icon: 'album', target_count: 1 }
];

const PollModel = {
  getDefaultCategoryTargets() {
    return DEFAULT_CATEGORY_TARGETS.map((t) => ({ ...t }));
  },

  async batchEnrichPolls(polls, currentUserId = null) {
    if (!polls || polls.length === 0) return [];
    const ids = polls.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(',');

    const [allTargets, allVotes, activeUsers, allUnavailabilities] = await Promise.all([
      db.all(`SELECT * FROM poll_targets WHERE poll_id IN (${placeholders}) ORDER BY id ASC`, ids),
      db.all(
        `SELECT pv.*, u.full_name, u.email, u.whatsapp, u.avatar_url, u.title
         FROM poll_votes pv
         LEFT JOIN users u ON u.id = pv.user_id
         WHERE pv.poll_id IN (${placeholders})
         ORDER BY pv.is_available DESC, pv.voted_at DESC`,
        ids
      ),
      db.all(
        "SELECT id, full_name, email, whatsapp, avatar_url, title, role FROM users WHERE status = 'active' ORDER BY full_name ASC"
      ),
      db.all(
        `SELECT uu.*, u.full_name, u.title, u.avatar_url
         FROM user_unavailabilities uu
         INNER JOIN users u ON u.id = uu.user_id
         WHERE u.status = 'active'`
      )
    ]);

    const targetsByPoll = new Map();
    for (const t of allTargets) {
      if (!targetsByPoll.has(t.poll_id)) targetsByPoll.set(t.poll_id, []);
      t.is_filled = (t.confirmed_count || 0) >= Math.max(t.target_count || 1, 1);
      targetsByPoll.get(t.poll_id).push(t);
    }

    const votesByPoll = new Map();
    for (const v of allVotes) {
      if (!votesByPoll.has(v.poll_id)) votesByPoll.set(v.poll_id, []);
      votesByPoll.get(v.poll_id).push(v);
    }

    const activeUsersCount = activeUsers.length || 1;

    for (const poll of polls) {
      poll.targets = targetsByPoll.get(poll.id) || [];
      poll.votes = votesByPoll.get(poll.id) || [];
      poll.total_invited = Math.max(activeUsersCount, poll.votes.length);
      poll.voted_count = poll.votes.length;
      poll.available_count = poll.votes.filter((v) => v.is_available === 1).length;
      poll.unavailable_votes_count = poll.votes.filter((v) => v.is_available === 0).length;

      // Verifica quais integrantes informaram período de indisponibilidade que cobre a data desta enquete
      const unavailOnPollDate = allUnavailabilities.filter(
        (uu) => poll.event_date >= uu.start_date && poll.event_date <= uu.end_date
      );
      poll.unavailable_on_date = unavailOnPollDate;
      const unavailMap = new Map(unavailOnPollDate.map((u) => [u.user_id, u]));

      // Marca votos cujos autores também possuem indisponibilidade registrada na data
      for (const v of poll.votes) {
        const un = unavailMap.get(v.user_id);
        v.has_date_unavailability = Boolean(un);
        v.unavailability_reason = un ? `${un.start_date} a ${un.end_date}: ${un.reason}` : '';
      }

      // Lista de membros ativos que ainda não votaram nesta enquete
      const votedIds = new Set(poll.votes.map((v) => v.user_id));
      poll.pending_members = activeUsers
        .filter((u) => !votedIds.has(u.id))
        .map((u) => {
          const un = unavailMap.get(u.id);
          return {
            id: u.id,
            full_name: u.full_name,
            title: u.title,
            avatar_url: u.avatar_url,
            has_date_unavailability: Boolean(un),
            unavailability_reason: un ? `${un.start_date} a ${un.end_date}: ${un.reason}` : ''
          };
        });

      if (currentUserId) {
        const userVote = poll.votes.find((v) => v.user_id === currentUserId);
        poll.my_vote = userVote ? Boolean(userVote.is_available) : null;
        poll.my_vote_role_key = userVote ? userVote.role_key : null;
        poll.my_vote_role_label = userVote ? userVote.role_label : null;
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

  async recalculatePollTargetCounts(pollId) {
    const targets = await db.all('SELECT * FROM poll_targets WHERE poll_id = ? ORDER BY id ASC', [pollId]);
    if (targets.length === 0) return;

    const availableVoters = await db.all(
      `SELECT pv.user_id, pv.role_key, pv.role_label,
              COALESCE(
                (SELECT us.role_key FROM user_skills us WHERE us.user_id = pv.user_id ORDER BY CASE WHEN us.level_badge = 'Principal' THEN 0 ELSE 1 END, us.id ASC LIMIT 1),
                'vocal'
              ) as primary_skill_key
       FROM poll_votes pv
       WHERE pv.poll_id = ? AND pv.is_available = 1`,
      [pollId]
    );

    const targetKeys = new Set(targets.map((t) => t.role_key));
    const countsByRole = {};

    for (const v of availableVoters) {
      let chosenKey = String(v.role_key || '').toLowerCase().trim();
      if (!chosenKey || !targetKeys.has(chosenKey)) {
        // Tenta inferir pelo role_label ou pela skill principal do usuário
        const inferred = UserModel.inferRoleKeyFromText(v.role_label || '');
        if (targetKeys.has(inferred)) {
          chosenKey = inferred;
        } else if (targetKeys.has(v.primary_skill_key)) {
          chosenKey = v.primary_skill_key;
        } else if (['soprano', 'contralto', 'tenor'].includes(chosenKey) && targetKeys.has('vocal')) {
          chosenKey = 'vocal';
        } else if (chosenKey === 'vocal') {
          const firstVocalTarget = ['soprano', 'contralto', 'tenor', 'vocal'].find((k) => targetKeys.has(k));
          if (firstVocalTarget) chosenKey = firstVocalTarget;
        }
      }
      if (chosenKey) {
        countsByRole[chosenKey] = (countsByRole[chosenKey] || 0) + 1;
      }
    }

    const stmts = targets.map((t) => ({
      sql: 'UPDATE poll_targets SET confirmed_count = ? WHERE id = ?',
      params: [countsByRole[t.role_key] || 0, t.id]
    }));
    await db.transaction(stmts);
  },

  async castVote(pollId, userId, isAvailable, roleLabel = 'Membro', roleKey = '', notes = '') {
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (!poll) return null;
    if (poll.status === 'closed') {
      const err = new Error('Esta enquete já foi encerrada e não aceita novos votos.');
      err.status = 400;
      throw err;
    }

    // Se o usuário tentar votar Disponível em uma data na qual ele próprio cadastrou indisponibilidade, avisa ou registra
    let resolvedRoleKey = String(roleKey || '').toLowerCase().trim();
    if (!resolvedRoleKey) {
      const userSkills = await UserModel.getUserSkills(userId);
      if (userSkills.length > 0) {
        resolvedRoleKey = userSkills[0].role_key;
      } else {
        resolvedRoleKey = UserModel.inferRoleKeyFromText(roleLabel);
      }
    }

    const meta = UserModel.getRoleCategoryMeta(resolvedRoleKey);
    const finalRoleLabel = roleLabel && roleLabel !== 'Membro' ? roleLabel : meta.name;

    const availInt = isAvailable ? 1 : 0;
    await db.run(
      `INSERT INTO poll_votes (poll_id, user_id, is_available, role_key, role_label, notes, voted_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(poll_id, user_id) DO UPDATE SET
         is_available = excluded.is_available,
         role_key = excluded.role_key,
         role_label = excluded.role_label,
         notes = excluded.notes,
         voted_at = datetime('now')`,
      [pollId, userId, availInt, resolvedRoleKey, finalRoleLabel, String(notes || '').trim()]
    );

    await this.recalculatePollTargetCounts(pollId);
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

    let rawTargets = Array.isArray(data.targets) && data.targets.length > 0
      ? data.targets.filter((t) => parseInt(t.target_count ?? 1, 10) > 0)
      : DEFAULT_CATEGORY_TARGETS;

    if (rawTargets.length === 0) {
      rawTargets = [{ role_key: 'vocal', role_label: 'Vocal Geral', icon: 'mic', target_count: 1 }];
    }

    const stmts = rawTargets.map((t) => {
      const rKey = String(t.role_key || 'vocal').toLowerCase().trim();
      const meta = UserModel.getRoleCategoryMeta(rKey);
      return {
        sql: 'INSERT INTO poll_targets (poll_id, role_key, role_label, icon, target_count, confirmed_count) VALUES (?, ?, ?, ?, ?, 0)',
        params: [
          pollId,
          rKey,
          t.role_label || meta.name,
          t.icon || meta.icon || 'music_note',
          Math.max(parseInt(t.target_count || 1, 10), 1)
        ]
      };
    });
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
