import json
import time
import uuid
from dataclasses import dataclass, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from constants import ROUTE, POI_DICT
from navigation import check_target_poi, get_poi_target, get_quiz_for_poi, check_start
from scoring import calculate_time_bonus, calculate_quiz_points
from metrics import haversine_m
from analytics_db import (
    save_trajectory_point,
    save_poi_event,
    save_quiz_attempt,
    get_heatmap_points,
    get_dbscan_hotspots,
    get_route_segments,
)
from performance_clustering import recompute_performance_clusters
from scoring_db import get_leaderboard_scores, save_scores, get_player_profile
from messages import get_default_message, get_zone_message


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class SessionState:
    session_uuid: str = field(default_factory=lambda: str(uuid.uuid4()))
    player_alias: str | None = None

    current_poi_index: int = 0
    last_zone: str = ""
    current_default_msg: str | None = None
    waiting_confirmation: bool = False

    score: int = 0
    poi_started_at: float = field(default_factory=time.time)
    poi_session_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    current_quiz: dict | None = None
    current_quiz_answer: str | None = None
    quiz_answered: bool = False
    quiz_started_at: float | None = None
    quiz_correct: int = 0
    quiz_total: int = 0
    quiz_time_total_s: int = 0

    waiting_start: bool = True
    start_confirmed: bool = False
    session_started_at: float = field(default_factory=time.time)

    visited_pois: set = field(default_factory=set)
    last_confirm_poi: str | None = None
    arrival_armed: bool = True

    last_lat: float | None = None
    last_lon: float | None = None
    last_location_ts: float | None = None

    last_saved_lat: float | None = None
    last_saved_lon: float | None = None
    last_saved_at: float = 0.0

    distance_m: float = 0.0
    stops_count: int = 0
    last_stop_at: float = 0.0

    route_finished_sent: bool = False


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

        # Filtro anti-saltos de GPS.
        if 1 <= step_m <= 80:
            state.distance_m += step_m

    if speed_mps is not None and speed_mps < 0.35:
        if now - state.last_stop_at > 10:
            state.stops_count += 1
            state.last_stop_at = now

    should_save = False

    if now - state.last_saved_at >= 1.5:
        if state.last_saved_lat is None or state.last_saved_lon is None:
            should_save = True
        else:
            moved_since_save = haversine_m(
                state.last_saved_lat,
                state.last_saved_lon,
                lat,
                lon,
            )
            should_save = moved_since_save >= 2

    if should_save:
        save_trajectory_point(
            session_uuid=state.session_uuid,
            player_alias=state.player_alias,
            client_timestamp=client_timestamp,
            lat=lat,
            lon=lon,
            accuracy_m=accuracy_m,
            speed_mps=speed_mps,
            heading=heading,
            current_poi=current_poi,
            zone=zone,
        )

        state.last_saved_lat = lat
        state.last_saved_lon = lon
        state.last_saved_at = now

    state.last_lat = lat
    state.last_lon = lon
    state.last_location_ts = now


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    state = SessionState()

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)

            if data.get("type") == "init_session":
                alias = (data.get("player_alias") or "anonymous").strip()
                state.player_alias = alias[:40] if alias else "anonymous"

                save_poi_event(
                    session_uuid=state.session_uuid,
                    player_alias=state.player_alias,
                    poi="start",
                    event_type="session_initialized",
                    score_after_event=state.score,
                )

                await websocket.send_json({
                    "type": "session_initialized",
                    "session_uuid": state.session_uuid,
                })

                continue

            if data.get("type") == "confirm_start":
                state.waiting_start = False
                state.start_confirmed = True
                state.poi_started_at = time.time()
                state.session_started_at = time.time()
                state.current_default_msg = None
                state.last_zone = ""

                save_poi_event(
                    session_uuid=state.session_uuid,
                    player_alias=state.player_alias,
                    poi="start",
                    event_type="start_confirmed",
                    score_after_event=state.score,
                )

                continue

            if data.get("type") == "confirm":
                print(f"[CONFIRM] poi_index antes: {state.current_poi_index}, waiting_confirmation: {state.waiting_confirmation}")
                if not state.waiting_confirmation:
                    print(f"[CONFIRM] ignorado — não estava em waiting_confirmation")
                    continue
                state.last_confirm_poi = ROUTE[state.current_poi_index] if state.current_poi_index < len(ROUTE) else None
                save_poi_event(
                    session_uuid=state.session_uuid,
                    player_alias=state.player_alias,
                    poi=state.last_confirm_poi,
                    event_type="poi_confirmed",
                    score_after_event=state.score,
                )
                state.current_poi_index += 1
                state.arrival_armed = False
                state.poi_session_id = str(uuid.uuid4())
                print(f"[CONFIRM] poi_index depois: {state.current_poi_index}")
                state.last_zone = ""
                state.waiting_confirmation = False
                state.current_default_msg = None
                state.poi_started_at = time.time()
                state.current_quiz = None
                state.quiz_answered = False
                continue

            if state.waiting_start:
                if "geolocation" not in data:
                    continue
                lat = data["geolocation"]["latitude"]
                lon = data["geolocation"]["longitude"]
                start_status = check_start(lat, lon)

                process_location_for_analytics(
                    state=state,
                    data=data,
                    current_poi="start",
                    zone="val" if start_status["inside"] else "fora",
                )

                await websocket.send_json({
                    "type": "start_waiting",
                    "current_poi": "start",
                    "target": "start",
                    "target_distance": start_status["distance_m"],
                    "target_coords": start_status["target_coords"],
                    "zone": "val" if start_status["inside"] else "fora",
                    "message": "Dirige-te ao ponto de partida.",
                    "zone_message": "Pronto para começar!" if start_status["inside"] else None,
                    "at_start": start_status["inside"],
                    "score": state.score,
                })
                continue

            if state.current_poi_index >= len(ROUTE):
                if not state.route_finished_sent:
                    duration_s = int(time.time() - state.session_started_at)
                    avg_speed_mps = state.distance_m / duration_s if duration_s > 0 else 0

                    save_poi_event(
                        session_uuid=state.session_uuid,
                        player_alias=state.player_alias,
                        poi="finish",
                        event_type="route_finished",
                        elapsed_s=duration_s,
                        score_after_event=state.score,
                        event_data={
                            "distance_m": round(state.distance_m, 2),
                            "stops_count": state.stops_count,
                            "avg_speed_mps": round(avg_speed_mps, 3),
                            "quiz_correct": state.quiz_correct,
                            "quiz_total": state.quiz_total,
                        },
                    )

                    await websocket.send_json({
                        "type": "route_finished",
                        "session_uuid": state.session_uuid,
                        "message": "Percurso terminado.",
                        "score": state.score,
                        "pois_count": state.current_poi_index,
                        "duration_s": duration_s,
                        "quiz_correct": state.quiz_correct,
                        "quiz_total": state.quiz_total,
                        "quiz_time_total_s": state.quiz_time_total_s,
                        "distance_m": round(state.distance_m, 2),
                        "stops_count": state.stops_count,
                        "avg_speed_mps": round(avg_speed_mps, 3),
                    })

                    state.route_finished_sent = True

                continue

            if data.get("type") == "quiz_answer":
                if state.quiz_answered:
                    continue

                answer = data.get("answer")
                quiz = state.current_quiz
                current_poi = ROUTE[state.current_poi_index]

                correct = quiz is not None and answer == quiz["resposta_certa"]

                points = calculate_quiz_points(correct)
                state.score += points

                response_time_s = None
                if state.quiz_started_at is not None:
                    response_time_s = int(time.time() - state.quiz_started_at)
                    state.quiz_time_total_s += response_time_s

                state.quiz_total += 1
                if correct:
                    state.quiz_correct += 1

                state.quiz_answered = True
                state.current_quiz_answer = answer

                save_quiz_attempt(
                    session_uuid=state.session_uuid,
                    player_alias=state.player_alias,
                    poi=current_poi,
                    question=quiz["pergunta"] if quiz else None,
                    selected_answer=answer,
                    correct_answer=quiz["resposta_certa"] if quiz else None,
                    is_correct=correct,
                    response_time_s=response_time_s,
                )

                await websocket.send_json({
                    "type": "quiz_result",
                    "correct": correct,
                    "answer": answer,
                    "correct_answer": quiz["resposta_certa"] if quiz else None,
                    "points": points,
                    "score": state.score,
                    "message": "Resposta certa!" if correct else "Resposta errada.",
                })
                continue

            current_poi = ROUTE[state.current_poi_index]
            next_poi_name = POI_DICT.get(current_poi, current_poi)

            if "geolocation" not in data:
                continue

            lat = data["geolocation"]["latitude"]
            lon = data["geolocation"]["longitude"]

            status = check_target_poi(lat, lon, current_poi)
            target = get_poi_target(current_poi, lat, lon)

            zone = status["zone"]

            process_location_for_analytics(
                state=state,
                data=data,
                current_poi=current_poi,
                zone=zone,
            )

            message = get_default_message(state)
            zone_message = None

            if state.waiting_confirmation:
                print(f"[WAITING_CONF] a enviar arrived=True para poi: {current_poi}, quiz: {state.current_quiz is not None}")
                await websocket.send_json({
                    "arrived": True,
                    "poi_session_id": state.poi_session_id,
                    "current_poi": current_poi,
                    "target": target["name"] if target else None,
                    "target_distance": target["distance_m"] if target else None,
                    "target_coords": {
                        "lat": target["lat"],
                        "lon": target["lon"],
                    } if target else None,
                    "zone": "val",
                    "message": message,
                    "zone_message": get_zone_message("val", current_poi),
                    "next_poi": f"Próximo ponto: {next_poi_name}",
                    "quiz": state.current_quiz,
                    "score": state.score,
                })
                continue

            if not state.arrival_armed and zone != "val":
                state.arrival_armed = True

            if zone == "val" and state.arrival_armed and current_poi not in state.visited_pois:
                print(f"[VAL DETECTADO] poi: {current_poi}, visited: {state.visited_pois}")
                seconds_elapsed = time.time() - state.poi_started_at
                time_bonus = calculate_time_bonus(seconds_elapsed)
                state.score += time_bonus
                state.current_quiz = get_quiz_for_poi(current_poi)
                state.quiz_started_at = time.time()
                state.waiting_confirmation = True
                state.visited_pois.add(current_poi)
                state.last_zone = zone
                save_poi_event(
                    session_uuid=state.session_uuid,
                    player_alias=state.player_alias,
                    poi=current_poi,
                    event_type="poi_arrival",
                    elapsed_s=int(seconds_elapsed),
                    score_after_event=state.score,
                    lat=lat,
                    lon=lon,
                    event_data={
                        "time_bonus": time_bonus,
                    },
                )
                zone_message = get_zone_message(
                    "val",
                    current_poi,
                    time_bonus=time_bonus,
                )
            elif zone != state.last_zone:
                zone_message = get_zone_message(zone, current_poi)
                state.last_zone = zone

            await websocket.send_json({
                "arrived": state.waiting_confirmation,
                "poi_session_id": state.poi_session_id,
                "current_poi": current_poi,
                "target": target["name"] if target else None,
                "target_distance": target["distance_m"] if target else None,
                "target_coords": {
                    "lat": target["lat"],
                    "lon": target["lon"],
                } if target else None,
                "zone": zone,
                "message": message,
                "zone_message": zone_message,
                "next_poi": f"Próximo ponto: {next_poi_name}",
                "quiz": state.current_quiz if state.waiting_confirmation else None,
                "score": state.score,
            })

    except WebSocketDisconnect:
        print("Cliente desligou o WebSocket")


