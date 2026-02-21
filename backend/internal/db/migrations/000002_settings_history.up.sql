-- Migration: 000002_settings_history.up.sql
-- User-level settings (Maps API key, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    maps_key TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Comparison session history
CREATE TABLE IF NOT EXISTS comparison_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_count INT NOT NULL DEFAULT 0,
    accurate_count INT NOT NULL DEFAULT 0,
    fairly_count INT NOT NULL DEFAULT 0,
    inaccurate_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_user_id ON comparison_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_comparison_sessions_created_at ON comparison_sessions(created_at DESC);