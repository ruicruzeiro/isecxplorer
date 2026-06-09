# isecxplorer - Comprehensive Machine Learning & Leaderboard Evaluation Report

**Date**: May 20, 2026  
**Repository**: ruicruzeiro/isecxplorer  
**Evaluated Branch**: main/analytics-clustering  
**Evaluator**: ML Engineering & QA Assessment

---

## EXECUTIVE SUMMARY

The isecxplorer system implements a badge assignment algorithm and leaderboard ranking for a campus exploration game. The evaluation identified **8 significant issues** across ML logic, functional correctness, and data integrity:

- **3 Critical Issues** affecting badge assignment accuracy and leaderboard integrity
- **5 High/Medium Issues** affecting scoring consistency and performance clustering
- **Recommended Priority**: Implement fixes in phases, starting with badge logic and leaderboard ranking

---

## DETAILED FINDINGS & CORRECTIONS

### 🔴 CRITICAL ISSUE #1: Badge Assignment - Overlapping Conditions

**File**: [badges.py](badges.py)  
**Lines**: 51-70  
**Severity**: 🔴 CRITICAL

#### Problem Description

The badge classification uses a cascading if-elif structure without ensuring mutual exclusivity. A user can theoretically qualify for multiple badges if they meet earlier conditions. The logic is:

```python
if (speedrunner_criteria):
    return "speedrunner"
if (explorer_criteria):  # Can a speedrunner also be explorer?
    return "explorer"
if (quiz_master_criteria):
    return "quiz_master"
# ... more conditions
```

**Issue**: A user who completes all POIs with 80%+ accuracy AND covers 900m distance will get **"speedrunner"** even if they're a better explorer. The explorer badge is unreachable for high-performing users.

#### Root Cause

The algorithm prioritizes speed-based achievement over distance exploration, creating an implicit hierarchy that isn't documented and may not reflect the game design intent.

#### Impact

- **False Negatives**: Top explorers who are fast enough get speedrunner instead
- **Badge Inflation**: speedrunner badge becomes the only "elite" badge
- **Player Motivation Loss**: Explorers have no incentive to maintain high accuracy

#### Recommended Correction

**Option A: Score-Based Selection (Recommended)**

Replace the cascade with a scoring system that evaluates all criteria and assigns the best-fit badge:

```python
def classify_badge(
    duration_s: int,
    score: int,
    pois_count: int,
    quiz_correct: int,
    quiz_total: int,
    quiz_time_total_s: int,
    distance_m: float,
    stops_count: int,
) -> str:
    total_pois = len(ROUTE)

    if pois_count <= 0 or duration_s <= 0:
        return "unranked"

    quiz_accuracy = safe_div(quiz_correct, quiz_total)
    avg_quiz_time_s = safe_div(quiz_time_total_s, quiz_total)
    completion_rate = safe_div(pois_count, total_pois)

    expected_time_s = max(total_pois * 180, 1)
    normalized_time = duration_s / expected_time_s

    # Calculate badge match scores (0-100)
    badge_scores = {}
    
    # Speedrunner: Complete route, high accuracy, fast time
    if completion_rate >= 1.0 and normalized_time <= 0.75 and avg_quiz_time_s <= 20:
        badge_scores["speedrunner"] = (
            (1.0 - normalized_time / 0.75) * 50 +  # Speed component
            min(quiz_accuracy / 0.80, 1.0) * 30 +   # Accuracy component
            10  # Completion bonus
        )
    
    # Explorer: High distance, good completion
    if completion_rate >= 0.75 and distance_m >= 900:
        badge_scores["explorer"] = (
            (distance_m / 1200) * 50 +  # Distance component (capped at 1200m)
            min(completion_rate / 0.9, 1.0) * 40 +  # Completion component
            10  # Bonus
        )
    
    # Quiz Master: High quiz accuracy, multiple attempts
    if quiz_total >= 5 and quiz_accuracy >= 0.90:
        badge_scores["quiz_master"] = (
            min(quiz_accuracy / 0.95, 1.0) * 60 +  # Accuracy is key
            min(quiz_total / 15, 1.0) * 30 +        # Volume component
            10  # Bonus
        )
    
    # Snail: Slow performance
    if normalized_time >= 1.8 or avg_quiz_time_s >= 45:
        badge_scores["snail"] = (
            (normalized_time / 2.0) * 50 +
            (avg_quiz_time_s / 60) * 40 +
            10
        )
    
    # Select badge with highest score
    if badge_scores:
        return max(badge_scores.items(), key=lambda x: x[1])[0]
    
    return "rookie"
```

