import argparse
import json
import random
from pathlib import Path

from db import get_connection
from performance_clustering import recompute_performance_clusters


FIRST_BATCH = [
    (
        "11111111-1111-1111-1111-111111111111",
        "Rodrigo",
        1150,
        22,
        1500,
        8,
        22,
        300,
        1300,
        1,
        "2 hours",
    ),
    (
        "22222222-2222-2222-2222-222222222222",
        "Mariana",
        1700,
        22,
        2200,
        21,
        22,
        220,
        1500,
        1,
        "1 hour",
    ),
]

SECOND_BATCH = [
    (
        "33333333-3333-3333-3333-333333333333",
        "Tiago",
        1450,
        21,
        3600,
        14,
        21,
        500,
        3200,
        10,
        "30 minutes",
    ),
    (
        "44444444-4444-4444-4444-444444444444",
        "Ines",
        850,
        18,
        4800,
        9,
        18,
        720,
        1600,
        16,
        "10 minutes",
    ),
]

ROUTE_POINTS = [
    ("gerais", 40.19295, -8.41095),
    ("polivalente", 40.19315, -8.41070),
    ("auditorio", 40.19330, -8.41040),
    ("dec", 40.19310, -8.41005),
    ("altice", 40.19285, -8.40980),
    ("dem", 40.19260, -8.40990),
    ("dee", 40.19235, -8.41005),
    ("gab_electro", 40.19215, -8.41030),
    ("deem", 40.19195, -8.41055),
    ("lab_mecanica", 40.19175, -8.41085),
    ("lab_civil", 40.19155, -8.41110),
    ("horta", 40.19135, -8.41135),
    ("carregador", 40.19155, -8.41170),
    ("deis", 40.19185, -8.41195),
    ("cantina", 40.19215, -8.41215),
    ("clinica", 40.19245, -8.41205),
    ("reprografia", 40.19270, -8.41185),
    ("aeisec", 40.19295, -8.41160),
    ("festas", 40.19320, -8.41135),
    ("deqb", 40.19335, -8.41105),
    ("bar_loja", 40.19310, -8.41080),
]

ANALYTICS_PROFILES = {
    "Rodrigo": {
        "lat_offset": 0.00000,
        "lon_offset": 0.00000,
        "steps_per_edge": 5,
        "accuracy_base": 6,
        "speed_base": 1.75,
    },
    "Mariana": {
        "lat_offset": 0.00005,
        "lon_offset": 0.00004,
        "steps_per_edge": 7,
        "accuracy_base": 7,
        "speed_base": 1.25,
    },
    "Tiago": {
        "lat_offset": 0.00018,
        "lon_offset": -0.00018,
        "steps_per_edge": 12,
        "accuracy_base": 8,
        "speed_base": 1.05,
    },
    "Ines": {
        "lat_offset": -0.00010,
        "lon_offset": 0.00010,
        "steps_per_edge": 14,
        "accuracy_base": 9,
        "speed_base": 0.55,
    },
}


def apply_migrations():
    migration_path = Path(__file__).resolve().parent.parent / "db" / "analytics_migrations.sql"
    sql = migration_path.read_text(encoding="utf-8")

    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(sql)
        conn.commit()
        print(f"Applied migration: {migration_path}")
    finally:
        cur.close()
        conn.close()


