import { useEffect, useState } from "react";
import Compass from "./components/Compass";
import StatusCard from "./components/StatusCard";
import PopupArrive from "./components/PopupArrive";
import { useGeoStream } from "./hooks/useGeoStream";
import { computeBearing } from "./utils";

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

  const [arrowRotation, setArrowRotation] = useState(0);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (!target || !lastGeo) return;

    const bearing = computeBearing(
      lastGeo.latitude,
      lastGeo.longitude,
      target.lat,
      target.lon,
    );

    setArrowRotation(bearing - deviceHeading);
  }, [target, lastGeo, deviceHeading]);

  useEffect(() => {
    if (lastMessage?.arrived) {
      setShowPopup(true);
    }
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

      <Compass target={target} arrowRotation={arrowRotation} />

      <StatusCard lastMessage={lastMessage} />

      <PopupArrive
        showPopup={showPopup}
        setShowPopup={setShowPopup}
        wsRef={wsRef}
      />
    </div>
  );
}

export default App;
