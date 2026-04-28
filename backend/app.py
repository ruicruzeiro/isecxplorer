import json
import random
from dataclasses import dataclass
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from constants import ROUTE, DEFAULT_MESSAGES, POI_DICT
from navigation import check_target_poi, get_poi_target

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
    last_zone: str = "fora"
    current_default_msg: str | None = None
    waiting_confirmation: bool = False

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    state = SessionState()

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)

            if data.get("type") == "confirm":
                state.current_poi_index += 1
                state.last_zone = "fora"
                state.waiting_confirmation = False
                state.current_default_msg = None
                continue

            if state.current_poi_index >= len(ROUTE):
                await websocket.send_json({
                    "type": "route_finished",
                    "payload": data,
                    "message": "Percurso terminado.",
                    "target": None,
                    "next_poi": None,
                })
                continue

            current_poi = ROUTE[state.current_poi_index]
            next_poi_name = POI_DICT.get(current_poi, current_poi)

            lat = data["geolocation"]["latitude"]
            lon = data["geolocation"]["longitude"]

            status = check_target_poi(lat, lon, current_poi)
            target = get_poi_target(current_poi, lat, lon)

            zone = status["zone"]
            message = None

            if zone == "val" and not state.waiting_confirmation:
                message = f"Chegaste a {current_poi}!"
                state.waiting_confirmation = True
                state.last_zone = zone

            elif zone != state.last_zone:
                state.current_default_msg = None
                if zone == "frio":
                    message = "Frio..."
                elif zone == "quente":
                    message = "Quente!"
                state.last_zone = zone

            if state.waiting_confirmation:
                message = f"Chegaste a {current_poi}!"
            elif message is None:
                if state.current_default_msg is None:
                    state.current_default_msg = random.choice(DEFAULT_MESSAGES)
                message = state.current_default_msg

            await websocket.send_json({
                "arrived": state.waiting_confirmation,
                "current_poi": current_poi,
                "target": target["name"] if target else None,
                "target_distance": target["distance_m"] if target else None,
                "target_coords": {
                    "lat": target["lat"],
                    "lon": target["lon"]
                } if target else None,
                "zone": zone,
                "message": message,
                "next_poi":  f"Próximo ponto: {next_poi_name}"
            })

    except WebSocketDisconnect:
        print("Cliente desligou o WebSocket")

app.mount("/", StaticFiles(directory="dist", html=True), name="static")
