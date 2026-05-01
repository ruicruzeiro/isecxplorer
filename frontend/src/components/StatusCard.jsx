function StatusCard({ lastMessage }) {
  return (
    <section className="status-card">
      <div className="clue-eyebrow">
        {lastMessage?.message ?? "A aguardar sinal..."}
      </div>

      <div className="status-message">
        <span>{lastMessage?.zone ?? ""}</span>
      </div>
    </section>
  );
}

export default StatusCard;