@app.get("/api/v1/constants")
async def get_constants():
    return {"poi_dict": POI_DICT, "route": ROUTE}


@app.get("/analytics")
async def analytics_dashboard():
    return RedirectResponse(url="/#analytics")


@app.post("/api/v1/session/finish")
async def finish_session(data: dict):
    return save_scores(data)


@app.get("/api/v1/leaderboard")
async def get_leaderboard(limit: int = 50):
    return get_leaderboard_scores(limit=limit)


@app.get("/api/v1/debug/quiz")
async def debug_random_quiz(poi: str = None):
    from navigation import get_quiz_for_poi
    from constants import ROUTE
    import random
    target_poi = poi if poi in ROUTE else random.choice(ROUTE)
    quiz = get_quiz_for_poi(target_poi)
    if not quiz:
        return {"error": "Sem perguntas na BD"}
    return quiz


@app.get("/api/v1/debug/recompute-clusters")
async def debug_recompute_clusters_info():
    return {
        "ok": False,
        "reason": "method_not_allowed_for_recompute",
        "message": "Usa POST /api/v1/debug/recompute-clusters?n_clusters=2 para testar K-Means com o minimo de 2 sessoes.",
    }


@app.post("/api/v1/debug/recompute-clusters")
async def debug_recompute_clusters(n_clusters: int = 2):
    return recompute_performance_clusters(
        n_clusters=n_clusters,
        update_badges=True,
        force=True,
        debug_mode=True,
    )


