CREATE TABLE courier_performance (
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
CREATE INDEX idx_cp_user_courier ON courier_performance(user_id, courier_id);
CREATE INDEX idx_cp_created_at ON courier_performance(created_at);