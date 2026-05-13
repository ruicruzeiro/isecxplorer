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
  speedrunner: { cls: "bp-speedrunner", label: "🏃 Speedrunner" },
  explorer: { cls: "bp-explorer", label: "🗺 Explorer" },
  learner: { cls: "bp-learner", label: "📚 Learner" },
  snail: { cls: "bp-snail", label: "🐌 Snail" },
  unranked: { cls: "bp-unranked", label: "—" },
};

function Leaderboard({ alias, onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/v1/leaderboard?limit=50")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setEntries(data.entries || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Erro ao carregar ranking.");
        setLoading(false);
      });
  }, []);

  const sorted = [...entries].sort(
    (a, b) => b.score - a.score || a.duration_s - b.duration_s,
  );

  const top3 = sorted.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]];

  return (
    <div className="screen leaderboard-screen">
      <header className="lb-header">
        <div className="header-row">
          <button className="back-btn" onClick={onBack}>
            ←
          </button>

          <div className="header-title-group">
            <div className="header-title">Ranking</div>
            <div className="header-subtitle">
              ISECxplorer · {entries.length || "—"} jogadores
            </div>
          </div>
        </div>
      </header>

      <main className="lb-body">
        {loading && (
          <div className="lb-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="skel-row skeleton"
                style={{ height: 56, marginBottom: 6 }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="error-state">
            <div className="error-icon">⚠</div>
            <div className="error-title">Sem ligação</div>
            <div className="error-body">{error}</div>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🏁</div>
            <div className="empty-title">Sem entradas</div>
            <div className="empty-body">Nenhuma sessão concluída ainda.</div>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <>
            <div className="section-label">Pódio</div>

            <div className="podium" style={{ marginBottom: 24 }}>
              {podiumOrder.map((e, i) => {
                if (!e) return <div key={i} className="podium-slot" />;

                const cls = ["pod-2nd", "pod-1st", "pod-3rd"][i];
                const baseH = [40, 56, 28][i];
                const rankLabel = [2, 1, 3][i];

                return (
                  <div
                    key={e.player_alias + i}
                    className={`podium-slot ${cls}`}
                  >
                    <div className="pod-avatar">
                      {rankLabel === 1 && <div className="pod-crown">👑</div>}
                      <span>{initials(e.player_alias)}</span>
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

            <div className="section-label">Todos os jogadores</div>

            <div className="lb-list">
              {sorted.map((e, idx) => {
                const isMe = alias && e.player_alias === alias;
                const badge = BADGE[e.badge] || BADGE.unranked;

                return (
                  <div
                    key={`${e.player_alias}-${idx}`}
                    className={`lb-row${isMe ? " is-me" : ""}`}
                  >
                    <div className="row-rank">{idx + 1}</div>

                    <div className="row-avatar">
                      <span>{initials(e.player_alias)}</span>
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
      </main>
    </div>
  );
}

export default Leaderboard;