def reset_data():
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            TRUNCATE TABLE
                quiz_attempts,
                poi_events,
                trajectory_points,
                sessions
            RESTART IDENTITY
            """
        )
        conn.commit()
    finally:
        cur.close()
        conn.close()


def seed_sessions(rows):
    conn = get_connection()
    cur = conn.cursor()

    try:
        for row in rows:
            (
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
                played_ago,
            ) = row

            avg_speed_mps = distance_m / duration_s if duration_s > 0 else 0

            cur.execute(
                """
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
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    'unranked',
                    CURRENT_DATE,
                    now() - (%s)::interval
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
                    played_at = EXCLUDED.played_at
                """,
                (
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
                    played_ago,
                ),
            )

        conn.commit()
    finally:
        cur.close()
        conn.close()


def _synthetic_players():
    return tuple(ANALYTICS_PROFILES.keys())


def seed_analytics():
    rng = random.Random(42)
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT session_uuid, player_alias
            FROM sessions
            WHERE player_alias = ANY(%s)
            ORDER BY played_at ASC
            """,
            (list(_synthetic_players()),),
        )
        sessions = cur.fetchall()

        if not sessions:
            print("No synthetic sessions found. Run --seed-first first.")
            return

        cur.execute(
            """
            DELETE FROM quiz_attempts
            WHERE player_alias = ANY(%s)
            """,
            (list(_synthetic_players()),),
        )
        cur.execute(
            """
            DELETE FROM poi_events
            WHERE player_alias = ANY(%s)
            """,
            (list(_synthetic_players()),),
        )
        cur.execute(
            """
            DELETE FROM trajectory_points
            WHERE player_alias = ANY(%s)
            """,
            (list(_synthetic_players()),),
        )

        for session_uuid, player_alias in sessions:
            profile = ANALYTICS_PROFILES[player_alias]
            point_index = 0

            for edge_index, (start, end) in enumerate(
                zip(ROUTE_POINTS, ROUTE_POINTS[1:]),
                start=1,
            ):
                _, start_lat, start_lon = start
                current_poi, end_lat, end_lon = end
                steps = profile["steps_per_edge"]

                for step in range(steps + 1):
                    progress = step / steps
                    lat = (
                        start_lat
                        + ((end_lat - start_lat) * progress)
                        + profile["lat_offset"]
                        + rng.uniform(-0.000015, 0.000015)
                    )
                    lon = (
                        start_lon
                        + ((end_lon - start_lon) * progress)
                        + profile["lon_offset"]
                        + rng.uniform(-0.000015, 0.000015)
                    )
                    accuracy_m = profile["accuracy_base"] + rng.uniform(0, 5)
                    speed_mps = profile["speed_base"] + rng.uniform(-0.12, 0.12)
                    heading = rng.uniform(0, 360)

                    cur.execute(
                        """
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
                        VALUES (
                            %s, %s,
                            now() - interval '1 day' + (%s * interval '5 seconds'),
                            (EXTRACT(EPOCH FROM now()) * 1000 + (%s * 5000))::bigint,
                            %s, %s, %s, %s, %s, %s, %s,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                        )
                        """,
                        (
                            session_uuid,
                            player_alias,
                            point_index,
                            point_index,
                            lat,
                            lon,
                            accuracy_m,
                            speed_mps,
                            heading,
                            current_poi,
                            "synthetic_route",
                            lon,
                            lat,
                        ),
                    )
                    point_index += 1

                cur.execute(
                    """
                    INSERT INTO poi_events (
                        session_uuid,
                        player_alias,
                        poi,
                        event_type,
                        event_at,
                        elapsed_s,
                        lat,
                        lon,
                        geom,
                        event_data
                    )
                    VALUES (
                        %s, %s, %s, 'poi_arrival',
                        now() - interval '1 day' + (%s * interval '90 seconds'),
                        %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        %s::jsonb
                    )
                    """,
                    (
                        session_uuid,
                        player_alias,
                        current_poi,
                        edge_index,
                        edge_index * 90,
                        end_lat,
                        end_lon,
                        end_lon,
                        end_lat,
                        json.dumps({"synthetic": True, "route_seq": edge_index}),
                    ),
                )

        conn.commit()
        print(f"Inserted synthetic analytics for {len(sessions)} sessions.")
    finally:
        cur.close()
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Reset and seed synthetic clustering sessions without psql."
    )
    parser.add_argument("--reset", action="store_true", help="Delete current session data.")
    parser.add_argument(
        "--migrate",
        action="store_true",
        help="Apply db/analytics_migrations.sql without psql.",
    )
    parser.add_argument("--seed-first", action="store_true", help="Insert Rodrigo and Mariana.")
    parser.add_argument("--seed-next", action="store_true", help="Insert Tiago and Ines.")
    parser.add_argument(
        "--seed-analytics",
        action="store_true",
        help="Insert synthetic trajectory points for heatmaps, hotspots and routes.",
    )
    parser.add_argument(
        "--clusters",
        type=int,
        default=4,
        help="Number of K-Means clusters to use when --recompute-debug is set.",
    )
    parser.add_argument(
        "--recompute-debug",
        action="store_true",
        help="Run debug K-Means recompute.",
    )

    args = parser.parse_args()

    if args.migrate:
        apply_migrations()

    if args.reset:
        reset_data()
        print("Deleted current session, trajectory, POI event, and quiz attempt data.")

    if args.seed_first:
        seed_sessions(FIRST_BATCH)
        print("Inserted first synthetic batch: Rodrigo, Mariana.")

    if args.seed_next:
        seed_sessions(SECOND_BATCH)
        print("Inserted second synthetic batch: Tiago, Ines.")

    if args.seed_analytics:
        seed_analytics()

    if args.recompute_debug:
        result = recompute_performance_clusters(
            n_clusters=args.clusters,
            update_badges=True,
            force=True,
            debug_mode=True,
        )
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
