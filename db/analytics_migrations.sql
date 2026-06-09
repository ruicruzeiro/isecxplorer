CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    player_alias TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    pois_count INTEGER NOT NULL DEFAULT 0,
    duration_s INTEGER NOT NULL DEFAULT 0,
    played_date DATE DEFAULT CURRENT_DATE
);

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS session_uuid UUID;

UPDATE sessions
SET session_uuid = gen_random_uuid()
WHERE session_uuid IS NULL;

ALTER TABLE sessions
ALTER COLUMN session_uuid SET DEFAULT gen_random_uuid();

ALTER TABLE sessions
ALTER COLUMN session_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_session_uuid
ON sessions(session_uuid);

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS quiz_correct INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS quiz_total INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS quiz_time_total_s INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS stops_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_speed_mps DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS badge TEXT NOT NULL DEFAULT 'unranked',
ADD COLUMN IF NOT EXISTS cluster_id INTEGER,
ADD COLUMN IF NOT EXISTS cluster_label TEXT,
ADD COLUMN IF NOT EXISTS played_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS trajectory_points (
    id BIGSERIAL PRIMARY KEY,
    session_uuid UUID NOT NULL,
    player_alias TEXT,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    client_timestamp BIGINT,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    accuracy_m DOUBLE PRECISION,
    speed_mps DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    current_poi TEXT,
    zone TEXT,
    geom geometry(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trajectory_points_geom
ON trajectory_points
USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_trajectory_points_session_time
ON trajectory_points(session_uuid, recorded_at);

CREATE TABLE IF NOT EXISTS poi_events (
    id BIGSERIAL PRIMARY KEY,
    session_uuid UUID NOT NULL,
    player_alias TEXT,
    poi TEXT,
    event_type TEXT NOT NULL,
    event_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    elapsed_s INTEGER,
    score_after_event INTEGER,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    geom geometry(Point, 4326),
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_poi_events_session
ON poi_events(session_uuid, event_at);

CREATE INDEX IF NOT EXISTS idx_poi_events_geom
ON poi_events
USING GIST (geom);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id BIGSERIAL PRIMARY KEY,
    session_uuid UUID NOT NULL,
    player_alias TEXT,
    poi TEXT NOT NULL,
    question TEXT,
    selected_answer TEXT,
    correct_answer TEXT,
    is_correct BOOLEAN,
    response_time_s INTEGER,
    answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_session
ON quiz_attempts(session_uuid);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_poi
ON quiz_attempts(poi);

CREATE OR REPLACE VIEW best_player_sessions AS
SELECT DISTINCT ON (player_alias)
    *
FROM sessions
ORDER BY player_alias, score DESC, duration_s ASC;