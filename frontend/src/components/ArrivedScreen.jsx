function ArrivedScreen({ showPopup, currentPoi, onStartQuiz }) {
  if (!showPopup) return null;

  return (
    <div className="arrived-screen">
      <div className="arrived-card">
        <div className="arrived-kicker">Ponto alcançado</div>
        <h1 className="arrived-title">{currentPoi ?? "Destino"}</h1>
        <p className="arrived-text">
          Boa! Agora prepara-te para responder a umas perguntas.
        </p>
        <button className="cta-btn arrived-btn" onClick={onStartQuiz}>
          Seguir para quiz
        </button>
      </div>
    </div>
  );
}

export default ArrivedScreen;
