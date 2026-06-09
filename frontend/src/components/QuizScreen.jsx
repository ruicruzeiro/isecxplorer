import { useState, useMemo } from "react";

function stableOptionOrder(seed, key, value) {
  const input = `${seed}|${key}|${value}`;
  let hash = 0;

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function QuizScreen({ quiz, currentPoi, onContinue, wsRef }) {
  const [selected, setSelected] = useState(null);
  const [continuing, setContinuing] = useState(false);
  const shuffled = useMemo(() => {
    if (!quiz) return [];

    return Object.entries(quiz.opcoes)
      .map(([key, value]) => ({
        entry: [key, value],
        sortKey: stableOptionOrder(quiz.pergunta, key, value),
      }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ entry }) => entry);
  }, [quiz]);

  if (!quiz) return null;

  const isAnswered = selected !== null;
  const isCorrect = selected === quiz.resposta_certa;

  const handleContinue = () => {
    if (continuing) return;
    setContinuing(true);
    onContinue();
  };

  return (
    <div className="arrived-screen">
      <div className="arrived-card">
        <div className="arrived-kicker">Quiz · {currentPoi}</div>

        <h1 className="arrived-title">Pergunta</h1>

        <p className="arrived-text">{quiz.pergunta}</p>

        {shuffled.map(([key, value]) => (
          <button
            key={key}
            className="quiz-answer-btn"
            disabled={isAnswered}
            onClick={() => {
              setSelected(value);
              wsRef.current?.send(
                JSON.stringify({
                  type: "quiz_answer",
                  answer: value,
                }),
              );
            }}
          >
            {value}
          </button>
        ))}

        {isAnswered && (
          <>
            <p className={isCorrect ? "quiz-result-ok" : "quiz-result-bad"}>
              {isCorrect
                ? "Resposta certa!"
                : `Resposta errada. Era ${quiz.resposta_certa}.`}
            </p>

            <button className="cta-btn arrived-btn" onClick={handleContinue}>
              Continuar exploração
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default QuizScreen;
