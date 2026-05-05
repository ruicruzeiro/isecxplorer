from db import get_connection


def get_leaderboard_scores(limit: int = 50):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT player_alias, score, pois_count, duration_s,
               played_date::text,
               CASE
                 WHEN duration_s < 600 THEN 'speedrunner'
                 WHEN pois_count >= 20  THEN 'explorer'
                 WHEN score > 1500      THEN 'learner'
                 WHEN duration_s > 3600 THEN 'snail'
                 ELSE 'unranked'
               END AS badge
        FROM sessions
        ORDER BY score DESC, duration_s ASC
        LIMIT %s
    """, (limit,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {
        "entries": [
            {
                "player_alias": r["player_alias"],
                "score": r["score"],
                "pois_count": r["pois_count"],
                "duration_s": r["duration_s"],
                "played_date": r["played_date"],
                "badge": r["badge"],
            }
            for r in rows
        ],
        "total": len(rows),
    }


def save_scores(data: dict):
    """Chamado quando o utilizador termina o percurso."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO sessions (player_alias, score, pois_count, duration_s, played_date)
        VALUES (%s, %s, %s, %s, CURRENT_DATE)
    """, (
        data["player_alias"],
        data["score"],
        data.get("pois_count", 0),
        data.get("duration_s", 0),
    ))
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}
