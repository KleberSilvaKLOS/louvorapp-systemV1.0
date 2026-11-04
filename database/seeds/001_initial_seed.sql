-- ============================================================================
-- LOUVORAPP - SEED 001: CONFIGURAÇÃO LIMPA (BANCO ZERADO PARA PRODUÇÃO)
-- Nenhum usuário, escala, histórico ou troca fictícia é inserido.
-- Apenas as permissões estruturais (ADMIN / USER) e parâmetros básicos do sistema.
-- ============================================================================

-- 1. Permissões Granulares Padrão por Perfil (ADMIN e USER)
INSERT OR IGNORE INTO role_permissions (role, module, module_label, can_view, can_create, can_edit, can_delete, can_approve) VALUES
  ('ADMIN', 'schedules',  'Calendário & Escalas',         1, 1, 1, 1, 1),
  ('ADMIN', 'repertoire', 'Repertório & Cifras',          1, 1, 1, 1, 1),
  ('ADMIN', 'swaps',      'Trocas & Substituições',       1, 1, 1, 1, 1),
  ('ADMIN', 'polls',      'Enquetes de Disponibilidade',  1, 1, 1, 1, 1),
  ('ADMIN', 'users',      'Gestão de Usuários & Equipe',  1, 1, 1, 1, 1),
  ('ADMIN', 'settings',   'Configurações & Permissões',   1, 1, 1, 1, 1),
  ('ADMIN', 'profile',    'Perfil & Preferências',        1, 1, 1, 1, 1),
  ('USER',  'schedules',  'Calendário & Escalas',         1, 0, 0, 0, 0),
  ('USER',  'repertoire', 'Repertório & Cifras',          1, 0, 0, 0, 0),
  ('USER',  'swaps',      'Trocas & Substituições',       1, 1, 1, 0, 0),
  ('USER',  'polls',      'Enquetes de Disponibilidade',  1, 1, 1, 0, 0),
  ('USER',  'users',      'Gestão de Usuários & Equipe',  0, 0, 0, 0, 0),
  ('USER',  'settings',   'Configurações & Permissões',   0, 0, 0, 0, 0),
  ('USER',  'profile',    'Perfil & Preferências',        1, 1, 1, 0, 0);

-- 2. Configurações Básicas do Sistema
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
  ('swap_deadline_hours', '24', 'Prazo limite para solicitação de troca antes do culto (em horas)'),
  ('swap_deadline_active', 'true', 'Ativar validação de prazo limite para trocas'),
  ('rehearsal_auto_approve', 'true', 'Autoaprovação de trocas em ensaios sem necessidade do líder'),
  ('min_rest_hours_warning', '14', 'Intervalo mínimo em horas entre cultos antes de exibir Alerta de Fadiga'),
  ('ministry_name', 'Ministério de Louvor & Adoração', 'Nome oficial do ministério'),
  ('current_campus', 'Campus Central', 'Campus padrão ativo'),
  ('available_campuses', 'Campus Central,Campus Zona Sul,Campus Norte,Auditório 2 (Jovens)', 'Lista de campus disponíveis'),
  ('pastor_leader_name', 'Liderança de Louvor', 'Nome do Pastor / Líder Geral'),
  ('pastor_leader_whatsapp', '', 'WhatsApp direto do Pastor / Líder'),
  ('app_theme', 'Dark Stage', 'Tema visual do aplicativo'),
  ('next_rehearsal_banner', 'Consulte o Calendário|Cadastre-se para ver os próximos ensaios e cultos', 'Banner na tela inicial');
