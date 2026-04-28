export function Compass({ target, arrowRef }) {
  if (!target) return <p>Sem destino ativo.</p>;
  const isClose = target.distance_m < 10;

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
        ref={arrowRef}
        style={{
          fontSize: 100,
          lineHeight: 1,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: isClose ? "drop-shadow(0 0 12px gold)" : "none",
        }}
      >
        ↑
      </div>
      <p>Destino: {target.name}</p>
      <p>Distância: {target.distance_m?.toFixed(1)} m</p>
      {isClose && <p style={{ color: "green" }}>✓ Chegaste!</p>}
    </div>
  );
}

export default Compass;
