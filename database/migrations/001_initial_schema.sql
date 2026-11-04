-- ============================================================================
-- LOUVORAPP - MIGRATION 001: SCHEMA COMPLETO DO BANCO DE DADOS (COMEÇANDO DO ZERO)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Tabela de Usuários (perfis iniciam zerados e sem foto de perfil)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('ADMIN', 'USER')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  avatar_url TEXT DEFAULT '',
  team_badge TEXT DEFAULT 'Membro',
  schedule_badge TEXT DEFAULT 'Sem escala',
  title TEXT DEFAULT 'Membro do Ministério',
  campus TEXT DEFAULT 'Campus Central',
  favorite_services TEXT DEFAULT 'Não definido',
  favorite_frequency_badge TEXT DEFAULT '-',
  desired_frequency TEXT DEFAULT 'Não definida',
  recurring_restriction TEXT DEFAULT 'Nenhuma restrição cadastrada',
  notif_convocacoes INTEGER NOT NULL DEFAULT 1,
  notif_ensaios INTEGER NOT NULL DEFAULT 1,
  notif_enquetes INTEGER NOT NULL DEFAULT 1,
  notif_trocas INTEGER NOT NULL DEFAULT 1,
  calendar_sync INTEGER NOT NULL DEFAULT 0,
  completed_schedules_count INTEGER NOT NULL DEFAULT 0,
  attendance_rate INTEGER NOT NULL DEFAULT 0,
  first_access_completed INTEGER NOT NULL DEFAULT 0,
  theme_preference TEXT NOT NULL DEFAULT 'system' CHECK(theme_preference IN ('dark', 'light', 'system')),
  reset_token TEXT,
  reset_token_expires TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Tabela de Habilidades / Instrumentos / Vozes do Usuário
CREATE TABLE IF NOT EXISTS user_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role_key TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  level_badge TEXT NOT NULL DEFAULT 'Principal',
  equipment_notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ativo' CHECK(status IN ('Ativo', 'Standby')),
  icon TEXT NOT NULL DEFAULT 'music_note',
  color_variant TEXT NOT NULL DEFAULT 'primary',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2b. Tabela de Períodos de Indisponibilidade dos Integrantes (Viagens, Compromissos, Férias)
CREATE TABLE IF NOT EXISTS user_unavailabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Indisponibilidade informada',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Tabela de Sessões Autenticadas
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Tabela de Permissões Granulares por Perfil e Funcionalidade
CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'USER')),
  module TEXT NOT NULL,
  module_label TEXT NOT NULL,
  can_view INTEGER NOT NULL DEFAULT 0,
  can_create INTEGER NOT NULL DEFAULT 0,
  can_edit INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  can_approve INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(role, module)
);

-- 5. Tabela de Repertório / Músicas
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'Ministério de Louvor',
  musical_key TEXT NOT NULL DEFAULT 'G',
  bpm INTEGER NOT NULL DEFAULT 70,
  duration TEXT DEFAULT '05:00',
  category TEXT DEFAULT 'Adoração',
  chords_text TEXT DEFAULT '',
  audio_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 6. Tabela de Eventos / Escalas (Calendário)
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL DEFAULT '19:00',
  soundcheck_time TEXT NOT NULL DEFAULT '17:30',
  prayer_time TEXT NOT NULL DEFAULT '18:30',
  location TEXT NOT NULL DEFAULT 'Templo Principal',
  campus TEXT NOT NULL DEFAULT 'Campus Central',
  team_name TEXT NOT NULL DEFAULT 'Equipe de Louvor',
  leader_name TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'culto' CHECK(event_type IN ('culto', 'ensaio', 'cancelado')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'rehearsal', 'cancelled')),
  notes TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 7. Tabela de Membros Escalados por Evento (Constraint UNIQUE(schedule_id, user_id) evita duplicação do mesmo músico)
CREATE TABLE IF NOT EXISTS schedule_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'teclado',
  role_label TEXT NOT NULL,
  instrument_detail TEXT NOT NULL DEFAULT '',
  is_leader INTEGER NOT NULL DEFAULT 0,
  confirmation_status TEXT NOT NULL DEFAULT 'pending' CHECK(confirmation_status IN ('confirmed', 'pending', 'declined', 'swap_requested')),
  icon TEXT NOT NULL DEFAULT 'music_note',
  color_variant TEXT NOT NULL DEFAULT 'primary',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(schedule_id, user_id),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. Tabela de Músicas da Escala (Setlist do Evento)
CREATE TABLE IF NOT EXISTS schedule_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  song_id INTEGER NOT NULL,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  custom_key TEXT,
  custom_bpm INTEGER,
  lead_vocal TEXT DEFAULT '',
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- 9. Tabela de Solicitações de Troca de Escala
CREATE TABLE IF NOT EXISTS swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  schedule_member_id INTEGER,
  requester_id INTEGER NOT NULL,
  substitute_id INTEGER,
  role_label TEXT NOT NULL,
  instrument_detail TEXT DEFAULT '',
  song_key_badge TEXT DEFAULT '',
  reason TEXT NOT NULL,
  urgency_type TEXT NOT NULL DEFAULT 'urgent' CHECK(urgency_type IN ('urgent', 'open_slot', 'conflict', 'normal')),
  badge_text TEXT NOT NULL DEFAULT 'Solicitação de Troca',
  insight_type TEXT NOT NULL DEFAULT 'positive' CHECK(insight_type IN ('positive', 'warning', 'critical')),
  insight_title TEXT DEFAULT 'Status:',
  insight_text TEXT DEFAULT '',
  substitute_badge TEXT DEFAULT 'Voluntário',
  substitute_status_text TEXT DEFAULT 'Aguardando confirmação',
  member_confirmed_leader INTEGER NOT NULL DEFAULT 0,
  alert_dispatched INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'approved_with_note', 'rejected', 'cancelled', 'slot_dispensed')),
  admin_note TEXT DEFAULT '',
  resolved_by INTEGER,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (substitute_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 10. Tabela de Enquetes de Disponibilidade
CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT 'Culto 19:00 • Passagem de som 17:30',
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL DEFAULT '19:00',
  soundcheck_time TEXT NOT NULL DEFAULT '17:30',
  deadline_label TEXT NOT NULL DEFAULT 'Aberta',
  poll_type TEXT NOT NULL DEFAULT 'culto' CHECK(poll_type IN ('culto', 'ensaio')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
  total_invited INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 11. Tabela de Metas por Categoria/Instrumento na Enquete
CREATE TABLE IF NOT EXISTS poll_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  role_key TEXT NOT NULL,
  role_label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'music_note',
  target_count INTEGER NOT NULL DEFAULT 1,
  confirmed_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

-- 12. Tabela de Votos nas Enquetes de Disponibilidade
CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  is_available INTEGER NOT NULL DEFAULT 1,
  role_key TEXT NOT NULL DEFAULT 'vocal',
  role_label TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  voted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(poll_id, user_id),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 13. Tabela de Notificações do Sistema
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 14. Tabela de Configurações e Parâmetros Protegidos do Sistema
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description TEXT DEFAULT '',
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. Tabela de Logs de Auditoria Administrativa
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
