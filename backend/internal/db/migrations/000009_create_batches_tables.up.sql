CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS batch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    connote VARCHAR(100) NOT NULL,
    recipient_name VARCHAR(255),
    system_address TEXT,
    system_lat DOUBLE PRECISION,
    system_lng DOUBLE PRECISION,
    field_lat DOUBLE PRECISION,
    field_lng DOUBLE PRECISION,
    distance_km DOUBLE PRECISION,
    accuracy_level VARCHAR(50),
    error TEXT,
    geocode_status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_batches_user_id ON batches(user_id);
CREATE INDEX idx_batch_items_batch_id ON batch_items(batch_id);
CREATE INDEX idx_batch_items_connote ON batch_items(connote);