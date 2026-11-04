-- ============================================================================
-- LOUVORAPP - MIGRATION 003: PERÍODOS DE INDISPONIBILIDADE & ÍNDICES DE CONSULTA
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_unavailabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Indisponibilidade informada',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_unavailabilities_user_dates ON user_unavailabilities (user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_unavailabilities_dates ON user_unavailabilities (start_date, end_date);
