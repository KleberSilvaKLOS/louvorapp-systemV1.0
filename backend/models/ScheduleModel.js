const db = require('../config/database');
const UserModel = require('./UserModel');

const ScheduleModel = {
  async batchEnrichSchedules(schedules) {
    if (!schedules || schedules.length === 0) return [];
    const ids = schedules.map((s) => s.id);
    const placeholders = ids.map(() => '?').join(',');

    const [allMembers, allSongs] = await Promise.all([
      db.all(
        `SELECT sm.*, u.full_name as user_full_name, u.email as user_email, u.whatsapp as user_whatsapp, u.avatar_url
         FROM schedule_members sm
         LEFT JOIN users u ON u.id = sm.user_id
         WHERE sm.schedule_id IN (${placeholders})
         ORDER BY sm.is_leader DESC, sm.id ASC`,
        ids
      ),
      db.all(
        `SELECT ss.id as schedule_song_id, ss.schedule_id, ss.sequence_order,
                COALESCE(ss.custom_key, s.musical_key) as musical_key,
                COALESCE(ss.custom_bpm, s.bpm) as bpm,
                ss.lead_vocal,
                s.id as song_id, s.title, s.artist, s.duration, s.category, s.chords_text, s.audio_url, s.notes
         FROM schedule_songs ss
         INNER JOIN songs s ON s.id = ss.song_id
         WHERE ss.schedule_id IN (${placeholders})
         ORDER BY ss.sequence_order ASC, ss.id ASC`,
        ids
      )
    ]);

    const membersBySched = new Map();
    for (const m of allMembers) {
      if (!membersBySched.has(m.schedule_id)) membersBySched.set(m.schedule_id, []);
      membersBySched.get(m.schedule_id).push(m);
    }

    const songsBySched = new Map();
    for (const sg of allSongs) {
      if (!songsBySched.has(sg.schedule_id)) songsBySched.set(sg.schedule_id, []);
      songsBySched.get(sg.schedule_id).push(sg);
    }

    for (const s of schedules) {
      s.members = membersBySched.get(s.id) || [];
      s.songs = songsBySched.get(s.id) || [];
    }
    return schedules;
  },

  async getAll({ month = '', campus = '', status = '', search = '' } = {}) {
    let sql = 'SELECT * FROM schedules WHERE 1=1';
    const params = [];
    if (month) {
      sql += ' AND event_date LIKE ?';
      params.push(`${month}%`);
    }
    if (campus) {
      sql += ' AND campus = ?';
      params.push(campus);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (LOWER(title) LIKE LOWER(?) OR LOWER(subtitle) LIKE LOWER(?) OR LOWER(location) LIKE LOWER(?))';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY event_date ASC, event_time ASC';
    const rows = await db.all(sql, params);
    return this.batchEnrichSchedules(rows);
  },

  async getById(id) {
    const row = await db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!row) return null;
    const [enriched] = await this.batchEnrichSchedules([row]);
    return enriched;
  },

  async getSchedulesForUser(userId) {
    const memberships = await db.all(
      `SELECT sm.*, s.title, s.subtitle, s.event_date, s.event_time, s.soundcheck_time,
              s.prayer_time, s.location, s.campus, s.team_name, s.leader_name, s.event_type, s.status as schedule_status
       FROM schedule_members sm
       INNER JOIN schedules s ON s.id = sm.schedule_id
       WHERE sm.user_id = ?
       ORDER BY s.event_date ASC, s.event_time ASC`,
      [userId]
    );
    if (memberships.length === 0) return [];

    const schedIds = Array.from(new Set(memberships.map((m) => m.schedule_id)));
    const placeholders = schedIds.map(() => '?').join(',');

    const [allSongs, allTeamMembers] = await Promise.all([
      db.all(
        `SELECT ss.schedule_id, ss.sequence_order, COALESCE(ss.custom_key, s.musical_key) as musical_key,
                COALESCE(ss.custom_bpm, s.bpm) as bpm, ss.lead_vocal,
                s.id as song_id, s.title, s.artist, s.duration, s.chords_text, s.audio_url
         FROM schedule_songs ss
         INNER JOIN songs s ON s.id = ss.song_id
         WHERE ss.schedule_id IN (${placeholders})
         ORDER BY ss.sequence_order ASC`,
        schedIds
      ),
      db.all(
        `SELECT sm.*, u.full_name as user_full_name, u.whatsapp as user_whatsapp
         FROM schedule_members sm
         LEFT JOIN users u ON u.id = sm.user_id
         WHERE sm.schedule_id IN (${placeholders})
         ORDER BY sm.is_leader DESC, sm.id ASC`,
        schedIds
      )
    ]);

    const songsMap = new Map();
    for (const sg of allSongs) {
      if (!songsMap.has(sg.schedule_id)) songsMap.set(sg.schedule_id, []);
      songsMap.get(sg.schedule_id).push(sg);
    }

    const teamMap = new Map();
    for (const tm of allTeamMembers) {
      if (!teamMap.has(tm.schedule_id)) teamMap.set(tm.schedule_id, []);
      teamMap.get(tm.schedule_id).push(tm);
    }

    for (const item of memberships) {
      item.songs = songsMap.get(item.schedule_id) || [];
      item.team_members = teamMap.get(item.schedule_id) || [];
    }
    return memberships;
  },

  async createSchedule(data, createdBy) {
    const {
      title,
      subtitle = '',
      event_date,
      event_time = '19:00',
      soundcheck_time = '17:30',
      prayer_time = '18:30',
      location = 'Templo Principal',
      campus = 'Campus Central',
      team_name = 'Equipe de Louvor',
      leader_name = '',
      event_type = 'culto',
      status = 'confirmed',
      notes = '',
      members = []
    } = data;

    const songList = Array.isArray(data.song_ids) ? data.song_ids : Array.isArray(data.songs) ? data.songs : [];

    const res = await db.run(
      `INSERT INTO schedules (
        title, subtitle, event_date, event_time, soundcheck_time, prayer_time,
        location, campus, team_name, leader_name, event_type, status, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, subtitle, event_date, event_time, soundcheck_time, prayer_time,
        location, campus, team_name, leader_name, event_type, status, notes, createdBy
      ]
    );
    const scheduleId = res.lastID;

    if (Array.isArray(members)) {
      for (const m of members) {
        await this.addMemberToSchedule(scheduleId, m);
      }
    }

    if (songList.length > 0) {
      let seq = 1;
      const stmts = songList.map((songItem) => {
        const songId = typeof songItem === 'object' ? songItem.song_id || songItem.id : songItem;
        const customKey = typeof songItem === 'object' ? songItem.custom_key || null : null;
        const customBpm = typeof songItem === 'object' && songItem.custom_bpm ? parseInt(songItem.custom_bpm, 10) : null;
        const leadVocal = typeof songItem === 'object' ? songItem.lead_vocal || '' : '';
        return {
          sql: 'INSERT INTO schedule_songs (schedule_id, song_id, sequence_order, custom_key, custom_bpm, lead_vocal) VALUES (?, ?, ?, ?, ?, ?)',
          params: [scheduleId, songId, seq++, customKey, customBpm, leadVocal]
        };
      });
      await db.transaction(stmts);
    }

    return this.getById(scheduleId);
  },

  async updateSchedule(id, data) {
    const current = await db.get('SELECT * FROM schedules WHERE id = ?', [id]);
    if (!current) return null;

    await db.run(
      `UPDATE schedules SET
        title = COALESCE(?, title),
        subtitle = COALESCE(?, subtitle),
        event_date = COALESCE(?, event_date),
        event_time = COALESCE(?, event_time),
        soundcheck_time = COALESCE(?, soundcheck_time),
        prayer_time = COALESCE(?, prayer_time),
        location = COALESCE(?, location),
        campus = COALESCE(?, campus),
        team_name = COALESCE(?, team_name),
        leader_name = COALESCE(?, leader_name),
        event_type = COALESCE(?, event_type),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.title ?? null,
        data.subtitle ?? null,
        data.event_date ?? null,
        data.event_time ?? null,
        data.soundcheck_time ?? null,
        data.prayer_time ?? null,
        data.location ?? null,
        data.campus ?? null,
        data.team_name ?? null,
        data.leader_name ?? null,
        data.event_type ?? null,
        data.status ?? null,
        data.notes ?? null,
        id
      ]
    );

    const songList = Array.isArray(data.song_ids) ? data.song_ids : Array.isArray(data.songs) ? data.songs : null;
    if (songList) {
      const stmts = [{ sql: 'DELETE FROM schedule_songs WHERE schedule_id = ?', params: [id] }];
      let seq = 1;
      for (const songItem of songList) {
        const songId = typeof songItem === 'object' ? songItem.song_id || songItem.id : songItem;
        const customKey = typeof songItem === 'object' ? songItem.custom_key || null : null;
        const customBpm = typeof songItem === 'object' && songItem.custom_bpm ? parseInt(songItem.custom_bpm, 10) : null;
        const leadVocal = typeof songItem === 'object' ? songItem.lead_vocal || '' : '';
        stmts.push({
          sql: 'INSERT INTO schedule_songs (schedule_id, song_id, sequence_order, custom_key, custom_bpm, lead_vocal) VALUES (?, ?, ?, ?, ?, ?)',
          params: [id, songId, seq++, customKey, customBpm, leadVocal]
        });
      }
      await db.transaction(stmts);
    }

    return this.getById(id);
  },

  async deleteSchedule(id) {
    return db.run('DELETE FROM schedules WHERE id = ?', [id]);
  },

  async addMemberToSchedule(scheduleId, { user_id, role_key = 'teclado', role_label, instrument_detail = '', is_leader = 0, confirmation_status = 'pending', icon = 'music_note', color_variant = 'primary' }) {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [user_id]);
    const finalLabel = role_label || (user ? user.full_name : 'Membro Escalado');
    const finalDetail = instrument_detail || (user ? user.title : 'Instrumentista');

    await db.run(
      `INSERT INTO schedule_members
        (schedule_id, user_id, role_key, role_label, instrument_detail, is_leader, confirmation_status, icon, color_variant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(schedule_id, user_id) DO UPDATE SET
        role_key = excluded.role_key,
        role_label = excluded.role_label,
        instrument_detail = excluded.instrument_detail,
        is_leader = excluded.is_leader,
        confirmation_status = excluded.confirmation_status,
        icon = excluded.icon,
        color_variant = excluded.color_variant,
        updated_at = datetime('now')`,
      [scheduleId, user_id, role_key, finalLabel, finalDetail, is_leader ? 1 : 0, confirmation_status, icon, color_variant]
    );
    await UserModel.recalculateUserStats(user_id);
    return this.getById(scheduleId);
  },

  async removeMemberFromSchedule(scheduleId, memberRowId) {
    const row = await db.get('SELECT user_id FROM schedule_members WHERE id = ? AND schedule_id = ?', [memberRowId, scheduleId]);
    await db.run('DELETE FROM schedule_members WHERE id = ? AND schedule_id = ?', [memberRowId, scheduleId]);
    if (row && row.user_id) {
      await UserModel.recalculateUserStats(row.user_id);
    }
    return this.getById(scheduleId);
  },

  async updateMemberAttendance(scheduleId, userId, status) {
    const row = await db.get(
      'SELECT * FROM schedule_members WHERE schedule_id = ? AND user_id = ?',
      [scheduleId, userId]
    );
    if (!row) return null;
    await db.run(
      `UPDATE schedule_members SET confirmation_status = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, row.id]
    );
    await UserModel.recalculateUserStats(userId);
    return db.get('SELECT * FROM schedule_members WHERE id = ?', [row.id]);
  },

  generateIcsFeed(schedules, user) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LouvorApp//Ministerio de Louvor//PT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];
    for (const s of schedules) {
      const dateClean = String(s.event_date || '').replace(/-/g, '');
      const timeParts = String(s.event_time || '19:00').split(':');
      const hh = String(timeParts[0] || '19').padStart(2, '0');
      const mm = String(timeParts[1] || '00').padStart(2, '0');
      const dtStart = `${dateClean}T${hh}${mm}00`;
      const endHh = String(Math.min(23, parseInt(hh, 10) + 2)).padStart(2, '0');
      const dtEnd = `${dateClean}T${endHh}${mm}00`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:louvorapp-schedule-${s.schedule_id || s.id}-${user.id}@louvorapp.org`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${s.title} (${s.instrument_detail || s.role_label || 'Louvor'})`,
        `LOCATION:${s.location || 'Templo Principal'}`,
        `DESCRIPTION:Passagem de som: ${s.soundcheck_time || '17:30'} | Oração: ${s.prayer_time || '18:30'}`,
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
};

module.exports = ScheduleModel;
