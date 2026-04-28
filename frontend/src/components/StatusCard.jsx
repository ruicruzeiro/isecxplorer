function StatusCard({ lastMessage }) {
  return (
    <div
      style={{
        background: "#f4f4f4",
        padding: 12,
        borderRadius: 8,
        fontSize: 16,
      }}
    >
      {lastMessage ? (
        <>
          <p>
            <strong>POI de destino:</strong> {lastMessage.current_poi ?? "-"}
          </p>
          <p>
            <strong>Polígono atual:</strong> {lastMessage.zone ?? "-"}
          </p>
          <p>
            <strong>Polígono de destino:</strong> {lastMessage.target ?? "-"}
          </p>
          <p>
            <strong>Mensagem:</strong> {lastMessage.message ?? "-"}
          </p>
        </>
      ) : (
        <p>Sem dados ainda...</p>
      )}
    </div>
  );
}

export default StatusCard;
