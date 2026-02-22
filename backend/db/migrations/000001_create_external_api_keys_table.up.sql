CREATE TABLE IF NOT EXISTS external_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    -- e.g., "SAP Production Server"
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    -- Store hashes! Do not store raw API keys.
    prefix VARCHAR(50) NOT NULL,
    -- To help user identify the key e.g. "sk_prod_..."
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_external_api_keys_user_id ON external_api_keys(user_id);