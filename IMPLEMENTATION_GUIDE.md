# Integration Guide: Implementing isecxplorer Fixes

This guide provides step-by-step instructions to implement the critical fixes identified in the evaluation report.

**Status**: 🔴 CRITICAL - Implement before production deployment

---

## Table of Contents

1. [Pre-Implementation Checklist](#pre-implementation-checklist)
2. [Phase 1: Critical Fixes (Estimated 8 hours)](#phase-1-critical-fixes)
3. [Phase 2: Data Integrity Improvements (Estimated 6 hours)](#phase-2-data-integrity)
4. [Phase 3: Testing & Validation (Estimated 5 hours)](#phase-3-testing)
5. [Rollback Strategy](#rollback-strategy)
6. [Monitoring & Validation](#monitoring--validation)

---

## Pre-Implementation Checklist

- [ ] Backup PostgreSQL database: `pg_dump isecxplorer > backup_$(date +%Y%m%d).sql`
- [ ] Create a feature branch: `git checkout -b fix/ml-model-improvements`
- [ ] Set up test environment with sample data
- [ ] Review all changes with team
- [ ] Ensure no active user sessions during deployment

---

## Phase 1: Critical Fixes

### Step 1A: Update Badge Assignment Logic

**Issue**: Badge criteria overlap, causing incorrect assignments

**File**: `backend/badges.py`

**Implementation**:

1. **Backup original**:
```bash
cp backend/badges.py backend/badges.py.bak
```

2. **Replace with fixed version**:
```bash
cp backend/badges_fixed.py backend/badges.py
```

3. **Test badges**:
```bash
python -m pytest backend/test_fixes.py::TestBadgeAssignment -v
```

4. **Sample test case**:
```python
from badges import classify_badge

# Should return "explorer", not "speedrunner"
badge = classify_badge(
    duration_s=2400,
    score=900,
    pois_count=16,
    quiz_correct=10,
    quiz_total=16,
    quiz_time_total_s=500,
    distance_m=1050,
    stops_count=10,
)
assert badge == "explorer"
```

**Verification SQL**:
```sql
-- Check if badges are now more balanced
SELECT badge, COUNT(*) as count
FROM sessions
GROUP BY badge
ORDER BY count DESC;

-- Before fix: speedrunner dominates
-- After fix: More balanced distribution
```

---

### Step 1B: Implement Leaderboard Ranking Fix

**Issue**: Leaderboard ignores quiz accuracy and explorer distance

**File**: `backend/scoring_db.py`

**Implementation**:

1. **Backup original**:
```bash
cp backend/scoring_db.py backend/scoring_db.py.bak
```

2. **Patch the `get_leaderboard_scores` function**:

**Option A: Manual patching** (if you prefer to keep other functions intact):

Replace lines 121-150 in `scoring_db.py` with:

```python
def get_leaderboard_scores(limit: int = 50):
    """
    Get leaderboard with composite ranking.
    
    Ranking formula:
    - 40% weight to score
    - 35% weight to quiz accuracy
    - 20% weight to POI exploration
    - 5% bonus for efficiency
    """
    from constants import ROUTE
    
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    total_pois = len(ROUTE)

    cur.execute(
        f"""
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
            -- Composite ranking score
            (
                score * 0.40 +
                ROUND(CAST(quiz_correct AS FLOAT) / NULLIF(quiz_total, 0) * 100) * 0.35 +
                LEAST(pois_count, {total_pois}) / {total_pois} * 100 * 0.20 +
                (CASE 
                    WHEN duration_s > 0 
                    THEN 100.0 / LEAST(duration_s / 300.0, 5.0)
                    ELSE 0 
                END) * 0.05
            ) AS composite_rank
        FROM sessions
        WHERE score >= 0
        ORDER BY composite_rank DESC, score DESC, duration_s ASC
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
        "ranking_method": "composite (score 40% + accuracy 35% + exploration 20% + efficiency 5%)",
    }
```

**Option B: Complete file replacement**:

```bash
cp backend/scoring_db_fixed.py backend/scoring_db.py
```

3. **Test leaderboard**:
```bash
python -c "
from scoring_db import get_leaderboard_scores
result = get_leaderboard_scores(limit=10)
print('Top 10 players:')
for entry in result['entries']:
    print(f\"  {entry['player_alias']}: score={entry['score']}, accuracy={entry['quiz_correct']}/{entry['quiz_total']}, badge={entry['badge']}\")
"
```

4. **Verify composite ranking**:
```sql
-- Check that top-ranked players have balanced metrics
SELECT 
    player_alias,
    score,
    ROUND(CAST(quiz_correct AS FLOAT) / NULLIF(quiz_total, 0) * 100) as accuracy_pct,
    pois_count,
    duration_s,
    badge,
    RANK() OVER (ORDER BY score DESC, duration_s ASC) as rank
FROM sessions
LIMIT 10;
```

---

### Step 1C: Add Server-Side Score Validation

**Issue**: Client can submit fraudulent scores

**File**: `backend/scoring_db.py` - `save_scores()` function

**Implementation**:

Insert score validation at the beginning of `save_scores()`:

```python
def save_scores(data: dict):
    """Save session scores with server-side validation."""
    session_uuid = data.get("session_uuid") or str(uuid.uuid4())
    player_alias = data["player_alias"]
    
    # Original values from client
    client_score = int(data.get("score", 0))
    client_quiz_correct = int(data.get("quiz_correct", 0))
    client_quiz_total = int(data.get("quiz_total", 0))
    
    # FIX: Validate against server-calculated values
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Fetch quiz data from database
    cur.execute(
        """
        SELECT 
            COUNT(*) FILTER (WHERE is_correct = TRUE) AS correct_count,
            COUNT(*) AS total_count,
            SUM(COALESCE(response_time_s, 0)) AS total_response_time
        FROM quiz_attempts
        WHERE session_uuid = %s
        """,
        (session_uuid,)
    )
    
    quiz_stats = cur.fetchone()
    
    # Recalculate quiz metrics from database
    if quiz_stats and quiz_stats["total_count"] > 0:
        server_quiz_correct = quiz_stats["correct_count"]
        server_quiz_total = quiz_stats["total_count"]
        server_quiz_time = int(quiz_stats["total_response_time"] or 0)
        
        # Log if client values differ
        if server_quiz_correct != client_quiz_correct or server_quiz_total != client_quiz_total:
            print(f"⚠️  Quiz mismatch for {session_uuid}:")
            print(f"   Client: {client_quiz_correct}/{client_quiz_total}")
            print(f"   Server: {server_quiz_correct}/{server_quiz_total}")
        
        # Use server values (more trustworthy)
        quiz_correct = server_quiz_correct
        quiz_total = server_quiz_total
        quiz_time_total_s = server_quiz_time
    else:
        # No quiz data in database
        quiz_correct = 0
        quiz_total = 0
        quiz_time_total_s = 0
    
    # Recalculate score
    from scoring import QUIZ_POINTS
    
    calculated_score = 0
    if quiz_total > 0:
        calculated_score += quiz_correct * QUIZ_POINTS
    
    # Add POI bonuses
    cur.execute(
        """
        SELECT COALESCE(SUM((event_data::jsonb->>'time_bonus')::INT), 0) AS total_bonus
        FROM poi_events
        WHERE session_uuid = %s
          AND event_type = 'poi_arrival'
        """,
        (session_uuid,)
    )
    
    bonus_stats = cur.fetchone()
    if bonus_stats and bonus_stats["total_bonus"]:
        calculated_score += bonus_stats["total_bonus"]
    
    # Validate client score
    score_delta = abs(calculated_score - client_score)
    
    if score_delta > 10:
        print(f"⚠️  Score fraud detected for {session_uuid}:")
        print(f"   Client submitted: {client_score}")
        print(f"   Server calculated: {calculated_score}")
        final_score = calculated_score  # Use calculated score
    else:
        final_score = calculated_score
    
    # Continue with rest of save_scores() using validated values
    # ... rest of function ...
```

**Test**:
```python
# Test with fraudulent score
from scoring_db import save_scores

data = {
    "session_uuid": "test-fraud",
    "player_alias": "cheater",
    "score": 10000,  # Impossible high score
    "quiz_correct": 2,
    "quiz_total": 2,
    "duration_s": 100,
    # ... other fields
}

result = save_scores(data)
# Should use calculated score, not 10000
assert result["final_score"] < 10000
```

---

## Phase 2: Data Integrity Improvements

### Step 2A: Update Metrics Module (GPS Filtering)

**File**: `backend/metrics.py`

**Replace with**:

```bash
cp backend/metrics_fixed.py backend/metrics.py
```

**Update `app.py` to use new filtering**:

In `process_location_for_analytics()`, replace the GPS filtering section:

```python
# OLD CODE
if 1 <= step_m <= 80:
    state.distance_m += step_m

# NEW CODE (using fixed metrics)
from metrics import filter_gps_step

is_valid, reason = filter_gps_step(
    step_m=step_m,
    accuracy_m=accuracy_m,
    time_since_last_s=(now - state.last_location_ts) if state.last_location_ts else 1.0,
)

if is_valid:
    state.distance_m += step_m
```

**Test GPS filtering**:
```bash
python -m pytest backend/test_fixes.py::TestGPSFiltering -v
```

---

### Step 2B: Fix Performance Clustering

**File**: `backend/performance_clustering.py`

**Replace with**:

```bash
cp backend/performance_clustering_fixed.py backend/performance_clustering.py
```

**Update `app.py` endpoint** to handle new response format:

In the `/api/v1/analytics/recompute-performance-clusters` endpoint:

```python
@app.post("/api/v1/analytics/recompute-performance-clusters")
async def recompute_clusters(n_clusters: int = 4):
    result = recompute_performance_clusters(n_clusters=n_clusters)
    
    # The result now includes strategy and better error handling
    if not result["ok"]:
        return {
            "error": result.get("message", "Clustering failed"),
            "reason": result.get("reason"),
            "status": 400,  # Bad request or retry later
        }
    
    return result
```

**Test clustering**:
```bash
# Test with small dataset
curl -X POST http://localhost:8000/api/v1/analytics/recompute-performance-clusters?n_clusters=4
```

---

### Step 2C: Quiz Time Tracking Safety

**File**: `backend/app.py`

**Location**: Around line 370 in the POI arrival detection

**Replace**:

```python
# OLD
state.current_quiz = get_quiz_for_poi(current_poi)
state.quiz_started_at = time.time()

# NEW (with assertion)
state.current_quiz = get_quiz_for_poi(current_poi)
state.quiz_started_at = time.time()
assert state.quiz_started_at is not None, f"quiz_started_at must be initialized for {state.session_uuid}"
```

**Also in quiz answer handling** (around line 315):

```python
# NEW: Add defensive check
response_time_s = None
if state.quiz_started_at is not None:
    response_time_s = int(time.time() - state.quiz_started_at)
    state.quiz_time_total_s += response_time_s
else:
    # Log warning and use default
    print(f"⚠️  WARNING: quiz_started_at is None for session {state.session_uuid}")
    response_time_s = 30  # Conservative default
```

---

## Phase 3: Testing & Validation

### Step 3A: Run Test Suite

```bash
# Install pytest if not present
pip install pytest pytest-mock

# Run all tests
python -m pytest backend/test_fixes.py -v

# Run specific test class
python -m pytest backend/test_fixes.py::TestBadgeAssignment -v

# Run with coverage
python -m pytest backend/test_fixes.py --cov=backend --cov-report=html
```

**Expected output**:
```
test_fixes.py::TestBadgeAssignment::test_speedrunner_badge PASSED
test_fixes.py::TestBadgeAssignment::test_explorer_badge PASSED
test_fixes.py::TestSafeDivSemantics::test_zero_denominator_returns_none PASSED
... (all tests pass)
```

### Step 3B: Data Migration & Recalculation

After deploying code, recalculate badges and clusters for existing sessions:

```sql
-- 1. Recalculate badges for all sessions
-- (Backend handles this automatically, but can be run manually if needed)

-- 2. Run clustering on existing data
-- (Via API or manual script)

-- 3. Verify badge distribution
SELECT badge, COUNT(*) as count, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) as pct
FROM sessions
GROUP BY badge
ORDER BY count DESC;

-- Expected more balanced distribution:
-- quiz_master: 10-15%
-- speedrunner: 10-15%
-- explorer: 10-15%
-- snail: 5-10%
-- rookie: 40-50%
-- unranked: 5-10%
```

### Step 3C: Leaderboard Validation

```python
# Test script: validate_leaderboard.py

from scoring_db import get_leaderboard_scores

def validate_leaderboard():
    leaderboard = get_leaderboard_scores(limit=50)
    
    errors = []
    
    for i in range(len(leaderboard["entries"]) - 1):
        current = leaderboard["entries"][i]
        next_player = leaderboard["entries"][i + 1]
        
        current_composite = calculate_composite_score(current)
        next_composite = calculate_composite_score(next_player)
        
        if current_composite < next_composite:
            errors.append(
                f"Ranking error: {current['player_alias']} ({current_composite}) "
                f"ranks higher than {next_player['player_alias']} ({next_composite})"
            )
    
    if errors:
        print("❌ Leaderboard validation FAILED:")
        for error in errors:
            print(f"  - {error}")
        return False
    else:
        print("✅ Leaderboard validation PASSED")
        return True

def calculate_composite_score(entry):
    """Replicate composite score calculation."""
    accuracy = (entry["quiz_correct"] / entry["quiz_total"]) * 100 if entry["quiz_total"] > 0 else 0
    exploration = (entry["pois_count"] / 21) * 100  # 21 POIs
    
    composite = (
        entry["score"] * 0.40 +
        accuracy * 0.35 +
        exploration * 0.20 +
        (100 / min(entry["duration_s"] / 300, 5)) * 0.05
    )
    return composite

if __name__ == "__main__":
    validate_leaderboard()
```

Run:
```bash
python validate_leaderboard.py
```

---

## Rollback Strategy

If issues arise, rollback is straightforward:

```bash
# Restore original files
cp backend/badges.py.bak backend/badges.py
cp backend/scoring_db.py.bak backend/scoring_db.py
cp backend/metrics.py.bak backend/metrics.py
cp backend/performance_clustering.py.bak backend/performance_clustering.py

# Restart application
systemctl restart isecxplorer
# or: pkill -f "uvicorn" && uvicorn app:app --reload
```

**Database rollback** (if badges were recalculated):
```bash
# Restore from backup
psql -U postgres -d isecxplorer < backup_20260520.sql
```

---

## Monitoring & Validation

### Deploy to Production

```bash
# 1. Merge feature branch to main
git add .
git commit -m "fix: Implement ML model and leaderboard improvements

- Fix badge assignment with score-based selection
- Implement composite leaderboard ranking
- Add server-side score validation
- Improve GPS filtering with accuracy awareness
- Add adaptive clustering for small datasets
- Enhance quiz time tracking robustness

See EVALUATION_REPORT.md for detailed analysis."

git push origin fix/ml-model-improvements
# Create PR, review, merge to main

# 2. Deploy
git checkout main
git pull
pip install -r backend/requirements.txt
# Run tests one final time
python -m pytest backend/test_fixes.py -v
# Start application
cd backend
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Post-Deployment Monitoring

**1. Log Analysis** (First 1 hour):
```bash
tail -f logs/app.log | grep -E "Score mismatch|GPS jump|clustering"
```

Should see:
- No score mismatches (or only old sessions)
- Occasional GPS jump detections (normal)
- One clustering completion message

**2. Metrics Dashboard**:
```sql
-- Check badge distribution after fix
SELECT badge, COUNT(*) FROM sessions WHERE played_at > NOW() - INTERVAL '1 hour' GROUP BY badge;

-- Check leaderboard consistency
SELECT COUNT(*) as inconsistencies FROM (
    SELECT LAG(composite_rank) OVER (ORDER BY rank) as prev_rank, composite_rank, rank
    FROM (SELECT ROW_NUMBER() OVER (ORDER BY score DESC) as rank, score * 0.4 as composite_rank FROM sessions)
    WHERE prev_rank < composite_rank
) t;
-- Should return 0
```

**3. API Response Times**:
```bash
# Leaderboard endpoint should respond <500ms
time curl http://localhost:8000/api/v1/leaderboard?limit=50

# Profile endpoint should respond <300ms
time curl http://localhost:8000/api/v1/profile/test-player
```

---

## Success Criteria

✅ **All critical fixes successfully implemented** when:

- [ ] Badge distribution is balanced (no single badge dominates)
- [ ] All leaderboard ranks monotonically decrease in composite score
- [ ] No score mismatches detected in logs
- [ ] Quiz accuracy correlates with speedrunner badge
- [ ] Explorer badge awarded to players with high distance
- [ ] Clustering completes successfully even with < 10 sessions
- [ ] All API endpoints respond < 500ms
- [ ] Test suite passes 100%

---

## Timeline

| Phase | Task | Duration | Owner |
|-------|------|----------|-------|
| Phase 1 | Badge + Leaderboard + Score Validation | 8h | Backend Team |
| Phase 2 | Metrics + Clustering + Time Tracking | 6h | Backend Team |
| Phase 3 | Testing + Validation + Deployment | 5h | QA + DevOps |
| **Total** | | **19h** | |

---

## Contact & Support

If issues arise during implementation:

1. Check the EVALUATION_REPORT.md for detailed technical analysis
2. Review test_fixes.py for expected behavior
3. Check logs for specific error messages
4. Rollback if necessary (see Rollback Strategy section)

---

**Document Version**: 1.0  
**Last Updated**: 2026-05-20  
**Status**: Ready for Implementation
