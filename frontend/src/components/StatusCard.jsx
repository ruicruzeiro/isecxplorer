function StatusCard({ lastMessage }) {
  return (
    <section className="status-message-only">
      {lastMessage?.message ?? "A aguardar sinal..."}
    </section>
  );
}

export default StatusCard;
