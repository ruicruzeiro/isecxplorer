export function Compass({ target, arrowRef, zone }) {
  if (!target) {
    return (
      <div className="big-compass empty">
        <p>Sem destino ativo</p>
      </div>
    );
  }

  return (
    <div className={`big-compass zone-${zone ?? "fora"}`}>
      <div className="big-compass-face">
        <span className="big-compass-mark n">◆</span>
        <span className="big-compass-mark s">◆</span>
        <span className="big-compass-mark e">◆</span>
        <span className="big-compass-mark w">◆</span>

        <div ref={arrowRef} className="big-needle-wrap">
          <div className="big-needle">
            <div className="big-needle-north"></div>
            <div className="big-needle-south"></div>
          </div>
          <div className="big-needle-center"></div>
        </div>
      </div>
    </div>
  );
}

export default Compass;
