from psycopg2.extras import RealDictCursor

from constants import ROUTE
from db import get_connection
from metrics import safe_div


TOTAL_POIS = len(ROUTE)
DEFAULT_BADGE_CLUSTERS = 5
AUTOMATIC_RECOMPUTE_INTERVAL = 15

CLUSTER_BADGE_LABELS = {
    "speedrunner": "fast_players",
    "explorer": "explorers",
    "quiz_master": "quiz_strong",
    "snail": "slow_players",
    "rookie": "mixed_profile",
}


def _session_to_features(row):
    quiz_accuracy = safe_div(row["quiz_correct"], row["quiz_total"])
    avg_quiz_time_s = safe_div(row["quiz_time_total_s"], row["quiz_total"])
    expected_time_s = max(row["pois_count"] * 180, 1)
    normalized_time = row["duration_s"] / expected_time_s
    completion_rate = safe_div(row["pois_count"], row["total_pois"])

    return [
        float(row["score"]),
        float(row["duration_s"]),
        float(normalized_time),
        float(quiz_accuracy),
        float(avg_quiz_time_s),
        float(row["distance_m"]),
        float(row["stops_count"]),
        float(completion_rate),
    ]


def _build_cluster_summary(rows, labels):
    clusters = {}

    for row, label in zip(rows, labels):
        label = int(label)

        if label not in clusters:
            clusters[label] = {
                "cluster_id": label,
                "count": 0,
                "avg_score": 0,
                "avg_duration_s": 0,
                "avg_normalized_time": 0,
                "avg_quiz_accuracy": 0,
                "avg_quiz_time_s": 0,
                "avg_distance_m": 0,
                "avg_stops_count": 0,
                "avg_completion_rate": 0,
            }

        quiz_accuracy = safe_div(row["quiz_correct"], row["quiz_total"])
        avg_quiz_time_s = safe_div(row["quiz_time_total_s"], row["quiz_total"])
        normalized_time = row["duration_s"] / max(row["pois_count"] * 180, 1)
        completion_rate = safe_div(row["pois_count"], row["total_pois"])

        clusters[label]["count"] += 1
        clusters[label]["avg_score"] += row["score"]
        clusters[label]["avg_duration_s"] += row["duration_s"]
        clusters[label]["avg_normalized_time"] += normalized_time
        clusters[label]["avg_quiz_accuracy"] += quiz_accuracy
        clusters[label]["avg_quiz_time_s"] += avg_quiz_time_s
        clusters[label]["avg_distance_m"] += row["distance_m"]
        clusters[label]["avg_stops_count"] += row["stops_count"]
        clusters[label]["avg_completion_rate"] += completion_rate

    for cluster in clusters.values():
        count = cluster["count"]
        cluster["avg_score"] = round(cluster["avg_score"] / count, 2)
        cluster["avg_duration_s"] = round(cluster["avg_duration_s"] / count, 2)
        cluster["avg_normalized_time"] = round(cluster["avg_normalized_time"] / count, 3)
        cluster["avg_quiz_accuracy"] = round(cluster["avg_quiz_accuracy"] / count, 3)
        cluster["avg_quiz_time_s"] = round(cluster["avg_quiz_time_s"] / count, 2)
        cluster["avg_distance_m"] = round(cluster["avg_distance_m"] / count, 2)
        cluster["avg_stops_count"] = round(cluster["avg_stops_count"] / count, 2)
        cluster["avg_completion_rate"] = round(cluster["avg_completion_rate"] / count, 3)

    return list(clusters.values())


def _minmax(summary, key):
    values = [float(cluster[key]) for cluster in summary]
    min_value = min(values)
    max_value = max(values)

    if max_value == min_value:
        return {cluster["cluster_id"]: 0.5 for cluster in summary}

    return {
        cluster["cluster_id"]: (float(cluster[key]) - min_value) / (max_value - min_value)
        for cluster in summary
    }


def _assign_cluster_badges(summary):
    """
    Interpret K-Means clusters as user-facing badges.

    K-Means returns arbitrary cluster ids. This layer names each cluster by
    comparing its centroid/profile with the other clusters in the current
    dataset. Badge assignment is therefore driven by clustering, while the
    badge names are the interpretation layer.
    """
    if not summary:
        return {}

    score = _minmax(summary, "avg_score")
    normalized_time = _minmax(summary, "avg_normalized_time")
    quiz_accuracy = _minmax(summary, "avg_quiz_accuracy")
    quiz_time = _minmax(summary, "avg_quiz_time_s")
    distance = _minmax(summary, "avg_distance_m")
    stops = _minmax(summary, "avg_stops_count")
    completion = _minmax(summary, "avg_completion_rate")

    badge_scores = []

    for cluster in summary:
        cluster_id = cluster["cluster_id"]
        speedrunner_score = (
            (1 - normalized_time[cluster_id]) * 0.45
            + quiz_accuracy[cluster_id] * 0.25
            + score[cluster_id] * 0.20
            + completion[cluster_id] * 0.10
        )
        explorer_score = (
            distance[cluster_id] * 0.60
            + completion[cluster_id] * 0.25
            + stops[cluster_id] * 0.15
        )
        quiz_master_score = (
            quiz_accuracy[cluster_id] * 0.70
            + (1 - quiz_time[cluster_id]) * 0.15
            + score[cluster_id] * 0.15
        )
        snail_score = (
            normalized_time[cluster_id] * 0.55
            + quiz_time[cluster_id] * 0.25
            + stops[cluster_id] * 0.20
        )

        badge_scores.extend(
            [
                (speedrunner_score, cluster_id, "speedrunner"),
                (explorer_score, cluster_id, "explorer"),
                (quiz_master_score, cluster_id, "quiz_master"),
                (snail_score, cluster_id, "snail"),
            ]
        )

    cluster_badges = {}
    used_badges = set()
    used_clusters = set()

    for _, cluster_id, badge in sorted(badge_scores, reverse=True):
        if badge in used_badges or cluster_id in used_clusters:
            continue
        cluster_badges[cluster_id] = badge
        used_badges.add(badge)
        used_clusters.add(cluster_id)

    for cluster in summary:
        cluster_badges.setdefault(cluster["cluster_id"], "rookie")

    return cluster_badges


