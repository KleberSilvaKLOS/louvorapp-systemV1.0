const db = require('../config/database');
const UserModel = require('./UserModel');

const SwapModel = {
  async batchEnrichSwaps(swaps) {
    if (!swaps || swaps.length === 0) return [];
    const schedIds = Array.from(new Set(swaps.map((s) => s.schedule_id).filter(Boolean)));
    const userIds = Array.from(
      new Set(
        swaps
          .flatMap((s) => [s.requester_id, s.substitute_id])
          .filter(Boolean)
      )
    );

    const [schedules, users] = await Promise.all([
      schedIds.length > 0
        ? db.all(`SELECT * FROM schedules WHERE id IN (${schedIds.map(() => '?').join(',')})`, schedIds)
        : [],
      userIds.length > 0
        ? db.all(
            `SELECT id, full_name, email, whatsapp, avatar_url, title, team_badge FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
            userIds
          )
        : []
    ]);

    const schedMap = new Map(schedules.map((s) => [s.id, s]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    return swaps.map((sw) => ({
      ...sw,
      schedule: schedMap.get(sw.schedule_id) || null,
      requester: userMap.get(sw.requester_id) || null,
      substitute: sw.substitute_id ? userMap.get(sw.substitute_id) || null : null
    }));
  },

  async getAll({ status = '', requester_id = null } = {}) {
    let sql = 'SELECT * FROM swap_requests WHERE 1=1';
    const params = [];
    if (status) {
      if (status === 'approved') {
        sql += " AND status IN ('approved', 'approved_with_note', 'slot_dispensed')";
      } else if (status === 'rejected') {
        sql += " AND status IN ('rejected', 'cancelled')";
      } else {
        sql += ' AND status = ?';
        params.push(status);
      }
    }
    if (requester_id) {
      sql += ' AND (requester_id = ? OR substitute_id = ?)';
      params.push(requester_id, requester_id);
    }
    sql += ' ORDER BY CASE WHEN status = "pending" THEN 0 ELSE 1 END, id DESC';
    const rows = await db.all(sql, params);
    return this.batchEnrichSwaps(rows);
  },

  async getById(id) {
    const row = await db.get('SELECT * FROM swap_requests WHERE id = ?', [id]);
    if (!row) return null;
    const [enriched] = await this.batchEnrichSwaps([row]);
    return enriched;
  },

  async getKpiMetrics() {
    const [pendingRow, approvedRow, rejectedRow, smartReadyRow, avgTimeRow, memberStats] = await Promise.all([
      db.get("SELECT COUNT(*) as count FROM swap_requests WHERE status = 'pending'"),
      db.get("SELECT COUNT(*) as count FROM swap_requests WHERE status IN ('approved', 'approved_with_note', 'slot_dispensed')"),
      db.get("SELECT COUNT(*) as count FROM swap_requests WHERE status IN ('rejected', 'cancelled')"),
      db.get("SELECT COUNT(*) as count FROM swap_requests WHERE status = 'pending' AND substitute_id IS NOT NULL AND urgency_type != 'conflict'"),
      db.get(
        `SELECT AVG(MAX(0, (julianday(resolved_at) - julianday(created_at)) * 24.0)) as avg_hours
         FROM swap_requests
         WHERE resolved_at IS NOT NULL AND created_at IS NOT NULL`
      ),
      db.get(
        `SELECT COUNT(*) as total_slots,
                SUM(CASE WHEN confirmation_status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_slots
         FROM schedule_members`
      )
    ]);

    const pendingCount = (pendingRow && pendingRow.count) || 0;
    const approvedCount = (approvedRow && approvedRow.count) || 0;
    const rejectedCount = (rejectedRow && rejectedRow.count) || 0;
    const totalSlots = (memberStats && memberStats.total_slots) || 0;
    const confirmedSlots = (memberStats && memberStats.confirmed_slots) || 0;

    let avgResponseTime = '0h';
    if (avgTimeRow && avgTimeRow.avg_hours !== null && avgTimeRow.avg_hours !== undefined) {
      const h = Number(avgTimeRow.avg_hours);
      avgResponseTime = h < 0.1 ? '0.1h' : `${h.toFixed(1)}h`;
    }

    const coveragePercent = totalSlots > 0 ? `${Math.round((confirmedSlots / totalSlots) * 100)}%` : '0%';

    return {
      pendingCount,
      approvedCount,
      rejectedCount,
      avgResponseTime,
      coveragePercent,
      smartReadyCount: (smartReadyRow && smartReadyRow.count) || 0
    };
  },

  async createSwapRequest({
    schedule_id,
    requester_id,
    substitute_id = null,
    role_label = 'Instrumento',
    instrument_detail = 'Equipe de Louvor',
    song_key_badge = '',
    reason
  }) {
    const memberRow = await db.get(
      'SELECT * FROM schedule_members WHERE schedule_id = ? AND user_id = ?',
      [schedule_id, requester_id]
    );

    if (memberRow) {
      await db.run("UPDATE schedule_members SET confirmation_status = 'swap_requested' WHERE id = ?", [memberRow.id]);
    }

    const hasSub = Boolean(substitute_id);
    const urgency_type = hasSub ? 'urgent' : 'open_slot';
    const badge_text = hasSub ? 'Solicitação com Substituto' : 'Sem Substituto • Busca Ativa';
    const insight_type = hasSub ? 'positive' : 'critical';
    const insight_title = hasSub ? 'Substituto indicado:' : 'Vaga em aberto:';
    const insight_text = hasSub
      ? 'Substituto indicado está disponível para assumir a escala.'
      : 'Aguardando voluntários ou escalação manual do líder.';

    const res = await db.run(
      `INSERT INTO swap_requests (
        schedule_id, schedule_member_id, requester_id, substitute_id,
        role_label, instrument_detail, song_key_badge, reason,
        urgency_type, badge_text, insight_type, insight_title, insight_text,
        substitute_badge, substitute_status_text, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        schedule_id,
        memberRow ? memberRow.id : null,
        requester_id,
        substitute_id,
        role_label,
        instrument_detail,
        song_key_badge,
        reason,
        urgency_type,
        badge_text,
        insight_type,
        insight_title,
        insight_text,
        hasSub ? 'Disponível & Apto' : 'Em aberto',
        hasSub ? 'Aceitou substituir' : '0 voluntários responderam'
      ]
    );
    return this.getById(res.lastID);
  },

  async confirmWithLeader(id) {
    await db.run(
      'UPDATE swap_requests SET member_confirmed_leader = 1 WHERE id = ?',
      [id]
    );
    return this.getById(id);
  },

  async cancelSwap(id) {
    const swap = await this.getById(id);
    if (!swap) return null;
    await db.run(
      "UPDATE swap_requests SET status = 'cancelled', resolved_at = datetime('now') WHERE id = ?",
      [id]
    );
    if (swap.schedule_member_id) {
      await db.run(
        "UPDATE schedule_members SET confirmation_status = 'confirmed' WHERE id = ?",
        [swap.schedule_member_id]
      );
    }
    return this.getById(id);
  },

  async resolveSwap(id, { action, admin_note = '', substitute_id = null }, adminUserId) {
    const swap = await this.getById(id);
    if (!swap) return null;

    const finalSubId = substitute_id || swap.substitute_id;
    let newStatus = 'approved';
    let noteText = admin_note || 'Aprovado';

    if (action === 'reject') {
      newStatus = 'rejected';
      noteText = admin_note || 'Recusado';
    } else if (action === 'approve_with_note') {
      newStatus = 'approved_with_note';
      noteText = admin_note || 'Aprovado c/ Ressalva';
    } else if (action === 'dispense') {
      newStatus = 'slot_dispensed';
      noteText = admin_note || 'Posto dispensado pelo líder';
    } else if (action === 'manual_assign' && finalSubId) {
      newStatus = 'approved';
      noteText = admin_note || 'Escalado manualmente pelo líder';
    }

    const stmts = [
      {
        sql: `UPDATE swap_requests
              SET status = ?, substitute_id = COALESCE(?, substitute_id), admin_note = ?, resolved_by = ?, resolved_at = datetime('now')
              WHERE id = ?`,
        params: [newStatus, finalSubId, noteText, adminUserId, id]
      }
    ];

    if ((newStatus === 'approved' || newStatus === 'approved_with_note') && finalSubId) {
      const subUser = await db.get('SELECT * FROM users WHERE id = ?', [finalSubId]);
      if (subUser) {
        // Remove o titular antigo e insere/atualiza o substituto sem violar UNIQUE(schedule_id, user_id)
        stmts.push({
          sql: 'DELETE FROM schedule_members WHERE schedule_id = ? AND user_id = ?',
          params: [swap.schedule_id, swap.requester_id]
        });
        stmts.push({
          sql: `INSERT INTO schedule_members (schedule_id, user_id, role_key, role_label, instrument_detail, is_leader, confirmation_status, icon, color_variant)
                VALUES (?, ?, 'teclado', ?, ?, 0, 'confirmed', 'music_note', 'secondary')
                ON CONFLICT(schedule_id, user_id) DO UPDATE SET
                  role_label = excluded.role_label,
                  instrument_detail = excluded.instrument_detail,
                  confirmation_status = 'confirmed',
                  updated_at = datetime('now')`,
          params: [swap.schedule_id, subUser.id, subUser.full_name, swap.role_label || subUser.title]
        });
      }
    } else if (newStatus === 'slot_dispensed') {
      stmts.push({
        sql: 'DELETE FROM schedule_members WHERE schedule_id = ? AND user_id = ?',
        params: [swap.schedule_id, swap.requester_id]
      });
    } else if (newStatus === 'rejected') {
      stmts.push({
        sql: "UPDATE schedule_members SET confirmation_status = 'confirmed' WHERE schedule_id = ? AND user_id = ?",
        params: [swap.schedule_id, swap.requester_id]
      });
    }

    await db.transaction(stmts);
    await UserModel.recalculateUserStats(swap.requester_id);
    if (finalSubId) await UserModel.recalculateUserStats(finalSubId);

    return this.getById(id);
  },

  async dispatchEmergencyAlert(id) {
    const swap = await this.getById(id);
    if (!swap) return null;

    // Busca músicos ativos que podem substituir (exceto o próprio solicitante)
    const candidates = await db.all(
      `SELECT DISTINCT u.id, u.full_name
       FROM users u
       LEFT JOIN user_skills us ON us.user_id = u.id
       WHERE u.status = 'active' AND u.id != ?
         AND (LOWER(us.skill_name) LIKE LOWER(?) OR LOWER(u.title) LIKE LOWER(?) OR 1=1)
       LIMIT 10`,
      [swap.requester_id, `%${swap.role_label}%`, `%${swap.role_label}%`]
    );

    const notifiedCount = candidates.length;
    const stmts = candidates.map((c) => ({
      sql: 'INSERT INTO notifications (user_id, title, message, type, is_read) VALUES (?, ?, ?, ?, 0)',
      params: [
        c.id,
        `Chamado de Substituição: ${swap.role_label}`,
        `Vaga em aberto para ${swap.schedule ? swap.schedule.title : 'Escala'} (${swap.schedule ? swap.schedule.event_date : ''}).`,
        'swap'
      ]
    }));

    stmts.push({
      sql: `UPDATE swap_requests
            SET alert_dispatched = 1, substitute_status_text = ?
            WHERE id = ?`,
      params: [`Alerta disparado para ${notifiedCount} músico(s)!`, id]
    });

    await db.transaction(stmts);
    const updated = await this.getById(id);
    updated.notified_count = notifiedCount;
    return updated;
  }
};

module.exports = SwapModel;
