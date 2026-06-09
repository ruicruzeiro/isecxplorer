CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Limpar dados sintéticos anteriores
-- ============================================================

DELETE FROM quiz_attempts
WHERE player_alias LIKE 'TEST_%';

DELETE FROM poi_events
WHERE player_alias LIKE 'TEST_%';

DELETE FROM trajectory_points
WHERE player_alias LIKE 'TEST_%';

DELETE FROM sessions
WHERE player_alias LIKE 'TEST_%';

-- ============================================================
-- Criar sessões sintéticas
-- ============================================================

DROP TABLE IF EXISTS tmp_seed_sessions;

CREATE TEMP TABLE tmp_seed_sessions AS
SELECT *
FROM (
    VALUES
        (gen_random_uuid(), 'TEST_Speed_1',    2100, 21,  850, 20, 21, 260,  850.0,  2, 'speedrunner'),
        (gen_random_uuid(), 'TEST_Speed_2',    1980, 21,  920, 19, 21, 285,  820.0,  3, 'speedrunner'),
        (gen_random_uuid(), 'TEST_Speed_3',    2050, 21,  780, 19, 21, 245,  880.0,  2, 'speedrunner'),

        (gen_random_uuid(), 'TEST_Explorer_1', 1600, 21, 1700, 15, 21, 620, 1450.0,  8, 'explorer'),
        (gen_random_uuid(), 'TEST_Explorer_2', 1520, 21, 1850, 14, 21, 680, 1580.0, 10, 'explorer'),
        (gen_random_uuid(), 'TEST_Explorer_3', 1480, 20, 1780, 13, 20, 650, 1690.0, 11, 'explorer'),

        (gen_random_uuid(), 'TEST_Quiz_1',     1850, 21, 1350, 21, 21, 540,  760.0,  4, 'quiz_master'),
        (gen_random_uuid(), 'TEST_Quiz_2',     1760, 21, 1450, 20, 21, 560,  790.0,  5, 'quiz_master'),
        (gen_random_uuid(), 'TEST_Quiz_3',     1810, 20, 1420, 20, 20, 500,  735.0,  4, 'quiz_master'),

        (gen_random_uuid(), 'TEST_Snail_1',     800, 21, 3900,  9, 21, 1400, 620.0, 16, 'snail'),
        (gen_random_uuid(), 'TEST_Snail_2',     720, 21, 4300,  7, 21, 1500, 690.0, 18, 'snail'),
        (gen_random_uuid(), 'TEST_Snail_3',     760, 19, 4550,  8, 19, 1320, 640.0, 19, 'snail'),

        (gen_random_uuid(), 'TEST_Rookie_1',   1120, 16, 2450, 10, 16, 520,  720.0,  7, 'rookie'),
        (gen_random_uuid(), 'TEST_Rookie_2',   1180, 17, 2680, 11, 17, 560,  760.0,  8, 'rookie'),
        (gen_random_uuid(), 'TEST_Rookie_3',   1050, 15, 2320,  9, 15, 480,  690.0,  6, 'rookie')
) AS t(
    session_uuid,
    player_alias,
    score,
    pois_count,
    duration_s,
    quiz_correct,
    quiz_total,
    quiz_time_total_s,
    distance_m,
    stops_count,
    badge
);

INSERT INTO sessions (
    session_uuid,
    player_alias,
    score,
    pois_count,
    duration_s,
    quiz_correct,
    quiz_total,
    quiz_time_total_s,
    distance_m,
    stops_count,
    avg_speed_mps,
    badge,
    played_date,
    played_at
)
SELECT
    session_uuid,
    player_alias,
    score,
    pois_count,
    duration_s,
    quiz_correct,
    quiz_total,
    quiz_time_total_s,
    distance_m,
    stops_count,
    CASE
        WHEN duration_s > 0 THEN distance_m / duration_s
        ELSE 0
    END AS avg_speed_mps,
    badge,
    CURRENT_DATE,
    CURRENT_TIMESTAMP - (random() * interval '2 days')
FROM tmp_seed_sessions;

