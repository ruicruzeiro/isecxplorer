import { useEffect, useState } from "react";

function fmtTime(s) {
  if (!s && s !== 0) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  if (m >= 60)
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/[\s_-]/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

const BADGE = {
  speedrunner: { cls: "bp-speedrunner", label: "🏃 ISEC Speedrunner" },
  explorer: { cls: "bp-explorer", label: "🗺 Veterano" },
  learner: { cls: "bp-learner", label: "📚 Caloiro" },
  snail: { cls: "bp-snail", label: "🐌 Lesma" },
  unranked: { cls: "bp-unranked", label: "—" },
};

function GameComplete({ alias, score, poisCount, durationS }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/v1/leaderboard?limit=50")
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const myRank = entries.findIndex((e) => e.player_alias === alias) + 1;
  const top3 = [...entries]
    .sort((a, b) => b.score - a.score || a.duration_s - b.duration_s)
    .slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]]; // 2º | 1º | 3º

  return (
    <div className="screen" id="screen-complete">
      <div className="complete-bg"></div>

      {/* ── Cabeçalho de resultado pessoal ── */}
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
          {myRank > 0 && (
            <div className="complete-stat">
              <div className="complete-stat-val acid">#{myRank}</div>
              <div className="complete-stat-lbl">Ranking</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      <div className="complete-lb-section">
        <div className="complete-lb-label">Ranking</div>

        {loading && (
          <div className="lb-loading">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skel-row skeleton"
                style={{ height: 56, marginBottom: 6 }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="lb-error">Não foi possível carregar o ranking.</div>
        )}

        {!loading && !error && (
          <>
            {/* Pódio */}
            <div className="podium" style={{ marginBottom: 20 }}>
              {podiumOrder.map((e, i) => {
                if (!e) return <div key={i} className="podium-slot" />;
                const cls = ["pod-2nd", "pod-1st", "pod-3rd"][i];
                const baseH = [40, 56, 28][i];
                const rankLabel = [2, 1, 3][i];
                return (
                  <div key={i} className={`podium-slot ${cls}`}>
                    <div className="pod-avatar">
                      {rankLabel === 1 && <div className="pod-crown">👑</div>}
                      <span
                        style={{
                          fontFamily: "var(--f-display)",
                          fontSize: 18,
                          color: "var(--fog)",
                        }}
                      >
                        {initials(e.player_alias)}
                      </span>
                    </div>
                    <div className="pod-name">{e.player_alias}</div>
                    <div className="pod-time">{e.score} pts</div>
                    <div className="pod-base" style={{ height: baseH }}>
                      <div className="pod-rank-num">{rankLabel}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Lista completa */}
            <div className="lb-list">
              {entries.map((e, idx) => {
                const isMe = e.player_alias === alias;
                const badge = BADGE[e.badge] || BADGE.unranked;
                return (
                  <div
                    key={idx}
                    className={`lb-row${isMe ? " is-me" : ""}`}
                    style={{ animationDelay: `${Math.min(idx * 0.04, 0.6)}s` }}
                  >
                    <div className="row-rank">{idx + 1}</div>
                    <div className="row-avatar">
                      <span
                        style={{
                          fontFamily: "var(--f-display)",
                          fontSize: 15,
                          color: "var(--fog)",
                        }}
                      >
                        {initials(e.player_alias)}
                      </span>
                    </div>
                    <div className="row-info">
                      <div className="row-name">
                        {e.player_alias}
                        {isMe && <span className="me-tag">TU</span>}
                      </div>
                      <div className="row-meta">
                        <span className={`badge-pill ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="meta-sep">·</span>
                        <span className="meta-item">📍 {e.pois_count}</span>
                      </div>
                    </div>
                    <div className="row-score-block">
                      <div className="row-time">{e.score}</div>
                      <div className="row-score-sub">
                        {fmtTime(e.duration_s)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
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
