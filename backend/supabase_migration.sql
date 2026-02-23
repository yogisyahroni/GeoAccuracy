-- ============================================================
-- GeoVerify Logistics - Complete Database Migration Script
-- Apply to Supabase via SQL Editor
-- Project: odawdxitezoivptffnsy
-- Generated: 2026-02-23
-- ============================================================
-- ── Migration 000001: Initial Schema ─────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'observer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(email));
CREATE TABLE IF NOT EXISTS geocode_cache (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address_hash TEXT NOT NULL UNIQUE,
    original_address TEXT NOT NULL,
    city TEXT,
    province TEXT,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    provider TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS geocode_cache_address_hash_idx ON geocode_cache (address_hash);
CREATE TABLE IF NOT EXISTS search_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE
    SET NULL,
        total_records INTEGER NOT NULL,
        accurate_count INTEGER NOT NULL,
        fairly_accurate_count INTEGER NOT NULL,
        inaccurate_count INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_logs_user_id_idx ON search_logs (user_id);
-- ── Migration 000002: Settings & History ─────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    maps_key TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
-- ── Migration 000003: Datasource Tables ──────────────────────
CREATE TABLE IF NOT EXISTS data_sources (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    database VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transformation_pipelines (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_source_id BIGINT NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- ── Migration 000004: Areas Table (PostGIS) ───────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_areas_geom ON areas USING GIST (geom);
-- ── Migration 000005: Courier Performance ────────────────────
CREATE TABLE IF NOT EXISTS courier_performance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    batch_id VARCHAR(255) NOT NULL,
    courier_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255),
    reported_lat DOUBLE PRECISION NOT NULL,
    reported_lng DOUBLE PRECISION NOT NULL,
    actual_lat DOUBLE PRECISION,
    actual_lng DOUBLE PRECISION,
    distance_variance_meters DOUBLE PRECISION,
    accuracy_status VARCHAR(50) NOT NULL CHECK (
        accuracy_status IN (
            'accurate',
            'fairly_accurate',
            'inaccurate',
            'error'
        )
    ),
    sla_status VARCHAR(50) NOT NULL CHECK (sla_status IN ('on_time', 'late', 'unknown')),
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_user_courier ON courier_performance(user_id, courier_id);
CREATE INDEX IF NOT EXISTS idx_cp_created_at ON courier_performance(created_at);
-- ── Migration 000008: ERP Integrations ───────────────────────
CREATE TABLE IF NOT EXISTS erp_integrations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET' CHECK (method IN ('GET', 'POST')),
    auth_header_key TEXT NOT NULL DEFAULT 'Authorization',
    auth_header_value TEXT,
    cron_schedule TEXT NOT NULL,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_integrations_user_id_idx ON erp_integrations (user_id);
-- ── Seed: Create default admin user ──────────────────────────
-- Password: Admin123! (bcrypt hash - change after first login)
INSERT INTO users (name, email, password_hash, role)
VALUES (
        'Admin GeoVerify',
        'admin@geoverify.com',
        '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'admin'
    ) ON CONFLICT (email) DO NOTHING;
-- ============================================================
-- END OF MIGRATION SCRIPT
-- All tables created with IF NOT EXISTS for idempotency
-- ============================================================