**Option B: Explicit Priority with Documentation (Simpler)**

Keep the cascade but add clear documentation and reorder by game design priority:

```python
def classify_badge(...):
    # ... validation code ...
    
    # BADGE PRIORITY ORDER (by game design intention):
    # 1. quiz_master: Cognitive excellence (primary focus)
    # 2. speedrunner: Speed + accuracy balance
    # 3. explorer: Distance coverage
    # 4. snail: Completion despite slowness
    # 5. rookie: Default achievement
    
    # Check in priority order
    if quiz_total >= 5 and quiz_accuracy >= 0.90:
        return "quiz_master"
    
    if (completion_rate >= 1.0 and quiz_accuracy >= 0.80 and
        normalized_time <= 0.75 and avg_quiz_time_s <= 20):
        return "speedrunner"
    
    if completion_rate >= 0.75 and distance_m >= 900:
        return "explorer"
    
    if normalized_time >= 1.8 or avg_quiz_time_s >= 45:
        return "snail"
    
    return "rookie"
```

---

### 🔴 CRITICAL ISSUE #2: Leaderboard Ranking - Ignores Quiz Accuracy

**File**: [scoring_db.py](scoring_db.py)  
**Lines**: 121-150  
**Severity**: 🔴 CRITICAL

#### Problem Description

The leaderboard query:

```python
SELECT ... FROM sessions
ORDER BY score DESC, duration_s ASC
LIMIT %s
```

This ranks players purely by `score` and `duration_s`. However:

1. **Score Calculation Issue**: The score value alone doesn't reflect all performance metrics
2. **Quiz Accuracy Ignored**: Two players with same score are ranked by speed, not quiz quality
3. **Misalignment with Badges**: The speedrunner badge requires 80% quiz accuracy, but the leaderboard doesn't evaluate this

#### Root Cause

The leaderboard was designed before quiz accuracy became part of the badge criteria.

#### Impact

- **Inaccurate Rankings**: Players with lucky low-speed but incorrect quizzes rank higher than consistent high-accuracy players
- **Incentive Misalignment**: Discourages quiz focus since only speed matters in leaderboard
- **Validation Failure**: Contradicts badge assignment logic

#### Recommended Correction

Implement a **composite ranking score** that reflects all performance dimensions:

```python
def get_leaderboard_scores(limit: int = 50):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Calculate composite ranking score
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
            played_date::text,
            played_at::text,
            -- Composite ranking: weighted score + normalized metrics
            (
                score * 0.4 +  -- 40% weight to actual points
                ROUND(CAST(quiz_correct AS FLOAT) / NULLIF(quiz_total, 0) * 100) * 0.35 +  -- 35% weight to accuracy
                LEAST(pois_count, %s) / %s * 20  -- 20% weight to exploration
                + (CASE WHEN duration_s > 0 THEN 100.0 / LEAST(duration_s / 300.0, 5) ELSE 0 END) * 0.05  -- 5% for efficiency bonus
            ) AS composite_rank
        FROM sessions
        WHERE score >= 0  -- Exclude invalid sessions
        ORDER BY composite_rank DESC, score DESC, duration_s ASC
        LIMIT %%s
        """,
        (len(ROUTE), len(ROUTE), limit),
    )

    rows = cur.fetchall()
    cur.close()
    conn.close()

    return {
        "entries": rows,
        "total": len(rows),
        "ranking_method": "composite (score + accuracy + exploration + efficiency)",
    }
```

