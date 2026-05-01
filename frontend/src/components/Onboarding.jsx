function Onboarding({ alias, setAlias, onStart }) {
  const handleStart = () => {
    onStart(alias);
  };

  return (
    <div className="screen" id="screen-onboard">
      <div className="grid-bg"></div>

      <div className="radar-rings">
        <div className="radar-ring"></div>
        <div className="radar-ring"></div>
        <div className="radar-ring"></div>
        <div className="radar-ring"></div>
        <div className="radar-ring"></div>
        <div className="radar-sweep"></div>
      </div>

      <div className="onboard-content">
        <div className="logo-mark">
          <div className="logo-hex">
            <span>🎓</span>
          </div>
        </div>

        <div className="wordmark">
          ISEC<em>xplorer</em>
        </div>

        <div className="tagline">
          Instituto Superior de Engenharia de Coimbra
        </div>

        <div className="features-row">
          <div className="feat-card">
            <span className="feat-icon">📍</span>
            <div className="feat-label">22 POIs</div>
          </div>
          <div className="feat-card">
            <span className="feat-icon">🧭</span>
            <div className="feat-label">GPS live</div>
          </div>
          <div className="feat-card">
            <span className="feat-icon">🏆</span>
            <div className="feat-label">Ranking</div>
          </div>
        </div>

        <div className="input-group">
          <div className="input-label">
            <span>Nome de explorador</span>
            <span className={`char-count ${alias ? "active" : ""}`}>
              {alias.length}/40
            </span>
          </div>

          <div className="alias-field">
            <input
              className="alias-input"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              type="text"
              placeholder="ex: CampusRunner99"
              maxLength={40}
            />
          </div>
        </div>

        <button
          className="cta-btn"
          id="btn-start"
          disabled={!alias.trim()}
          onClick={handleStart}
        >
          INICIAR SESSÃO
        </button>
      </div>
    </div>
  );
}

export default Onboarding;
