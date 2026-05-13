function fmtTime(s) {
  if (!s && s !== 0) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m >= 60)
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function GameComplete({
  alias,
  score,
  poisCount,
  durationS,
  onShowLeaderboard,
}) {
  return (
    <div className="screen" id="screen-complete">
      <div className="complete-bg"></div>

      <div className="complete-hero">
        <div className="trophy-wrap">
          🏅
          <div className="trophy-orbit">
            <div className="trophy-dot"></div>
          </div>
        </div>

        <div className="complete-eyebrow">Missão Concluída</div>

        <div className="complete-headline">
          CAMPUS
          <br />
          CONQUISTADO
        </div>

        <div className="complete-score-block">
          <div className="complete-score-big">{score}</div>
          <div className="complete-score-lbl">Pontuação Final</div>
        </div>

        <div className="complete-stats-row">
          <div className="complete-stat">
            <div className="complete-stat-val">{fmtTime(durationS)}</div>
            <div className="complete-stat-lbl">Tempo</div>
          </div>

          <div className="complete-stat">
            <div className="complete-stat-val">{poisCount}</div>
            <div className="complete-stat-lbl">POIs</div>
          </div>
        </div>

        <button className="cta-btn" onClick={onShowLeaderboard}>
          Ver ranking
        </button>

        <button
          className="btn-secondary"
          onClick={() => window.location.reload()}
        >
          Voltar à página inicial
        </button>
      </div>
    </div>
  );
}

export default GameComplete;