**Alternative: Multi-Leaderboard Approach** (More Transparent)

Create separate leaderboards for different playstyles:

```python
async def get_leaderboard(
    category: str = "overall",  # overall, speed, accuracy, explorer
    limit: int = 50
):
    """
    category:
      - overall: Composite score (default)
      - speed: Fastest completion time
      - accuracy: Highest quiz accuracy
      - explorer: Longest distance covered
      - consistency: Best average performance
    """
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    if category == "overall":
        # Use composite_rank (see above)
        query = """
            SELECT ... 
            ORDER BY composite_rank DESC, score DESC
            LIMIT %s
        """
    elif category == "speed":
        query = """
            SELECT ... FROM sessions
            WHERE pois_count >= %s
            ORDER BY duration_s ASC
            LIMIT %s
        """
        cur.execute(query, (len(ROUTE), limit))
    elif category == "accuracy":
        query = """
            SELECT ..., 
                CAST(quiz_correct AS FLOAT) / NULLIF(quiz_total, 0) AS accuracy
            FROM sessions
            WHERE quiz_total >= 5
            ORDER BY accuracy DESC, quiz_correct DESC
            LIMIT %s
        """
        cur.execute(query, (limit,))
    # ... more categories ...
    
    rows = cur.fetchall()
    cur.close()
    conn.close()
    
    return {
        "category": category,
        "entries": rows,
        "total": len(rows),
    }
```

---

### 🟠 HIGH ISSUE #3: Clustering - Insufficient Data Validation

**File**: [performance_clustering.py](performance_clustering.py)  
**Lines**: 73-80  
**Severity**: 🟠 HIGH

#### Problem Description

```python
if len(rows) < n_clusters:
    cur.close()
    conn.close()
    return {
        "ok": False,
        "reason": "not_enough_sessions",
        "sessions": len(rows),
        "required": n_clusters,
    }
```

The clustering will fail immediately if there are fewer than 4 sessions. With early-stage data (first week of game), this is common. No fallback strategy exists.

#### Impact

- **Service Unavailability**: The clustering endpoint returns errors during early deployment
- **Analytics Gaps**: No performance insights available for small player bases
- **User Experience**: The frontend might show errors to users

#### Recommended Correction

Implement adaptive clustering with graceful degradation:

```python
def recompute_performance_clusters(n_clusters: int = 4):
    """
    Adaptive clustering with fallback strategies for small datasets.
    """
    try:
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        return {
            "ok": False,
            "reason": "missing_dependency",
            "message": "numpy and scikit-learn são necessários para clustering.",
        }

    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    cur.execute(
        """
        SELECT
            session_uuid,
            score,
            duration_s,
            pois_count,
            quiz_correct,
            quiz_total,
            quiz_time_total_s,
            distance_m,
            stops_count
        FROM sessions
        WHERE duration_s > 0
          AND pois_count > 0
        ORDER BY played_at ASC
        """
    )

    rows = cur.fetchall()
    
    # ADAPTIVE LOGIC
    actual_n_clusters = min(n_clusters, max(2, len(rows) // 3))
    
    if len(rows) == 0:
        cur.close()
        conn.close()
        return {
            "ok": False,
            "reason": "no_sessions",
            "message": "Sem sessões para fazer clustering. Volte mais tarde.",
        }
    
    if len(rows) == 1:
        # Single session: create a default cluster
        cur.execute(
            """
            UPDATE sessions
            SET cluster_id = 0, cluster_label = 'solo_player'
            WHERE session_uuid = %s
            """,
            (rows[0]["session_uuid"],),
        )
        conn.commit()
        cur.close()
        conn.close()
        return {
            "ok": True,
            "message": "Apenas 1 sessão. Cluster padrão criado.",
            "clusters_created": 1,
            "sessions_processed": 1,
        }
    
    if len(rows) < n_clusters:
        # Use hierarchical clustering instead for small datasets
        from scipy.cluster.hierarchy import linkage, fcluster
        
        X = np.array([_session_to_features(row) for row in rows], dtype=float)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Hierarchical clustering is better for small datasets
        Z = linkage(X_scaled, method='ward')
        labels = fcluster(Z, t=actual_n_clusters, criterion='maxclust') - 1
        
        strategy = "hierarchical_clustering"
    else:
        # Standard KMeans for normal datasets
        X = np.array([_session_to_features(row) for row in rows], dtype=float)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = KMeans(
            n_clusters=actual_n_clusters,
            random_state=42,
            n_init=10,
        )
        labels = model.fit_predict(X_scaled)
        strategy = "kmeans"

    summary = _build_cluster_summary(rows, labels)
    readable_labels = _assign_cluster_labels(summary)

    # Update database
    for row, label in zip(rows, labels):
        cluster_id = int(label)
        cluster_label = readable_labels.get(cluster_id, "mixed_profile")
        
        cur.execute(
            """
            UPDATE sessions
            SET cluster_id = %s, cluster_label = %s
            WHERE session_uuid = %s
            """,
            (cluster_id, cluster_label, row["session_uuid"]),
        )

    conn.commit()
    cur.close()
    conn.close()

    return {
        "ok": True,
        "strategy": strategy,
        "clusters_created": actual_n_clusters,
        "sessions_processed": len(rows),
        "cluster_summary": summary,
    }
```

---

### 🟠 HIGH ISSUE #4: Score Aggregation - No Client Validation

**File**: [app.py](app.py) + [scoring_db.py](scoring_db.py)  
**Lines**: app.py 235-280, scoring_db.py 8-17  
**Severity**: 🟠 HIGH

#### Problem Description

The frontend sends a `score` value to the backend when finishing a session:

```python
# From scoring_db.py save_scores()
score = int(data.get("score", 0))  # ← Blindly trusts client
```

The backend doesn't validate this against calculated points:

```
Expected Score = SUM(quiz_points) + SUM(time_bonuses)
```

#### Impact

- **Score Manipulation**: Malicious clients can send inflated scores
- **Leaderboard Fraud**: Top leaderboard positions can be gamed
- **Analytics Corruption**: Performance clusters become unreliable

#### Recommended Correction

**Server-Side Score Recalculation**

```python
async def finish_session(data: dict):
    """
    Validate and save final session scores.
    Recalculates score server-side to prevent client manipulation.
    """
    session_uuid = data.get("session_uuid")
    player_alias = data["player_alias"]
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Fetch all quiz attempts for this session
    cur.execute(
        """
        SELECT 
            poi,
            is_correct,
            response_time_s
        FROM quiz_attempts
        WHERE session_uuid = %s
        ORDER BY answered_at ASC
        """,
        (session_uuid,)
    )
    quiz_data = cur.fetchall()
    
    # Fetch all POI arrival events for time bonuses
    cur.execute(
        """
        SELECT
            event_data::jsonb->'time_bonus' AS time_bonus
        FROM poi_events
        WHERE session_uuid = %s
          AND event_type = 'poi_arrival'
        ORDER BY event_at ASC
        """,
        (session_uuid,)
    )
    poi_events = cur.fetchall()
    
    # Recalculate score from raw data
    calculated_score = 0
    calculated_quiz_correct = 0
    calculated_quiz_total = 0
    calculated_quiz_time_total_s = 0
    
    from scoring import QUIZ_POINTS
    
    for quiz in quiz_data:
        if quiz["is_correct"]:
            calculated_score += QUIZ_POINTS
            calculated_quiz_correct += 1
        calculated_quiz_total += 1
        if quiz["response_time_s"]:
            calculated_quiz_time_total_s += quiz["response_time_s"]
    
    for event in poi_events:
        bonus = event.get("time_bonus", 0)
        if bonus:
            calculated_score += int(bonus)
    
    # Fetch client-submitted score
    client_score = int(data.get("score", 0))
    
    # Validate within tolerance (small delta for rounding)
    score_delta = abs(calculated_score - client_score)
    
    if score_delta > 10:  # Allow 10-point tolerance
        # Log discrepancy but don't fail
        print(f"⚠️  Score mismatch for {session_uuid}: "
              f"client={client_score}, calculated={calculated_score}, "
              f"delta={score_delta}")
        # Use calculated score (more trustworthy)
        final_score = calculated_score
        score_trusted = False
    else:
        final_score = calculated_score
        score_trusted = True
    
    # Continue with save using validated score
    return save_scores({
        **data,
        "score": final_score,
        "quiz_correct": calculated_quiz_correct,
        "quiz_total": calculated_quiz_total,
        "quiz_time_total_s": calculated_quiz_time_total_s,
        "_score_trusted": score_trusted,
    })
```