-- ============================================================
-- Pontos sintéticos aproximados da rota
-- Coordenadas WGS84: lat/lon
-- Nota: servem para teste analítico, não para navegação real.
-- ============================================================

DROP TABLE IF EXISTS tmp_route_points;

CREATE TEMP TABLE tmp_route_points (
    seq INTEGER,
    poi TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION
);

INSERT INTO tmp_route_points(seq, poi, lat, lon)
VALUES
    (1,  'gerais',       40.19295, -8.41095),
    (2,  'polivalente',  40.19315, -8.41070),
    (3,  'auditorio',    40.19330, -8.41040),
    (4,  'dec',          40.19310, -8.41005),
    (5,  'altice',       40.19285, -8.40980),
    (6,  'dem',          40.19260, -8.40990),
    (7,  'dee',          40.19235, -8.41005),
    (8,  'gab_electro',  40.19215, -8.41030),
    (9,  'deem',         40.19195, -8.41055),
    (10, 'lab_mecanica', 40.19175, -8.41085),
    (11, 'lab_civil',    40.19155, -8.41110),
    (12, 'horta',        40.19135, -8.41135),
    (13, 'carregador',   40.19155, -8.41170),
    (14, 'deis',         40.19185, -8.41195),
    (15, 'cantina',      40.19215, -8.41215),
    (16, 'clinica',      40.19245, -8.41205),
    (17, 'reprografia',  40.19270, -8.41185),
    (18, 'aeisec',       40.19295, -8.41160),
    (19, 'festas',       40.19320, -8.41135),
    (20, 'deqb',         40.19335, -8.41105),
    (21, 'bar_loja',     40.19310, -8.41080);

-- ============================================================
-- Criar trajectórias sintéticas entre pontos da rota
-- ============================================================

WITH route_edges AS (
    SELECT
        seq,
        poi,
        lat,
        lon,
        LEAD(poi) OVER (ORDER BY seq) AS next_poi,
        LEAD(lat) OVER (ORDER BY seq) AS next_lat,
        LEAD(lon) OVER (ORDER BY seq) AS next_lon
    FROM tmp_route_points
),
valid_edges AS (
    SELECT *
    FROM route_edges
    WHERE next_poi IS NOT NULL
),
session_offsets AS (
    SELECT
        session_uuid,
        player_alias,
        CASE
            WHEN player_alias LIKE '%Explorer%' THEN 0.00018
            WHEN player_alias LIKE '%Snail%' THEN -0.00010
            WHEN player_alias LIKE '%Quiz%' THEN 0.00006
            ELSE 0.00000
        END AS lat_offset,
        CASE
            WHEN player_alias LIKE '%Explorer%' THEN -0.00018
            WHEN player_alias LIKE '%Snail%' THEN 0.00010
            WHEN player_alias LIKE '%Quiz%' THEN 0.00005
            ELSE 0.00000
        END AS lon_offset,
        CASE
            WHEN player_alias LIKE '%Speed%' THEN 6
            WHEN player_alias LIKE '%Explorer%' THEN 12
            WHEN player_alias LIKE '%Quiz%' THEN 8
            ELSE 14
        END AS steps_per_edge
    FROM tmp_seed_sessions
),
generated_points AS (
    SELECT
        s.session_uuid,
        s.player_alias,
        e.seq,
        e.next_poi AS current_poi,
        g.step,
        (
            e.lat
            + ((e.next_lat - e.lat) * (g.step::DOUBLE PRECISION / s.steps_per_edge))
            + s.lat_offset
            + ((random() - 0.5) * 0.000035)
        ) AS lat,
        (
            e.lon
            + ((e.next_lon - e.lon) * (g.step::DOUBLE PRECISION / s.steps_per_edge))
            + s.lon_offset
            + ((random() - 0.5) * 0.000035)
        ) AS lon,
        s.steps_per_edge
    FROM session_offsets s
    CROSS JOIN valid_edges e
    CROSS JOIN LATERAL generate_series(0, s.steps_per_edge) AS g(step)
)
INSERT INTO trajectory_points (
    session_uuid,
    player_alias,
    recorded_at,
    client_timestamp,
    lat,
    lon,
    accuracy_m,
    speed_mps,
    heading,
    current_poi,
    zone,
    geom
)
SELECT
    session_uuid,
    player_alias,
    CURRENT_TIMESTAMP
        - interval '1 day'
        + ((seq * 60 + step * 5) * interval '1 second') AS recorded_at,
    (
        EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000
        + ((seq * 60 + step * 5) * 1000)
    )::BIGINT AS client_timestamp,
    lat,
    lon,
    5 + random() * 8 AS accuracy_m,
    CASE
        WHEN player_alias LIKE '%Speed%' THEN 1.6 + random() * 0.4
        WHEN player_alias LIKE '%Snail%' THEN 0.45 + random() * 0.25
        ELSE 1.0 + random() * 0.35
    END AS speed_mps,
    random() * 360 AS heading,
    current_poi,
    'synthetic_route',
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)
FROM generated_points;

