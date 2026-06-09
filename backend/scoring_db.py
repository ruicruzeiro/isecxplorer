import uuid
from psycopg2.extras import RealDictCursor
from db import get_connection
from performance_clustering import recompute_performance_clusters


AUTO_CLUSTER_DEBUG_SESSION_THRESHOLD = 15


def _valid_session_count():
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM sessions
            WHERE duration_s > 0
              AND pois_count > 0
            """
        )
        return cur.fetchone()[0]
    finally:
        cur.close()
        conn.close()


def save_scores(data: dict):
    session_uuid = data.get("session_uuid") or str(uuid.uuid4())

    player_alias = data["player_alias"]
    score = int(data.get("score", 0))
    pois_count = int(data.get("pois_count", 0))
    duration_s = int(data.get("duration_s", 0))
    quiz_correct = int(data.get("quiz_correct", 0))
    quiz_total = int(data.get("quiz_total", 0))
    quiz_time_total_s = int(data.get("quiz_time_total_s", 0))
    distance_m = float(data.get("distance_m", 0))
    stops_count = int(data.get("stops_count", 0))

    avg_speed_mps = distance_m / duration_s if duration_s > 0 else 0

    badge = "unranked"

    conn = get_connection()
    cur = conn.cursor()

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
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
            CURRENT_DATE,
            CURRENT_TIMESTAMP
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
            played_date = CURRENT_DATE,
            played_at = CURRENT_TIMESTAMP
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
            badge,
        ),
    )

    cur.execute(
        """
        UPDATE trajectory_points
        SET player_alias = %s
        WHERE session_uuid = %s
        """,
        (player_alias, session_uuid),
    )

    cur.execute(
        """
        UPDATE poi_events
        SET player_alias = %s
        WHERE session_uuid = %s
        """,
        (player_alias, session_uuid),
    )

    cur.execute(
        """
        UPDATE quiz_attempts
        SET player_alias = %s
        WHERE session_uuid = %s
        """,
        (player_alias, session_uuid),
    )

    conn.commit()
    cur.close()
    conn.close()

    try:
        valid_sessions = _valid_session_count()
        cluster_result = recompute_performance_clusters(
            update_badges=True,
            force=True,
            debug_mode=valid_sessions < AUTO_CLUSTER_DEBUG_SESSION_THRESHOLD,
        )
    except Exception as error:
        cluster_result = {
            "ok": False,
            "reason": "clustering_failed",
            "message": str(error),
        }

    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT badge, cluster_id, cluster_label
        FROM sessions
        WHERE session_uuid = %s
        """,
        (session_uuid,),
    )
    saved_session = cur.fetchone()
    cur.close()
    conn.close()

    if saved_session:
        badge = saved_session["badge"]

    return {
        "ok": True,
        "session_uuid": session_uuid,
        "badge": badge,
        "cluster_id": saved_session["cluster_id"] if saved_session else None,
        "cluster_label": saved_session["cluster_label"] if saved_session else None,
        "clustering": cluster_result,
    }


def get_leaderboard_scores(limit: int = 50):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        WITH latest_player_state AS (
            SELECT DISTINCT ON (player_alias)
                player_alias,
                badge AS current_badge,
                cluster_id AS current_cluster_id,
                cluster_label AS current_cluster_label
            FROM sessions
            ORDER BY player_alias, played_at DESC
        )
        SELECT
            s.player_alias,
            s.score,
            s.pois_count,
            s.duration_s,
            s.quiz_correct,
            s.quiz_total,
            s.quiz_time_total_s,
            s.distance_m,
            s.stops_count,
            s.avg_speed_mps,
            COALESCE(latest_player_state.current_badge, s.badge, 'unranked') AS badge,
            COALESCE(latest_player_state.current_cluster_id, s.cluster_id) AS cluster_id,
            COALESCE(latest_player_state.current_cluster_label, s.cluster_label) AS cluster_label,
            s.played_date::text,
            s.played_at::text
        FROM sessions s
        LEFT JOIN latest_player_state
            ON latest_player_state.player_alias = s.player_alias
        ORDER BY s.score DESC, s.duration_s ASC
        LIMIT %s
        """,
        (limit,),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "entries": rows,
        "total": len(rows),
    }


def get_player_profile(alias: str):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        SELECT
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
            cluster_id,
            cluster_label,
            played_at::text
        FROM sessions
        WHERE player_alias = %s
        ORDER BY score DESC, duration_s ASC
        LIMIT 1
        """,
        (alias,),
    )

    best = cur.fetchone()

    cur.execute(
        """
        SELECT
            COUNT(*) AS attempts,
            MAX(played_at)::text AS last_played_at
        FROM sessions
        WHERE player_alias = %s
        """,
        (alias,),
    )

    stats = cur.fetchone()

    cur.close()
    conn.close()

    if not best:
        return {
            "player_alias": alias,
            "attempts": 0,
            "badge": "unranked",
        }

    return {
        **best,
        "attempts": stats["attempts"],
        "last_played_at": stats["last_played_at"],
    }