---

### 🟡 MEDIUM ISSUE #5: GPS Distance Filtering - Arbitrary Threshold

**File**: [app.py](app.py)  
**Lines**: 103-107  
**Severity**: 🟡 MEDIUM

#### Problem Description

```python
step_m = haversine_m(state.last_lat, state.last_lon, lat, lon)

# Filtro anti-saltos de GPS.
if 1 <= step_m <= 80:
    state.distance_m += step_m
```

The filter allows steps between 1-80 meters but:

1. **Fixed threshold** doesn't adapt to GPS accuracy
2. **No filtering** for indoor positioning errors (can exceed 80m during building transitions)
3. **Precision loss** for users moving < 1m (likely in dense PoI areas)

#### Impact

- **Distance Underestimation**: Explorer badge becomes harder to achieve
- **Inconsistent Filtering**: Same physical movement counts differently based on GPS noise

#### Recommended Correction

Implement **GPS accuracy-aware filtering**:

```python
def process_location_for_analytics(
    state: SessionState,
    data: dict,
    current_poi: str | None,
    zone: str | None,
):
    geo = data.get("geolocation") or {}

    lat = geo.get("latitude")
    lon = geo.get("longitude")

    if lat is None or lon is None:
        return

    now = time.time()
    client_timestamp = data.get("timestamp")
    accuracy_m = geo.get("accuracy")
    speed_mps = geo.get("speed")
    heading = geo.get("heading")

    if state.last_lat is not None and state.last_lon is not None:
        step_m = haversine_m(state.last_lat, state.last_lon, lat, lon)
        
        # IMPROVED: Accuracy-aware filtering
        # Maximum plausible step depends on accuracy and time elapsed
        time_since_last_s = (now - state.last_location_ts) if state.last_location_ts else 1
        
        # Assume max speed of ~2 m/s (7.2 km/h, reasonable campus speed)
        max_plausible_step_m = max(time_since_last_s * 2.0, 5.0)
        
        # Sanity check: if step is more than max_plausible_step_m + 2*accuracy_m, 
        # it's likely a GPS jump
        accuracy_adjusted_max = max_plausible_step_m + (2 * (accuracy_m or 10))
        accuracy_adjusted_min = max(0.5, (accuracy_m or 5) * 0.5)
        
        is_valid_step = (
            accuracy_adjusted_min <= step_m <= accuracy_adjusted_max
        )
        
        if is_valid_step and step_m >= 1:
            state.distance_m += step_m
        elif step_m < 1:
            # Valid near-movement, count with minimum unit
            state.distance_m += 0.5
        else:
            # Invalid step (likely GPS jump or indoor error)
            if accuracy_m and accuracy_m > 20:
                print(f"⚠️  Skipped step {step_m}m with low accuracy {accuracy_m}m")

    # ... rest of function remains same ...
```