-- ============================================================
-- Criar eventos de chegada aos POIs
-- ============================================================

INSERT INTO poi_events (
    session_uuid,
    player_alias,
    poi,
    event_type,
    event_at,
    elapsed_s,
    score_after_event,
    lat,
    lon,
    geom,
    event_data
)
SELECT
    s.session_uuid,
    s.player_alias,
    r.poi,
    'poi_arrival',
    CURRENT_TIMESTAMP - interval '1 day' + ((r.seq * 90) * interval '1 second'),
    CASE
        WHEN s.player_alias LIKE '%Speed%' THEN r.seq * 35
        WHEN s.player_alias LIKE '%Snail%' THEN r.seq * 180
        ELSE r.seq * 80
    END AS elapsed_s,
    LEAST(s.score, r.seq * 100) AS score_after_event,
    r.lat,
    r.lon,
    ST_SetSRID(ST_MakePoint(r.lon, r.lat), 4326),
    jsonb_build_object(
        'synthetic', true,
        'route_seq', r.seq
    )
FROM tmp_seed_sessions s
CROSS JOIN tmp_route_points r;

-- ============================================================
-- Criar respostas sintéticas aos quizzes
-- ============================================================

INSERT INTO quiz_attempts (
    session_uuid,
    player_alias,
    poi,
    question,
    selected_answer,
    correct_answer,
    is_correct,
    response_time_s,
    answered_at
)
SELECT
    s.session_uuid,
    s.player_alias,
    r.poi,
    'Pergunta sintética para ' || r.poi AS question,
    CASE
        WHEN r.seq <= s.quiz_correct THEN 'Resposta correta'
        ELSE 'Resposta errada'
    END AS selected_answer,
    'Resposta correta' AS correct_answer,
    r.seq <= s.quiz_correct AS is_correct,
    CASE
        WHEN s.player_alias LIKE '%Speed%' THEN 8 + floor(random() * 10)::INTEGER
        WHEN s.player_alias LIKE '%Quiz%' THEN 18 + floor(random() * 14)::INTEGER
        WHEN s.player_alias LIKE '%Explorer%' THEN 25 + floor(random() * 20)::INTEGER
        ELSE 50 + floor(random() * 35)::INTEGER
    END AS response_time_s,
    CURRENT_TIMESTAMP - interval '1 day' + ((r.seq * 100) * interval '1 second')
FROM tmp_seed_sessions s
CROSS JOIN tmp_route_points r;

-- ============================================================
-- Verificações rápidas
-- ============================================================

SELECT 'sessions' AS table_name, COUNT(*) AS total
FROM sessions
WHERE player_alias LIKE 'TEST_%'

UNION ALL

SELECT 'trajectory_points', COUNT(*)
FROM trajectory_points
WHERE player_alias LIKE 'TEST_%'

UNION ALL

SELECT 'poi_events', COUNT(*)
FROM poi_events
WHERE player_alias LIKE 'TEST_%'

UNION ALL

SELECT 'quiz_attempts', COUNT(*)
FROM quiz_attempts
WHERE player_alias LIKE 'TEST_%';
