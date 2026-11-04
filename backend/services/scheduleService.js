const db = require('../config/database');
const ScheduleModel = require('../models/ScheduleModel');
const UserModel = require('../models/UserModel');

const ScheduleService = {
  /**
   * Gera ou atualiza automaticamente uma escala otimizada com base nos votos da enquete,
   * respeitando:
   * 1. O limite de vagas (target_count) por categoria (Sopranos, Contraltos, Tenores, Tecladistas, Instrumentistas).
   * 2. Períodos de indisponibilidade cadastrados no perfil dos integrantes (user_unavailabilities).
   * 3. Data + Horário do evento (event_date + event_time).
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

    const targets = await db.all('SELECT * FROM poll_targets WHERE poll_id = ? ORDER BY id ASC', [pollId]);
    const targetLimitByRole = new Map();
    const targetMetaByRole = new Map();
    for (const t of targets) {
      targetLimitByRole.set(t.role_key, Math.max(parseInt(t.target_count || 1, 10), 1));
      targetMetaByRole.set(t.role_key, t);
    }

    // Busca integrantes que registraram indisponibilidade cobrindo a data da enquete
    const unavailableRows = await db.all(
      `SELECT user_id, start_date, end_date, reason
       FROM user_unavailabilities
       WHERE ? BETWEEN start_date AND end_date`,
      [poll.event_date]
    );
    const unavailableUserIds = new Set(unavailableRows.map((r) => r.user_id));

    const availableVoters = await db.all(
      `SELECT pv.*, u.full_name, u.title
       FROM poll_votes pv
       INNER JOIN users u ON u.id = pv.user_id
       WHERE pv.poll_id = ? AND pv.is_available = 1 AND u.status = 'active'
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
    let skippedUnavailableCount = 0;

    for (const voter of availableVoters) {
      // 1. Filtra automaticamente quem cadastrou período de indisponibilidade para esta data
      if (unavailableUserIds.has(voter.user_id)) {
        skippedUnavailableCount++;
        continue;
      }

      const skills = await UserModel.getUserSkills(voter.user_id);
      const votedRoleKey = String(voter.role_key || '').toLowerCase().trim();
      const roleHint = String(voter.role_label || '').toLowerCase();

      let chosenSkill = null;
      if (targetLimitByRole.size > 0) {
        // 1º: Verifica se o role_key votado diretamente tem vaga aberta na enquete
        if (
          votedRoleKey &&
          targetLimitByRole.has(votedRoleKey) &&
          (allocatedByRole.get(votedRoleKey) || 0) < targetLimitByRole.get(votedRoleKey)
        ) {
          const matchingSkill = skills.find((s) => s.role_key === votedRoleKey);
          const tMeta = targetMetaByRole.get(votedRoleKey);
          const catMeta = UserModel.getRoleCategoryMeta(votedRoleKey);
          chosenSkill = matchingSkill || {
            role_key: votedRoleKey,
            skill_name: tMeta ? tMeta.role_label : catMeta.name,
            equipment_notes: '',
            icon: (tMeta && tMeta.icon) || catMeta.icon || 'music_note',
            color_variant: catMeta.color || 'primary'
          };
        }

        // 2º: Tenta encontrar uma habilidade do usuário que coincida com o role_label votado e ainda tenha vaga
        if (!chosenSkill) {
          chosenSkill = skills.find(
            (s) =>
              targetLimitByRole.has(s.role_key) &&
              (allocatedByRole.get(s.role_key) || 0) < targetLimitByRole.get(s.role_key) &&
              roleHint.includes(s.role_key)
          );
        }

        // 3º: Tenta qualquer habilidade cadastrada do usuário que tenha vaga na enquete
        if (!chosenSkill) {
          chosenSkill = skills.find(
            (s) =>
              targetLimitByRole.has(s.role_key) &&
              (allocatedByRole.get(s.role_key) || 0) < targetLimitByRole.get(s.role_key)
          );
        }

        // 4º: Compatibilidade entre vocal genérico e naipes vocais (soprano/contralto/tenor)
        if (!chosenSkill && (votedRoleKey === 'vocal' || ['soprano', 'contralto', 'tenor'].includes(votedRoleKey))) {
          const vocalFallbackKey = ['soprano', 'contralto', 'tenor', 'vocal'].find(
            (k) => targetLimitByRole.has(k) && (allocatedByRole.get(k) || 0) < targetLimitByRole.get(k)
          );
          if (vocalFallbackKey) {
            const tMeta = targetMetaByRole.get(vocalFallbackKey);
            const catMeta = UserModel.getRoleCategoryMeta(vocalFallbackKey);
            chosenSkill = {
              role_key: vocalFallbackKey,
              skill_name: tMeta ? tMeta.role_label : catMeta.name,
              equipment_notes: '',
              icon: (tMeta && tMeta.icon) || catMeta.icon || 'mic',
              color_variant: 'secondary'
            };
          }
        }
      }

      if (!chosenSkill) {
        const fallbackKey = votedRoleKey || (skills[0] && skills[0].role_key) || 'vocal';
        const catMeta = UserModel.getRoleCategoryMeta(fallbackKey);
        chosenSkill = skills[0] || {
          role_key: fallbackKey,
          skill_name: voter.role_label || catMeta.name,
          icon: catMeta.icon || 'mic',
          color_variant: catMeta.color || 'primary'
        };
      }

      const roleKey = chosenSkill.role_key || 'vocal';
      const limit =
        targetLimitByRole.size > 0
          ? targetLimitByRole.get(roleKey) || 0
          : 2;
      const currentAllocated = allocatedByRole.get(roleKey) || 0;

      if (currentAllocated >= limit) {
        continue; // Respeita estritamente a quantidade máxima configurada para a categoria
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
      message: `A escala de ${poll.event_date} (${poll.event_time}) foi gerada respeitando as vagas por categoria e indisponibilidades (${escalatedCount} escalado(s)).`,
      type: 'schedule'
    });

    const finalSchedule = await ScheduleModel.getById(schedule.id);
    return {
      schedule: finalSchedule,
      addedMembersCount: escalatedCount,
      skippedUnavailableCount
    };
  }
};

module.exports = ScheduleService;