---

### 🟡 MEDIUM ISSUE #6: Quiz Time Tracking - Null Reference Risk

**File**: [app.py](app.py)  
**Lines**: 319-325  
**Severity**: 🟡 MEDIUM

#### Problem Description

```python
response_time_s = None
if state.quiz_started_at is not None:
    response_time_s = int(time.time() - state.quiz_started_at)
    state.quiz_time_total_s += response_time_s
```

If `quiz_started_at` is not properly initialized, no response time is recorded. The badge criteria for "speedrunner" requires `avg_quiz_time_s <= 20`, but if this is always 0 due to null values, the condition becomes unreliable.

#### Impact

- **Incomplete Metrics**: Quiz time not tracked for some sessions
- **Badge Criteria Bypass**: Users might get speedrunner without actually answering quickly
- **Analytics Error**: Avg quiz time becomes meaningless

#### Recommended Correction

Ensure `quiz_started_at` is initialized and add defensive checks:

```python
if zone == "val" and state.arrival_armed and current_poi not in state.visited_pois:
    print(f"[VAL DETECTADO] poi: {current_poi}, visited: {state.visited_pois}")
    seconds_elapsed = time.time() - state.poi_started_at
    time_bonus = calculate_time_bonus(seconds_elapsed)
    state.score += time_bonus
    state.current_quiz = get_quiz_for_poi(current_poi)
    
    # FIX: Ensure quiz_started_at is always set
    state.quiz_started_at = time.time()
    assert state.quiz_started_at is not None, "quiz_started_at must be initialized"
    
    state.waiting_confirmation = True
    state.visited_pois.add(current_poi)
    # ... rest of code ...

# Later, when processing quiz answer:
if data.get("type") == "quiz_answer":
    if state.quiz_answered:
        continue

    answer = data.get("answer")
    quiz = state.current_quiz
    correct = quiz is not None and answer == quiz["resposta_certa"]

    points = calculate_quiz_points(correct)
    state.score += points

    response_time_s = None
    if state.quiz_started_at is not None:
        response_time_s = int(time.time() - state.quiz_started_at)
        state.quiz_time_total_s += response_time_s
    else:
        # FIX: Log when time tracking fails
        print(f"⚠️  WARNING: quiz_started_at is None for session {state.session_uuid}")
        # Provide a default reasonable value
        response_time_s = 30  # Default assumption

    # ... rest of quiz answer processing ...
```

---

### 🟡 MEDIUM ISSUE #7: Quiz Accuracy Division - Semantic Error

**File**: [performance_clustering.py](performance_clustering.py) + [badges.py](badges.py)  
**Lines**: All calls to `safe_div(quiz_correct, quiz_total)`  
**Severity**: 🟡 MEDIUM

#### Problem Description

```python
quiz_accuracy = safe_div(quiz_correct, quiz_total)  # Returns 0 if quiz_total == 0
```

The `safe_div` function returns `0.0` when denominator is 0:

```python
def safe_div(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator
```

This creates a semantic error: a user who took 0 quizzes is treated as having 0% accuracy (False), when they should be **unranked** (Unknown).

#### Impact

- **Silently Ignores Invalid Data**: Users with `quiz_total == 0` get accuracy of 0
- **Badge Assignment Error**: A user with no quizzes could potentially get "quiz_master" badge if other criteria are met
- **Clustering Bias**: Accuracy averages become meaningless with null values treated as 0

#### Recommended Correction

Use `None` to represent unknown values:

```python
def safe_div(numerator: float, denominator: float, none_on_zero: bool = False) -> float | None:
    """
    Safely divide two numbers.
    
    Args:
        numerator: The numerator
        denominator: The denominator
        none_on_zero: If True, return None when denominator is 0 (semantically correct).
                      If False, return 0.0 (backward compatible).
    
    Returns:
        Division result, or 0.0/None if denominator is 0
    """
    if denominator == 0:
        return None if none_on_zero else 0.0
    return numerator / denominator
```

