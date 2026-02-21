CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (LOWER(email));
CREATE TABLE geocode_cache (
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
CREATE INDEX geocode_cache_address_hash_idx ON geocode_cache (address_hash);
CREATE TABLE search_logs (
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
CREATE INDEX search_logs_user_id_idx ON search_logs (user_id);