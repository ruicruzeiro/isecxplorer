import json
import psycopg2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_connection():
    return psycopg2.connect(
        host="localhost",
        database="isecxplorer",
        user="postgres",
        password="postgres"
    )

def distance_to_polygons(lat, lon):
    conn = get_connection()
    cur = conn.cursor()

    query = """
    SELECT
        name,
        ST_Distance(
            ST_Transform(geom, 4326)::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) AS distance
    FROM isec_poligonos
    ORDER BY distance;
    """

    cur.execute(query, (lon, lat))
    results = cur.fetchall()

    cur.close()
    conn.close()

    return [
        {"name": r[0], "distancia_m": r[1]}
        for r in results
    ]

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("Pedido de WS recebido")
    await websocket.accept()
    print("WS aceite")

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)

            print("Mensagem recebida por WS:")
            print(data)

            lat = data["geolocation"]["latitude"]
            lon = data["geolocation"]["longitude"]

            distance = distance_to_polygons(lat, lon)

            await websocket.send_json({
                "type": "sensor_data",
                "payload": data,
                "distancias": distance
            })
    except WebSocketDisconnect:
        print("Cliente desligou o WebSocket")

app.mount("/", StaticFiles(directory="dist", html=True), name="static")
