import { useEffect, useRef, useState } from "react";
import "./styles.css";

import Onboarding from "./components/Onboarding";
import Compass from "./components/Compass";
import ArrivedScreen from "./components/ArrivedScreen";
import QuizScreen from "./components/QuizScreen";
import GameComplete from "./components/GameComplete";
import { useGeoStream } from "./hooks/useGeoStream";
import { useCompassBearing } from "./hooks/useCompassBearing";
import { DebugPanel } from "./components/DebugPanel";

function App() {
  const [alias, setAlias] = useState("");
  const [started, setStarted] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [debugArrived, setDebugArrived] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [atStart, setAtStart] = useState(false);
  const [score, setScore] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);
  const [finalStats, setFinalStats] = useState(null);
  const [debugPoiIndex, setDebugPoiIndex] = useState(0);
  const [poiDict, setPoiDict] = useState({});
  const [debugCurrentPoi, setDebugCurrentPoi] = useState(null);

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

  const currentPoiName =
    poiDict[debugCurrentPoi ?? lastMessage?.current_poi] ??
    debugCurrentPoi ??
    lastMessage?.current_poi;

  const handleStart = () => {
    setStarted(true);
  };

  const handleContinueAfterQuiz = () => {
    setShowQuiz(false);
    setShowPopup(false);
    setDebugArrived(false);
    setCurrentQuiz(null);
    setDebugCurrentPoi(null);
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "confirm" }));
    }
  };

  useEffect(() => {
    fetch("/api/v1/constants")
      .then((r) => r.json())
      .then((data) => setPoiDict(data.poi_dict))
      .catch(console.error);
  }, []);

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
    if (lastMessage?.score !== undefined) {
      setScore(lastMessage.score);
    }
    if (lastMessage?.type === "route_finished") {
      const stats = {
        score: lastMessage.score,
        pois_count: lastMessage.pois_count,
        duration_s: lastMessage.duration_s,
      };
      setFinalStats(stats);
      setGameFinished(true);
      fetch("/api/v1/session/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_alias: alias, ...stats }),
      }).catch(console.error);
    }
  }, [lastMessage]);

  if (!started) {
    return (
      <div className="app">
        <Onboarding alias={alias} setAlias={setAlias} onStart={handleStart} />
      </div>
    );
  }

  if (gameFinished && finalStats) {
    return (
      <div className="app">
        <GameComplete
          alias={alias}
          score={finalStats.score}
          poisCount={finalStats.pois_count}
          durationS={finalStats.duration_s}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="screen nav-screen" id="screen-map">
        <div className="hud-bar">
          <div className="hud-chip">
            <div className="hud-score-num">{score}</div>
            <div className="hud-lbl">pontos</div>
          </div>
          <div className="gps-chip">
            <div className={`gps-dot ${wsConnected ? "" : "weak"}`}></div>
            <span>{wsConnected ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>
        <main className="nav-main">
          <div className="status-message-only">
            {lastMessage?.message ?? msg}
          </div>
          <Compass
            target={target}
            arrowRef={arrowRef}
            zone={lastMessage?.zone}
          />
          <div className={`zone-indicator zone-${lastMessage?.zone}`}>
            {lastMessage?.zone_message}
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
          <DebugPanel
            setShowPopup={setShowPopup}
            setShowQuiz={setShowQuiz}
            wsRef={wsRef}
            score={score}
            setFinalStats={setFinalStats}
            setGameFinished={setGameFinished}
            setCurrentQuiz={setCurrentQuiz}
            setDebugCurrentPoi={setDebugCurrentPoi}
            debugPoiIndex={debugPoiIndex}
            setDebugPoiIndex={setDebugPoiIndex}
            poiDict={poiDict}
          />
        </main>

        <ArrivedScreen
          showPopup={(showPopup || debugArrived) && !showQuiz}
          currentPoi={currentPoiName}
          onStartQuiz={() => setShowQuiz(true)}
        />

        {showQuiz && currentQuiz && (
          <QuizScreen
            quiz={currentQuiz}
            currentPoi={currentPoiName}
            onContinue={handleContinueAfterQuiz}
            wsRef={wsRef}
          />
        )}
      </div>
    </div>
  );
}

export default App;