Then update badge logic:

```python
def classify_badge(...):
    # ... existing validation ...
    
    quiz_accuracy = safe_div(quiz_correct, quiz_total, none_on_zero=True)
    avg_quiz_time_s = safe_div(quiz_time_total_s, quiz_total, none_on_zero=True)
    
    # Handle unknown quiz metrics
    if quiz_accuracy is None:
        # User has no quiz data
        quiz_attempt_count = 0
    else:
        quiz_attempt_count = quiz_total
    
    # ... rest of logic with None checks ...
    
    if quiz_total >= 5 and quiz_accuracy is not None and quiz_accuracy >= 0.90:
        return "quiz_master"
    
    # ... other conditions with appropriate None handling ...
```

---

### 🟡 MEDIUM ISSUE #8: Leaderboard Profile Query - Incomplete Result Set

**File**: [scoring_db.py](scoring_db.py)  
**Lines**: 142-165 (appears incomplete in source)  
**Severity**: 🟡 MEDIUM

#### Problem Description

The `get_player_profile()` function has an incomplete read in the provided code:

```python
cur.execute(
    """
    SELECT ...
    FROM sessions
    WHERE player_alias = %s
    ORDER BY score DESC, duration_s ASC
    LIMIT 1
    """,
    (alias,),
)

best = cur.fetchone()

cur.execute(
    """  # ← Second query appears incomplete
```

This could cause:
1. Multiple database round-trips (performance issue)
2. Race conditions if sessions are added between queries
3. Inconsistent player stats

#### Recommended Correction

Fetch all needed data in a single query:

```python
def get_player_profile(alias: str):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Single query to get both best session and stats
    cur.execute(
        """
        WITH best_session AS (
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
        ),
        player_stats AS (
            SELECT
                player_alias,
                COUNT(*) AS attempts,
                MAX(played_at)::text AS last_played_at,
                AVG(score) AS avg_score,
                AVG(CAST(quiz_correct AS FLOAT) / NULLIF(quiz_total, 0)) AS avg_accuracy,
                MAX(score) AS max_score
            FROM sessions
            WHERE player_alias = %s
            GROUP BY player_alias
        )
        SELECT
            bs.*,
            ps.attempts,
            ps.last_played_at,
            ps.avg_score,
            ps.avg_accuracy,
            ps.max_score
        FROM best_session bs
        FULL OUTER JOIN player_stats ps ON bs.player_alias = ps.player_alias
        """,
        (alias, alias),
    )

    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        return {
            "player_alias": alias,
            "attempts": 0,
            "badge": "unranked",
        }

    return result
```

---

## FUNCTIONAL CORRECTNESS VALIDATION

### ✅ Positive Findings

1. **Geospatial Logic**: The PostGIS integration for POI detection is properly implemented
2. **Data Persistence**: Trajectory points, quiz attempts, and POI events are correctly persisted
3. **Session Management**: WebSocket session state management is functional
4. **Time Tracking**: Session duration and event timestamps are accurately recorded

### ⚠️ Areas Requiring Testing

| Component | Test Required | Severity |
|-----------|---------------|----------|
| Badge assignment with extreme values | MIN/MAX score, duration, distance | HIGH |
| Leaderboard pagination with ties | Multiple users with same score | MEDIUM |
| Performance clustering with < 10 sessions | Small dataset behavior | MEDIUM |
| GPS jump recovery | 100+ meter steps | MEDIUM |
| Concurrent quiz answers | Multiple quiz_answer messages | MEDIUM |

---

## LEADERBOARD VALIDATION CHECKLIST

