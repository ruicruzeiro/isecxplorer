import { useEffect, useRef, useState } from "react";

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

console.log("host:", window.location.host);
console.log("protocol:", window.location.protocol);
console.log("WS_URL:", WS_URL);

function App() {
  const [msg, setMsg] = useState("A ligar WebSocket...");
  const [stream, setStream] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef(null);
  const watchIdRef = useRef(null);
  const imuCleanupRef = useRef(null);
  const latestImuRef = useRef(null);

  const pedirPermissaoIMU = async () => {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      const response = await DeviceMotionEvent.requestPermission();
      return response === "granted";
    }
    return true;
  };

  const ligarWebSocket = () => {
    console.log("A tentar ligar a:", WS_URL);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("WS ligado!");
      setWsConnected(true);
      setMsg("WebSocket ligado");
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setStream((prev) => [parsed, ...prev].slice(0, 20));
      } catch (err) {
        console.error("Erro a ler mensagem WS:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("Erro WS detalhado:", error);
      console.log("WS readyState no erro:", ws.readyState);
      setWsConnected(false);
      setMsg("Erro no WebSocket");
    };

    ws.onclose = (event) => {
      console.log(
        "WS fechado — código:",
        event.code,
        "razão:",
        event.reason,
        "limpo:",
        event.wasClean,
      );
      setWsConnected(false);
      setMsg("WebSocket desligado");
    };

    wsRef.current = ws;
  };

  const iniciarIMU = async () => {
    const permitida = await pedirPermissaoIMU();
    if (!permitida) {
      throw new Error("Permissão de IMU negada.");
    }

    const handler = (event) => {
      latestImuRef.current = {
        acceleration: event.acceleration
          ? {
              x: event.acceleration.x,
              y: event.acceleration.y,
              z: event.acceleration.z,
            }
          : null,
        accelerationIncludingGravity: event.accelerationIncludingGravity
          ? {
              x: event.accelerationIncludingGravity.x,
              y: event.accelerationIncludingGravity.y,
              z: event.accelerationIncludingGravity.z,
            }
          : null,
        rotationRate: event.rotationRate
          ? {
              alpha: event.rotationRate.alpha,
              beta: event.rotationRate.beta,
              gamma: event.rotationRate.gamma,
            }
          : null,
        interval: event.interval ?? null,
      };
    };

    window.addEventListener("devicemotion", handler);

    imuCleanupRef.current = () => {
      window.removeEventListener("devicemotion", handler);
    };
  };

  const iniciarStream = async () => {
    if (!navigator.geolocation) {
      setMsg("Geolocalização não suportada.");
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setMsg(
        "WebSocket ainda não está ligado. Espera 1-2 segundos e tenta novamente.",
      );
      return;
    }

    try {
      setMsg("A iniciar stream...");
      await iniciarIMU();

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const payload = {
            timestamp: Date.now(),
            geolocation: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
            },
            imu: latestImuRef.current,
          };

          console.log("A enviar:", payload);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
          }
        },
        (err) => {
          console.error("Erro geolocalização:", err);
          setMsg(`Erro de geolocalização: ${err.message}`);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        },
      );

      setMsg("Stream ativo");
    } catch (e) {
      console.error(e);
      setMsg("Erro ao iniciar stream: " + e.message);
    }
  };

  const pararStream = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (imuCleanupRef.current) {
      imuCleanupRef.current();
      imuCleanupRef.current = null;
    }

    setMsg(wsConnected ? "Stream parado" : "WebSocket desligado");
  };

  useEffect(() => {
    ligarWebSocket();

    return () => {
      pararStream();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>Geo + IMU em tempo real</h1>
      <p>{msg}</p>
      <p>Estado WS: {wsConnected ? "Ligado" : "Desligado"}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={iniciarStream} disabled={!wsConnected}>
          Iniciar stream
        </button>
        <button onClick={pararStream}>Parar stream</button>
      </div>

      <h2>Mensagens recebidas</h2>
      <div
        style={{
          background: "#111",
          color: "#0f0",
          padding: 12,
          borderRadius: 8,
          maxHeight: 400,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        {stream.length === 0
          ? "Sem dados ainda..."
          : stream.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                {JSON.stringify(item, null, 2)}
              </div>
            ))}
      </div>
    </div>
  );
}

export default App;
