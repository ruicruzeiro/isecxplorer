import { useState } from "react";

function Onboarding({ alias, setAlias, onStart, onShowLeaderboard }) {
  const [showConsent, setShowConsent] = useState(false);

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
          onClick={() => setShowConsent(true)}
        >
          INICIAR SESSÃO
        </button>

        <button className="cta-btn" onClick={onShowLeaderboard}>
          Ver ranking
        </button>
      </div>

      {/* Fora do onboard-content para não ficar preso no overflow */}
      {showConsent && (
        <div className="consent-overlay">
          <div className="consent-sheet">
            <div className="sheet-handle"></div>
            <div className="consent-icon">📡</div>
            <div className="consent-title">Antes de começar</div>
            <div className="consent-body">
              Ao iniciar, estás a autorizar a partilha da tua localização e
              dados de movimento com o servidor do ISECxplorer. Esses dados são
              usados para atualizar a bússola, calcular distâncias e registar o
              teu progresso. O servidor processa estas informações em tempo
              real, mas não as armazena permanentemente. Não são recolhidos
              dados pessoais além do nome de explorador que escolheste, e podes
              sair a qualquer momento para interromper a partilha.
            </div>
            <button className="cta-btn" onClick={() => onStart(alias)}>
              ACEITAR E CONTINUAR
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowConsent(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Onboarding;