def recompute_performance_clusters(
    n_clusters: int = DEFAULT_BADGE_CLUSTERS,
    update_badges: bool = True,
    force: bool = False,
    debug_mode: bool = False,
):
    try:
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        return {
            "ok": False,
            "reason": "missing_dependency",
            "message": "numpy and scikit-learn sao necessarios para clustering.",
        }

    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        SELECT
            session_uuid,
            COALESCE(score, 0) AS score,
            COALESCE(duration_s, 0) AS duration_s,
            COALESCE(pois_count, 0) AS pois_count,
            COALESCE(quiz_correct, 0) AS quiz_correct,
            COALESCE(quiz_total, 0) AS quiz_total,
            COALESCE(quiz_time_total_s, 0) AS quiz_time_total_s,
            COALESCE(distance_m, 0) AS distance_m,
            COALESCE(stops_count, 0) AS stops_count,
            %s AS total_pois
        FROM sessions
        WHERE duration_s > 0
          AND pois_count > 0
        ORDER BY played_at ASC
        """,
        (TOTAL_POIS,),
    )

    rows = cur.fetchall()

    
    minimum_sessions = 2 if debug_mode else max(10, n_clusters * 3)
    if len(rows) < minimum_sessions:
        cur.close()
        conn.close()
        return {
            "ok": False,
            "reason": "not_enough_sessions_for_reliable_kmeans",
            "sessions": len(rows),
            "required": minimum_sessions,
            "debug_mode": debug_mode,
            "message": "Ainda nao existem sessoes suficientes para gerar clusters confiaveis.",
        }

    next_recompute_at = (
        ((len(rows) // AUTOMATIC_RECOMPUTE_INTERVAL) + 1)
        * AUTOMATIC_RECOMPUTE_INTERVAL
    )

    if not debug_mode and not force and len(rows) % AUTOMATIC_RECOMPUTE_INTERVAL != 0:
        cur.close()
        conn.close()
        return {
            "ok": False,
            "reason": "waiting_for_next_recompute_interval",
            "sessions": len(rows),
            "interval": AUTOMATIC_RECOMPUTE_INTERVAL,
            "next_recompute_at": next_recompute_at,
            "message": "K-Means automatico so recalcula a cada 15 sessoes.",
        }

    actual_n_clusters = max(2, min(n_clusters, len(rows)))
    X = np.array([_session_to_features(row) for row in rows], dtype=float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = KMeans(
        n_clusters=actual_n_clusters,
        random_state=42,
        n_init=10,
    )
    labels = model.fit_predict(X_scaled)

    summary = _build_cluster_summary(rows, labels)
    cluster_badges = _assign_cluster_badges(summary)
    cluster_labels = {
        cluster_id: CLUSTER_BADGE_LABELS.get(badge, "mixed_profile")
        for cluster_id, badge in cluster_badges.items()
    }

    for row, label in zip(rows, labels):
        cluster_id = int(label)
        badge = cluster_badges.get(cluster_id, "rookie")
        cluster_label = cluster_labels.get(cluster_id, "mixed_profile")

        if update_badges:
            cur.execute(
                """
                UPDATE sessions
                SET cluster_id = %s,
                    cluster_label = %s,
                    badge = %s
                WHERE session_uuid = %s
                """,
                (cluster_id, cluster_label, badge, row["session_uuid"]),
            )
        else:
            cur.execute(
                """
                UPDATE sessions
                SET cluster_id = %s,
                    cluster_label = %s
                WHERE session_uuid = %s
                """,
                (cluster_id, cluster_label, row["session_uuid"]),
            )

    conn.commit()
    cur.close()
    conn.close()

    return {
        "ok": True,
        "n_clusters": actual_n_clusters,
        "sessions": len(rows),
        "minimum_sessions": minimum_sessions,
        "debug_mode": debug_mode,
        "summary": summary,
        "cluster_badges": cluster_badges,
        "cluster_labels": cluster_labels,
        "badges_updated": update_badges,
        "forced": force,
        "interval": AUTOMATIC_RECOMPUTE_INTERVAL,
    }
