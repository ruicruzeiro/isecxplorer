import json
from psycopg2.extras import RealDictCursor
from db import get_connection


MAX_ACCEPTABLE_ACCURACY_M = 40


def save_trajectory_point(
    session_uuid: str,
    player_alias: str | None,
    client_timestamp: int | None,
    lat: float,
    lon: float,
    accuracy_m: float | None,
    speed_mps: float | None,
    heading: float | None,
    current_poi: str | None,
    zone: str | None,
):
    if accuracy_m is not None and accuracy_m > MAX_ACCEPTABLE_ACCURACY_M:
        return {"saved": False, "reason": "low_gps_accuracy"}

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO trajectory_points (
            session_uuid,
            player_alias,
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
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)
        )
        """,
        (
            session_uuid,
            player_alias,
            client_timestamp,
            lat,
            lon,
            accuracy_m,
            speed_mps,
            heading,
            current_poi,
            zone,
            lon,
            lat,
        ),
    )

    conn.commit()
    cur.close()
    conn.close()

    return {"saved": True}


def save_poi_event(
    session_uuid: str,
    player_alias: str | None,
    poi: str | None,
    event_type: str,
    elapsed_s: int | None = None,
    score_after_event: int | None = None,
    lat: float | None = None,
    lon: float | None = None,
    event_data: dict | None = None,
):
    conn = get_connection()
    cur = conn.cursor()

    if lat is not None and lon is not None:
        cur.execute(
            """
            INSERT INTO poi_events (
                session_uuid,
                player_alias,
                poi,
                event_type,
                elapsed_s,
                score_after_event,
                lat,
                lon,
                geom,
                event_data
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                %s::jsonb
            )
            """,
            (
                session_uuid,
                player_alias,
                poi,
                event_type,
                elapsed_s,
                score_after_event,
                lat,
                lon,
                lon,
                lat,
                json.dumps(event_data or {}),
            ),
        )
    else:
        cur.execute(
            """
            INSERT INTO poi_events (
                session_uuid,
                player_alias,
                poi,
                event_type,
                elapsed_s,
                score_after_event,
                event_data
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                session_uuid,
                player_alias,
                poi,
                event_type,
                elapsed_s,
                score_after_event,
                json.dumps(event_data or {}),
            ),
        )

    conn.commit()
    cur.close()
    conn.close()


def save_quiz_attempt(
    session_uuid: str,
    player_alias: str | None,
    poi: str,
    question: str | None,
    selected_answer: str | None,
    correct_answer: str | None,
    is_correct: bool,
    response_time_s: int | None,
):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO quiz_attempts (
            session_uuid,
            player_alias,
            poi,
            question,
            selected_answer,
            correct_answer,
            is_correct,
            response_time_s
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            session_uuid,
            player_alias,
            poi,
            question,
            selected_answer,
            correct_answer,
            is_correct,
            response_time_s,
        ),
    )

    conn.commit()
    cur.close()
    conn.close()


def get_heatmap_points(grid_m: float = 5.0, limit: int = 1000):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        WITH valid_points AS (
            SELECT
                ST_Transform(geom, 3857) AS geom_3857
            FROM trajectory_points
            WHERE accuracy_m IS NULL OR accuracy_m <= 40
        ),
        grid AS (
            SELECT
                ST_SnapToGrid(geom_3857, %s) AS cell_geom,
                COUNT(*) AS weight
            FROM valid_points
            GROUP BY ST_SnapToGrid(geom_3857, %s)
        )
        SELECT
            ST_Y(ST_Transform(cell_geom, 4326)) AS lat,
            ST_X(ST_Transform(cell_geom, 4326)) AS lon,
            weight
        FROM grid
        ORDER BY weight DESC
        LIMIT %s
        """,
        (grid_m, grid_m, limit),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {"points": rows, "total": len(rows)}


def get_dbscan_hotspots(eps_m: float = 8.0, min_points: int = 5):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        WITH valid_points AS (
            SELECT
                id,
                ST_Transform(geom, 3857) AS geom_3857
            FROM trajectory_points
            WHERE accuracy_m IS NULL OR accuracy_m <= 40
        ),
        clustered AS (
            SELECT
                id,
                geom_3857,
                ST_ClusterDBSCAN(geom_3857, %s, %s) OVER () AS cluster_id
            FROM valid_points
        )
        SELECT
            cluster_id,
            COUNT(*) AS points_count,
            ST_Y(ST_Transform(ST_Centroid(ST_Collect(geom_3857)), 4326)) AS lat,
            ST_X(ST_Transform(ST_Centroid(ST_Collect(geom_3857)), 4326)) AS lon
        FROM clustered
        WHERE cluster_id IS NOT NULL
        GROUP BY cluster_id
        ORDER BY points_count DESC
        """,
        (eps_m, min_points),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "eps_m": eps_m,
        "min_points": min_points,
        "clusters": rows,
        "total": len(rows),
    }


def get_route_segments(limit: int = 2000):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        WITH ordered_points AS (
            SELECT
                session_uuid,
                recorded_at,
                geom,
                LAG(geom) OVER (
                    PARTITION BY session_uuid
                    ORDER BY recorded_at
                ) AS prev_geom
            FROM trajectory_points
            WHERE accuracy_m IS NULL OR accuracy_m <= 40
        ),
        segments AS (
            SELECT
                session_uuid,
                ST_MakeLine(prev_geom, geom) AS geom
            FROM ordered_points
            WHERE prev_geom IS NOT NULL
              AND ST_Distance(prev_geom::geography, geom::geography) BETWEEN 2 AND 80
        )
        SELECT
            session_uuid::text,
            ST_AsGeoJSON(geom)::json AS geometry
        FROM segments
        LIMIT %s
        """,
        (limit,),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": row["geometry"],
                "properties": {
                    "session_uuid": row["session_uuid"],
                },
            }
            for row in rows
        ],
    }
