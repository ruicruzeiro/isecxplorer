function PopupArrive({ showPopup, setShowPopup, wsRef }) {
  if (!showPopup) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        <h2>Chegou!</h2>

        <button
          onClick={() => {
            setShowPopup(false);

            wsRef.current.send(JSON.stringify({ type: "confirm" }));
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default PopupArrive;
