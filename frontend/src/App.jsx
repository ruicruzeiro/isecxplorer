import { useEffect, useRef, useState } from "react";
import "./styles.css";

import Onboarding from "./components/Onboarding";
import Compass from "./components/Compass";
import StatusCard from "./components/StatusCard";
import ArrivedScreen from "./components/ArrivedScreen";
import QuizScreen from "./components/QuizScreen";
import { useGeoStream } from "./hooks/useGeoStream";
import { useCompassBearing } from "./hooks/useCompassBearing";

function App() {
  const [alias, setAlias] = useState("");
  const [started, setStarted] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [debugArrived, setDebugArrived] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [atStart, setAtStart] = useState(false);

  const {
    msg,
    wsConnected,
    target,
    lastGeo,
    lastMessage,
    deviceHeading,
    iniciarStream,
    wsRef,
  } = useGeoStream();

  const handleStart = () => {
    setStarted(true);
  };

  const handleContinueAfterQuiz = () => {
    setShowQuiz(false);
    setShowPopup(false);
    setDebugArrived(false);
    setCurrentQuiz(null);
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "confirm" }));
    }
  };

  const debugQuiz = {
    pergunta: "Qual é o nome deste ponto de interesse?",
    opcao_certa: "A",
    opcoes: {
      A: "Resposta A",
      B: "Resposta B",
      C: "Resposta C",
      D: "Resposta D",
    },
  };

  useEffect(() => {
    if (started && wsConnected) {
      iniciarStream();
    }
  }, [started, wsConnected]);

  const arrowRef = useRef(null);
  useCompassBearing({ target, lastGeo, deviceHeading, arrowRef });

  useEffect(() => {
    if (lastMessage?.type === "start_waiting") {
      setAtStart(Boolean(lastMessage.at_start));
    }
    if (lastMessage?.arrived) {
      setShowPopup(true);
      if (lastMessage.quiz) {
        setCurrentQuiz(lastMessage.quiz);
      }
    }
  }, [lastMessage]);

  if (!started) {
    return (
      <div className="app">
        <Onboarding alias={alias} setAlias={setAlias} onStart={handleStart} />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="screen nav-screen" id="screen-map">
        <div className="hud-bar">
          <div className="gps-chip">
            <div className={`gps-dot ${wsConnected ? "" : "weak"}`}></div>
            <span>{wsConnected ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>
        <main className="nav-main">
          <StatusCard lastMessage={lastMessage} />
          <Compass
            target={target}
            arrowRef={arrowRef}
            zone={lastMessage?.zone}
          />
          <div className={`zone-indicator zone-${lastMessage?.zone ?? "fora"}`}>
            {lastMessage?.zone ?? "fora"}
          </div>{" "}
          <div className="distance-card">
            <div className="dist-val">
              {target?.distance_m ? Math.round(target.distance_m) : "—"}
            </div>
            <div className="dist-unit">metros</div>
          </div>
          {lastMessage?.type === "start_waiting" && atStart && (
            <button
              className="cta-btn start-exploration-btn"
              onClick={() => {
                wsRef.current?.send(JSON.stringify({ type: "confirm_start" }));
              }}
            >
              Começar exploração!
            </button>
          )}
          <div className="debug-panel">
            <button onClick={() => setDebugArrived(true)}>
              Testar chegada
            </button>
            <button
              onClick={() => {
                if (wsRef.current) {
                  wsRef.current.send(JSON.stringify({ type: "confirm" }));
                }
              }}
            >
              Próximo POI
            </button>
          </div>
        </main>

        <ArrivedScreen
          showPopup={(showPopup || debugArrived) && !showQuiz}
          currentPoi={lastMessage?.current_poi}
          onStartQuiz={() => setShowQuiz(true)}
        />

        {showQuiz && (
          <QuizScreen
            quiz={currentQuiz ?? debugQuiz}
            currentPoi={lastMessage?.current_poi}
            onContinue={handleContinueAfterQuiz}
            wsRef={wsRef}
          />
        )}
      </div>
    </div>
  );
}

export default App;
