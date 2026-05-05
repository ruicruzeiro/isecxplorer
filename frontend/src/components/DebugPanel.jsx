export function DebugPanel({
  setShowPopup,
  setShowQuiz,
  wsRef,
  score,
  setFinalStats,
  setGameFinished,
  setCurrentQuiz,
  setDebugCurrentPoi,
  debugPoiIndex,
  setDebugPoiIndex,
  poiDict,
}) {
  const ROUTE = [
    "gerais",
    "polivalente",
    "auditorio",
    "dec",
    "altice",
    "dem",
    "dee",
    "gab_electro",
    "deem",
    "lab_mecanica",
    "lab_civil",
    "horta",
    "carregador",
    "deis",
    "cantina",
    "clinica",
    "reprografia",
    "aeisec",
    "festas",
    "deqb",
    "bar_loja",
  ];

  const currentPoi = ROUTE[debugPoiIndex % ROUTE.length];

  return (
    <div className="debug-panel">
      <button
        onClick={async () => {
          try {
            const res = await fetch(`/api/v1/debug/quiz?poi=${currentPoi}`);
            const quiz = await res.json();
            if (!quiz.error) setCurrentQuiz(quiz);
          } catch {}
          setDebugCurrentPoi(currentPoi);
          setShowPopup(true);
          setDebugPoiIndex((i) => (i + 1) % ROUTE.length);
        }}
      >
        ⏭ Fast Forward ({poiDict[currentPoi] ?? currentPoi})
      </button>
      <button
        onClick={() => {
          setFinalStats({ score, pois_count: debugPoiIndex, duration_s: 420 });
          setGameFinished(true);
        }}
      >
        🏁 Leaderboard
      </button>
    </div>
  );
}
