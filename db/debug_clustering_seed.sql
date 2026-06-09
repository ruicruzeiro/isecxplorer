-- Synthetic sessions for debugging K-Means clustering in the real database.
--
-- Usage from backend/:
--   psql -U postgres -d isecxplorer -f ../db/debug_clustering_seed.sql
--
-- This file inserts 2 synthetic sessions by default.
-- To add the next 2 sessions, uncomment the second INSERT block near the end.
-- Profiles:
--   Rodrigo: very fast, weak quiz
--   Mariana: quiz master, solid time
--   Tiago: explorer, high distance and stops
--   Ines: slow route, many stops

-- Optional reset for a clean synthetic test.
-- Uncomment only if you want to remove the current synthetic dataset.
--
-- TRUNCATE TABLE
--     quiz_attempts,
--     poi_events,
--     trajectory_points,
--     sessions
-- RESTART IDENTITY;

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
VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'Rodrigo',
        1150,
        22,
        1500,
        8,
        22,
        300,
        1300,
        1,
        1300.0 / 1500.0,
        'unranked',
        CURRENT_DATE,
        now() - interval '2 hours'
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'Mariana',
        1700,
        22,
        2200,
        21,
        22,
        220,
        1500,
        1,
        1500.0 / 2200.0,
        'unranked',
        CURRENT_DATE,
        now() - interval '1 hour'
    )
ON CONFLICT (session_uuid)
DO UPDATE SET
    player_alias = EXCLUDED.player_alias,
    score = EXCLUDED.score,
    pois_count = EXCLUDED.pois_count,
    duration_s = EXCLUDED.duration_s,
    quiz_correct = EXCLUDED.quiz_correct,
    quiz_total = EXCLUDED.quiz_total,
    quiz_time_total_s = EXCLUDED.quiz_time_total_s,
    distance_m = EXCLUDED.distance_m,
    stops_count = EXCLUDED.stops_count,
    avg_speed_mps = EXCLUDED.avg_speed_mps,
    badge = EXCLUDED.badge,
    played_date = EXCLUDED.played_date,
    played_at = EXCLUDED.played_at;

-- Second batch for observing how clusters/badges can change after more users.
-- Uncomment this block after testing the first 2 sessions.
--
-- INSERT INTO sessions (
--     session_uuid,
--     player_alias,
--     score,
--     pois_count,
--     duration_s,
--     quiz_correct,
--     quiz_total,
--     quiz_time_total_s,
--     distance_m,
--     stops_count,
--     avg_speed_mps,
--     badge,
--     played_date,
--     played_at
-- )
-- VALUES
--     (
--         '33333333-3333-3333-3333-333333333333',
--         'Tiago',
--         1450,
--         21,
--         3600,
--         14,
--         21,
--         500,
--         3200,
--         10,
--         3200.0 / 3600.0,
--         'unranked',
--         CURRENT_DATE,
--         now() - interval '30 minutes'
--     ),
--     (
--         '44444444-4444-4444-4444-444444444444',
--         'Ines',
--         850,
--         18,
--         4800,
--         9,
--         18,
--         720,
--         1600,
--         16,
--         1600.0 / 4800.0,
--         'unranked',
--         CURRENT_DATE,
--         now() - interval '10 minutes'
--     )
-- ON CONFLICT (session_uuid)
-- DO UPDATE SET
--     player_alias = EXCLUDED.player_alias,
--     score = EXCLUDED.score,
--     pois_count = EXCLUDED.pois_count,
--     duration_s = EXCLUDED.duration_s,
--     quiz_correct = EXCLUDED.quiz_correct,
--     quiz_total = EXCLUDED.quiz_total,
--     quiz_time_total_s = EXCLUDED.quiz_time_total_s,
--     distance_m = EXCLUDED.distance_m,
--     stops_count = EXCLUDED.stops_count,
--     avg_speed_mps = EXCLUDED.avg_speed_mps,
--     badge = EXCLUDED.badge,
--     played_date = EXCLUDED.played_date,
--     played_at = EXCLUDED.played_at;
