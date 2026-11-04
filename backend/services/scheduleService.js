const db = require('../config/database');
const ScheduleModel = require('../models/ScheduleModel');
const UserModel = require('../models/UserModel');

const ScheduleService = {
  /**
   * Gera ou atualiza automaticamente uma escala otimizada com base nos votos da enquete,
   * respeitando o limite de vagas (target_count) por instrumento e diferenciando data + horário.
   */
  async generateRosterFromPoll(pollId, adminUserId) {
    const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
    if (!poll) {
      const err = new Error('Enquete não encontrada.');
      err.status = 404;
      throw err;
    }

    const adminUser = await db.get('SELECT * FROM users WHERE id = ?', [adminUserId]);
    const leaderName = adminUser ? adminUser.full_name : 'Liderança';

    const targets = await db.all('SELECT * FROM poll_targets WHERE poll_id = ?', [pollId]);
    const targetLimitByRole = new Map();
    for (const t of targets) {
      targetLimitByRole.set(t.role_key, Math.max(parseInt(t.target_count || 1, 10), 1));
    }

    const availableVoters = await db.all(
      `SELECT pv.*, u.full_name, u.title
       FROM poll_votes pv
       INNER JOIN users u ON u.id = pv.user_id
       WHERE pv.poll_id = ? AND pv.is_available = 1
       ORDER BY pv.voted_at ASC, pv.id ASC`,
      [pollId]
    );

    // Verifica tanto event_date quanto event_time para não sobrescrever cultos de horários diferentes no mesmo dia
    let schedule = await db.get(
      'SELECT * FROM schedules WHERE event_date = ? AND event_time = ?',
      [poll.event_date, poll.event_time || '19:00']
    );
    if (!schedule) {
      schedule = await ScheduleModel.createSchedule(
        {
          title: poll.title.replace(/^Escala\s+/i, ''),
          subtitle: `Gerada via Enquete • ${poll.event_date.split('-').reverse().slice(0, 2).join('/')}`,
          event_date: poll.event_date,
          event_time: poll.event_time || '19:00',
          soundcheck_time: poll.soundcheck_time || '17:30',
          prayer_time: '18:30',
          location: 'Templo Principal',
          campus: 'Campus Central',
          team_name: 'Equipe de Louvor',
          leader_name: leaderName,
          event_type: poll.poll_type === 'ensaio' ? 'ensaio' : 'culto',
          status: poll.poll_type === 'ensaio' ? 'rehearsal' : 'confirmed',
          song_ids: []
        },
        adminUserId
      );
    }

    const allocatedByRole = new Map();
    let escalatedCount = 0;

    for (const voter of availableVoters) {
      const skills = await UserModel.getUserSkills(voter.user_id);
      const roleHint = String(voter.role_label || '').toLowerCase();

      // Seleciona a habilidade do voluntário que possui vaga aberta nos targets da enquete
      let chosenSkill = null;
      if (targetLimitByRole.size > 0) {
        // Prioriza habilidade que coincide com o role_label votado e ainda tem vaga
        chosenSkill = skills.find(
          (s) =>
            targetLimitByRole.has(s.role_key) &&
            (allocatedByRole.get(s.role_key) || 0) < targetLimitByRole.get(s.role_key) &&
            roleHint.includes(s.role_key)
        );
        if (!chosenSkill) {
          chosenSkill = skills.find(
            (s) =>
              targetLimitByRole.has(s.role_key) &&
              (allocatedByRole.get(s.role_key) || 0) < targetLimitByRole.get(s.role_key)
          );
        }
      }

      if (!chosenSkill) {
        chosenSkill = skills[0] || {
          role_key: 'vocal',
          skill_name: voter.role_label || 'Vocal',
          icon: 'mic',
          color_variant: 'primary'
        };
      }

      const roleKey = chosenSkill.role_key || 'vocal';
      const limit =
        targetLimitByRole.size > 0
          ? targetLimitByRole.get(roleKey) || 0
          : 2;
      const currentAllocated = allocatedByRole.get(roleKey) || 0;

      if (currentAllocated >= limit) {
        continue; // Respeita estritamente o limite de vagas (target_count) daquele instrumento
      }

      allocatedByRole.set(roleKey, currentAllocated + 1);
      escalatedCount++;

      await ScheduleModel.addMemberToSchedule(schedule.id, {
        user_id: voter.user_id,
        role_key: roleKey,
        role_label: voter.full_name,
        instrument_detail: `${chosenSkill.skill_name}${chosenSkill.equipment_notes ? ' • ' + chosenSkill.equipment_notes : ''}`,
        is_leader: voter.user_id === adminUserId ? 1 : 0,
        confirmation_status: 'confirmed',
        icon: chosenSkill.icon || 'music_note',
        color_variant: chosenSkill.color_variant || 'primary'
      });
    }

    await UserModel.createNotification({
      user_id: null,
      title: `Escala Gerada: ${schedule.title}`,
      message: `A escala de ${poll.event_date} (${poll.event_time}) foi gerada respeitando os limites de vagas (${escalatedCount} escalado(s)).`,
      type: 'schedule'
    });

    return ScheduleModel.getById(schedule.id);
  }
};

module.exports = ScheduleService;