@app.get("/api/v1/profile/{alias}")
async def profile(alias: str):
    return get_player_profile(alias)


@app.get("/api/v1/analytics/heatmap")
async def heatmap(grid_m: float = 5.0, limit: int = 1000):
    return get_heatmap_points(grid_m=grid_m, limit=limit)


@app.get("/api/v1/analytics/hotspots")
async def hotspots(eps_m: float = 8.0, min_points: int = 5):
    return get_dbscan_hotspots(eps_m=eps_m, min_points=min_points)


@app.get("/api/v1/analytics/route-segments")
async def route_segments(limit: int = 2000):
    return get_route_segments(limit=limit)


@app.get("/api/v1/ml/recompute-clusters")
async def recompute_clusters_info():
    return {
        "ok": False,
        "reason": "method_not_allowed_for_recompute",
        "message": "Usa POST /api/v1/ml/recompute-clusters para recalcular K-Means. A dashboard abre em /#analytics.",
    }


@app.post("/api/v1/ml/recompute-clusters")
async def recompute_ml_clusters(n_clusters: int = 5):
    return recompute_performance_clusters(n_clusters=n_clusters, force=True)


@app.post("/api/v1/analytics/recompute-performance-clusters")
async def recompute_clusters(n_clusters: int = 5):
    return recompute_performance_clusters(n_clusters=n_clusters, force=True)


app.mount("/", StaticFiles(directory="dist", html=True), name="static")
