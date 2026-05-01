import { useState } from "react";

function QuizScreen({ quiz, currentPoi, onContinue, wsRef }) {
  const [selected, setSelected] = useState(null);

  if (!quiz) return null;

  const isAnswered = selected !== null;
  const isCorrect = selected === quiz.opcao_certa;

  return (
    <div className="arrived-screen">
      <div className="arrived-card">
        <div className="arrived-kicker">Quiz · {currentPoi}</div>

        <h1 className="arrived-title">Pergunta</h1>

        <p className="arrived-text">{quiz.pergunta}</p>

        {Object.entries(quiz.opcoes).map(([key, value]) => (
          <button
            key={key}
            className="quiz-answer-btn"
            disabled={isAnswered}
            onClick={() => {
              setSelected(key);
              wsRef.current?.send(
                JSON.stringify({
                  type: "quiz_answer",
                  answer: key,
                }),
              );
            }}
          >
            <strong>{key}.</strong> {value}
          </button>
        ))}

        {isAnswered && (
          <>
            <p className={isCorrect ? "quiz-result-ok" : "quiz-result-bad"}>
              {isCorrect
                ? "Resposta certa!"
                : `Resposta errada. Era ${quiz.opcao_certa}.`}
            </p>

            <button className="cta-btn arrived-btn" onClick={onContinue}>
              Continuar exploração
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default QuizScreen;
