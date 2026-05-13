import { useEffect, useRef, useState } from "react";
import "./styles.css";

import Onboarding from "./components/Onboarding";
import Compass from "./components/Compass";
import ArrivedScreen from "./components/ArrivedScreen";
import QuizScreen from "./components/QuizScreen";
import GameComplete from "./components/GameComplete";
import { useGeoStream } from "./hooks/useGeoStream";
import { useCompassBearing } from "./hooks/useCompassBearing";
import Leaderboard from "./components/LeaderBoard";

function App() {
  const [alias, setAlias] = useState("");
  const [started, setStarted] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [atStart, setAtStart] = useState(false);
  const [score, setScore] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);
  const [finalStats, setFinalStats] = useState(null);
  const [poiDict, setPoiDict] = useState({});
  const [zoneMessage, setZoneMessage] = useState(null);
  const showPopupRef = useRef(false);
  const showQuizRef = useRef(false);
  const gameFinishedRef = useRef(false);
  const confirmSentRef = useRef(false);
  const lastArrivedSessionId = useRef(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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
    poiDict[lastMessage?.current_poi] ?? lastMessage?.current_poi;

  const handleStart = () => {
    setStarted(true);
  };

  const handleContinueAfterQuiz = () => {
    console.log(
      "[handleContinueAfterQuiz] chamado, confirmSentRef:",
      confirmSentRef.current,
      "timestamp:",
      Date.now(),
      "ref object:",
      confirmSentRef,
    );
    if (confirmSentRef.current) {
      console.log("[handleContinueAfterQuiz] BLOQUEADO");
      return;
    }
    confirmSentRef.current = true;
    wsRef.current?.send(JSON.stringify({ type: "confirm" }));
    console.log(
      "[handleContinueAfterQuiz] ref definida para true:",
      confirmSentRef.current,
    );
    setShowQuiz(false);
    setShowPopup(false);
    setCurrentQuiz(null);
    setZoneMessage(null);
  };

  useEffect(() => {
    showPopupRef.current = showPopup;
  }, [showPopup]);
  useEffect(() => {
    showQuizRef.current = showQuiz;
  }, [showQuiz]);
  useEffect(() => {
    gameFinishedRef.current = gameFinished;
  }, [gameFinished]);

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

    if (
      lastMessage?.arrived &&
      !showPopupRef.current &&
      !showQuizRef.current &&
      !gameFinishedRef.current
    ) {
      if (lastMessage.poi_session_id !== lastArrivedSessionId.current) {
        lastArrivedSessionId.current = lastMessage.poi_session_id;
        confirmSentRef.current = false;
        setShowPopup(true);
        if (lastMessage.quiz) setCurrentQuiz(lastMessage.quiz);
      }
    }

    if (!showPopupRef.current && !showQuizRef.current) {
      if (lastMessage?.zone_message) {
        setZoneMessage(lastMessage.zone_message);
      } else if (lastMessage?.zone === "fora" || lastMessage?.zone === "") {
        setZoneMessage(null);
      }
    }

    if (lastMessage?.score !== undefined) {
      setScore(lastMessage.score);
    }

    if (lastMessage?.type === "route_finished" && !gameFinishedRef.current) {
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

  if (showLeaderboard) {
    return (
      <div className="app">
        <Leaderboard alias={alias} onBack={() => setShowLeaderboard(false)} />
      </div>
    );
  }

  if (!started) {
    return (
      <div className="app">
        <Onboarding
          alias={alias}
          setAlias={setAlias}
          onStart={handleStart}
          onShowLeaderboard={() => setShowLeaderboard(true)}
        />
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
          onShowLeaderboard={() => setShowLeaderboard(true)}
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
            {zoneMessage}
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
        </main>

        <ArrivedScreen
          showPopup={showPopup && !showQuiz}
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
