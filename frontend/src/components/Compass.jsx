function Compass({ target, arrowRotation }) {
  if (!target) {
    return <p>Sem destino ativo.</p>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        minHeight: 180,
      }}
    >
      <div
        style={{
          fontSize: 100,
          lineHeight: 1,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `rotate(${arrowRotation}deg)`,
          transition: "transform 0.2s linear",
        }}
      >
        ↑
      </div>

      <p>Destino: {target.name}</p>
      <p>Distância: {target.distance_m?.toFixed(1)} m</p>
    </div>
  );
}

export default Compass;
