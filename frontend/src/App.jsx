import { useEffect, useRef, useState } from "react";
import Compass from "./components/Compass";
import StatusCard from "./components/StatusCard";
import PopupArrive from "./components/PopupArrive";
import { useGeoStream } from "./hooks/useGeoStream";
import { useCompassBearing } from "./hooks/useCompassBearing";

function App() {
  const {
    msg,
    wsConnected,
    target,
    lastGeo,
    lastMessage,
    deviceHeading,
    iniciarStream,
    pararStream,
    wsRef,
  } = useGeoStream();

  const arrowRef = useRef(null);
  useCompassBearing({ target, lastGeo, deviceHeading, arrowRef });

  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (lastMessage?.arrived) setShowPopup(true);
  }, [lastMessage]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>ISECxplorer</h1>
      <p>{msg}</p>
      <p>Estado WS: {wsConnected ? "Ligado" : "Desligado"}</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button onClick={iniciarStream} disabled={!wsConnected}>
          Iniciar
        </button>
        <button onClick={pararStream}>Parar</button>
      </div>

      <Compass target={target} arrowRef={arrowRef} />
      <StatusCard lastMessage={lastMessage} />

      <p>Device heading: {deviceHeading?.toFixed(1)}°</p>
      <p>GPS heading: {lastGeo?.heading ?? "-"}</p>
      <p>Speed: {lastGeo?.speed ?? "-"}</p>

      <PopupArrive
        showPopup={showPopup}
        setShowPopup={setShowPopup}
        wsRef={wsRef}
      />
    </div>
  );
}

export default App;
