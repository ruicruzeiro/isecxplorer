import json
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
            await websocket.send_json({
                "type": "sensor_data",
                "payload": data,
            })
    except WebSocketDisconnect:
        print("Cliente desligou o WebSocket")

app.mount("/", StaticFiles(directory="dist", html=True), name="static")
