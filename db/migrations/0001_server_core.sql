CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(191) NOT NULL,
  email VARCHAR(254) NULL,
  display_name VARCHAR(160) NOT NULL,
  cross_workspace_overview TINYINT(1) NOT NULL DEFAULT 0,
  active_workspace_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_provider_subject (provider, provider_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  origin VARCHAR(512) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_app_sessions_token_hash (token_hash),
  KEY ix_app_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_app_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  intent VARCHAR(40) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  goals JSON NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL DEFAULT '',
  accent VARCHAR(20) NOT NULL,
  logo VARCHAR(8) NOT NULL DEFAULT '',
  assistant_memory JSON NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_workspaces_owner_created (user_id, created_at),
  CONSTRAINT fk_workspaces_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  archived_at DATETIME(3) NULL,
  KEY ix_conversations_owner_workspace (user_id, workspace_id, updated_at),
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  conversation_id VARCHAR(100) NOT NULL,
  role VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL,
  KEY ix_messages_conversation (user_id, workspace_id, conversation_id, created_at),
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  project_type VARCHAR(40) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  targets JSON NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Local draft',
  created_at DATETIME(3) NOT NULL,
  KEY ix_projects_owner_workspace (user_id, workspace_id),
  CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS workspace_tasks (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  KEY ix_workspace_tasks_owner (user_id, workspace_id),
  CONSTRAINT fk_workspace_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_tasks_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS workspace_files (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_workspace_files_owner (user_id, workspace_id),
  CONSTRAINT fk_workspace_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS workspace_activity (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  label VARCHAR(240) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_workspace_activity_owner (user_id, workspace_id, created_at),
  CONSTRAINT fk_workspace_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_activity_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sharing_grants (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  owner_workspace_id VARCHAR(80) NOT NULL,
  connection_id VARCHAR(100) NULL,
  provider VARCHAR(80) NOT NULL,
  account_label VARCHAR(160) NOT NULL,
  share_with_all TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'intent',
  external_enforced TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  KEY ix_sharing_grants_owner (user_id, owner_workspace_id, status),
  CONSTRAINT fk_sharing_grants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sharing_grants_workspace FOREIGN KEY (owner_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sharing_grant_targets (
  grant_id VARCHAR(100) NOT NULL,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  PRIMARY KEY (grant_id, workspace_id),
  CONSTRAINT fk_grant_targets_grant FOREIGN KEY (grant_id) REFERENCES sharing_grants(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_targets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_grant_targets_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sharing_grant_scopes (
  grant_id VARCHAR(100) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  PRIMARY KEY (grant_id, scope),
  CONSTRAINT fk_grant_scopes_grant FOREIGN KEY (grant_id) REFERENCES sharing_grants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aurix_tasks (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  conversation_id VARCHAR(100) NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'chat_completion',
  input_text TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'awaiting_approval',
  result_text MEDIUMTEXT NULL,
  failure_code VARCHAR(80) NULL,
  failure_message VARCHAR(500) NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_attempt_at DATETIME(3) NULL,
  lease_until DATETIME(3) NULL,
  lease_owner VARCHAR(100) NULL,
  approved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY ix_aurix_tasks_queue (status, next_attempt_at, lease_until),
  KEY ix_aurix_tasks_owner (user_id, workspace_id, created_at),
  CONSTRAINT fk_aurix_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_aurix_tasks_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_aurix_tasks_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS task_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  user_id CHAR(36) NOT NULL,
  decision VARCHAR(16) NOT NULL,
  decided_at DATETIME(3) NOT NULL,
  KEY ix_task_approvals_task (task_id, decided_at),
  CONSTRAINT fk_task_approvals_task FOREIGN KEY (task_id) REFERENCES aurix_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_approvals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS task_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  attempt_no INT NOT NULL,
  status VARCHAR(24) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  failure_code VARCHAR(80) NULL,
  failure_message VARCHAR(500) NULL,
  UNIQUE KEY uq_task_attempt (task_id, attempt_no),
  CONSTRAINT fk_task_attempts_task FOREIGN KEY (task_id) REFERENCES aurix_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  action VARCHAR(80) NOT NULL,
  detail JSON NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_audit_owner_created (user_id, created_at),
  KEY ix_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  hits INT NOT NULL,
  reset_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_name VARCHAR(200) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
