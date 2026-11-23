CREATE TABLE IF NOT EXISTS oauth_transactions (
  state_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  redirect_origin VARCHAR(512) NOT NULL,
  redirect_uri VARCHAR(1024) NOT NULL,
  scopes JSON NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_oauth_transactions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_oauth_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_oauth_transactions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS provider_connections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  workspace_id VARCHAR(80) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_account_id VARCHAR(191) NOT NULL,
  account_label VARCHAR(160) NOT NULL,
  scope_categories JSON NOT NULL,
  provider_scopes JSON NOT NULL,
  access_token_ciphertext MEDIUMTEXT NULL,
  refresh_token_ciphertext MEDIUMTEXT NULL,
  token_type VARCHAR(32) NOT NULL DEFAULT 'Bearer',
  expires_at DATETIME(3) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'connected',
  connected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  disconnected_at DATETIME(3) NULL,
  UNIQUE KEY uq_provider_connection_account (user_id, workspace_id, provider, provider_account_id),
  KEY ix_provider_connections_workspace (user_id, workspace_id, status),
  CONSTRAINT fk_provider_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_connections_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
