CREATE TABLE erp_integrations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST')),
    auth_header_key TEXT NOT NULL DEFAULT 'Authorization',
    auth_header_value TEXT,
    -- Encrypted AES String
    cron_schedule TEXT NOT NULL,
    -- e.g., '*/15 * * * *'
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX erp_integrations_user_id_idx ON erp_integrations (user_id);