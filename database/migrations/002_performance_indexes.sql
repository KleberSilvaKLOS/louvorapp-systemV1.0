-- ============================================================================
-- MIGRATION 002: ÍNDICES DE PERFORMANCE E OTIMIZAÇÃO PARA 500+ USUÁRIOS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role);

CREATE INDEX IF NOT EXISTS idx_user_skills_user_id ON user_skills(user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON schedules(event_date, status);
CREATE INDEX IF NOT EXISTS idx_schedules_campus ON schedules(campus);

CREATE INDEX IF NOT EXISTS idx_schedule_members_schedule_id ON schedule_members(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_members_user_id ON schedule_members(user_id);

CREATE INDEX IF NOT EXISTS idx_schedule_songs_schedule_id ON schedule_songs(schedule_id, sequence_order);

CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON swap_requests(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_swap_requests_requester ON swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_substitute ON swap_requests(substitute_id);
CREATE INDEX IF NOT EXISTS idx_swap_requests_schedule ON swap_requests(schedule_id);

CREATE INDEX IF NOT EXISTS idx_polls_status_date ON polls(status, is_featured DESC, event_date ASC);
CREATE INDEX IF NOT EXISTS idx_poll_targets_poll_id ON poll_targets(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id, is_available);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(id DESC);