- [ ] **Ranking Consistency**: Run `SELECT DISTINCT score FROM sessions` and verify no duplicate scores at top 10
- [ ] **Badge-Score Correlation**: Verify all "speedrunner" badges have `score` in top 20% and `duration_s` in bottom 20%
- [ ] **Quiz Metrics**: Confirm `avg_quiz_time_s` (quiz_time_total_s / quiz_total) correlates with badge assignment
- [ ] **Distance Validation**: Check that "explorer" badge correlates with `distance_m >= 900`
- [ ] **Update Velocity**: Measure time between session.played_at updates for same player

---

## RECOMMENDATIONS SUMMARY

### Phase 1: Critical Fixes (Week 1)

| Issue | Fix | Effort |
|-------|-----|--------|
| Badge overlap | Implement score-based selection | 4 hours |
| Leaderboard ranking | Add composite score | 3 hours |
| Score validation | Server-side recalculation | 2 hours |

### Phase 2: Data Integrity (Week 2)

| Issue | Fix | Effort |
|-------|-----|--------|
| Clustering robustness | Adaptive n_clusters | 3 hours |
| GPS filtering | Accuracy-aware thresholds | 2 hours |
| Quiz time tracking | Null safety checks | 1 hour |

### Phase 3: Analytics Reliability (Week 3)

| Issue | Fix | Effort |
|-------|-----|--------|
| Safe division semantics | Return None for unknown | 2 hours |
| Profile queries | Single-query optimization | 1 hour |
| Testing & validation | Test suite setup | 5 hours |

---

## CONCLUSION

The isecxplorer system has a **solid foundation** with proper geospatial data handling and event tracking. However, **critical issues** in badge assignment logic and leaderboard ranking need immediate attention to ensure:

1. ✅ Accurate player performance evaluation
2. ✅ Fair and transparent leaderboard rankings
3. ✅ Prevention of score manipulation
4. ✅ Reliable performance clustering for analytics

**Recommended Action**: Implement Phase 1 fixes immediately before the system reaches production. The system is currently in a state where **badge assignments may be inaccurate** and **leaderboards may not reflect true player performance**.

---

## APPENDIX: Test Cases

### Test Case 1: Badge Assignment Verification

```python
# Test: High-performing explorer should get explorer badge, not speedrunner
test_player = {
    "duration_s": 2400,  # 40 minutes (normalized_time = 0.667, < 0.75)
    "score": 1500,
    "pois_count": 21,  # All POIs
    "quiz_correct": 17,  # 81% accuracy
    "quiz_total": 21,
    "quiz_time_total_s": 420,  # 20s average
    "distance_m": 1100,  # > 900m
    "stops_count": 8,
}

# Current code: Returns "speedrunner" (WRONG)
# Expected: "explorer" or weighted decision

assert classify_badge(**test_player) == "explorer"
```

### Test Case 2: Leaderboard Consistency

```python
# Fetch top 10 and verify each higher-ranked player 
# should have better composite score than lower-ranked
leaderboard = get_leaderboard_scores(limit=10)

for i in range(len(leaderboard["entries"]) - 1):
    current = leaderboard["entries"][i]
    next_player = leaderboard["entries"][i + 1]
    
    # Composite score should be monotonically decreasing
    current_composite = calculate_composite_score(current)
    next_composite = calculate_composite_score(next_player)
    
    assert current_composite >= next_composite, \
        f"Ranking inconsistency: {current['player_alias']} < {next_player['player_alias']}"
```

### Test Case 3: Score Fraud Prevention

```python
# Submit session with inflated score
session_data = {
    "session_uuid": "test-uuid",
    "player_alias": "hacker",
    "score": 10000,  # Impossible high score
    "quiz_correct": 2,
    "quiz_total": 2,
    "duration_s": 100,
    # ... other fields
}

# Server should recalculate and reject/correct
response = await finish_session(session_data)

# Verify actual score was calculated server-side
assert response["score"] == expected_calculated_score
assert response["score"] < 10000
```

---

**Report Generated**: 2026-05-20  
**Status**: 🔴 Requires Action (3 critical, 5 medium issues identified)
