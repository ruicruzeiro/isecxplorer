import json
import time
import uuid
from dataclasses import dataclass, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from constants import ROUTE, POI_DICT
from navigation import check_target_poi, get_poi_target, get_quiz_for_poi, check_start
from scoring import calculate_time_bonus, calculate_quiz_points
from scoring_db import get_leaderboard_scores, save_scores
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
    waiting_start: bool = True
    start_confirmed: bool = False
    session_started_at: float = field(default_factory=time.time)
    visited_pois: set = field(default_factory=set)
    last_confirm_poi: str | None = None
    arrival_armed: bool = True


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    state = SessionState()

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)

            if data.get("type") == "confirm_start":
                state.waiting_start = False
                state.start_confirmed = True
                state.poi_started_at = time.time()
                state.session_started_at = time.time()
                state.current_default_msg = None
                state.last_zone = ""
                continue

            if data.get("type") == "confirm":
                print(f"[CONFIRM] poi_index antes: {state.current_poi_index}, waiting_confirmation: {state.waiting_confirmation}")
                if not state.waiting_confirmation:
                    print(f"[CONFIRM] ignorado — não estava em waiting_confirmation")
                    continue
                state.last_confirm_poi = ROUTE[state.current_poi_index] if state.current_poi_index < len(ROUTE) else None
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
                duration_s = int(time.time() - state.session_started_at)
                await websocket.send_json({
                    "type": "route_finished",
                    "message": "Percurso terminado.",
                    "score": state.score,
                    "pois_count": state.current_poi_index,
                    "duration_s": duration_s,
                })
                continue

            if data.get("type") == "quiz_answer":
                if state.quiz_answered:
                    continue
                answer = data.get("answer")
                quiz = state.current_quiz
                correct = quiz is not None and answer == quiz["resposta_certa"]
                points = calculate_quiz_points(correct)
                state.score += points
                state.quiz_answered = True
                state.current_quiz_answer = answer
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
                state.waiting_confirmation = True
                state.visited_pois.add(current_poi)
                state.last_zone = zone
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


app.mount("/", StaticFiles(directory="dist", html=True), name="static")
