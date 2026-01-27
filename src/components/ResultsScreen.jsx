import React from 'react';

function ResultsScreen({ quizState, onRestart, onNewQuiz }) {
    const total = quizState.questions.length;
    const score = quizState.score;
    const percentage = Math.round((score / total) * 100);
    const missed = quizState.answers.filter(a => !a.correct);

    let performanceMessage = '';
    if (percentage === 100) performanceMessage = 'Perfect Score! 🎉';
    else if (percentage >= 90) performanceMessage = 'Excellent! 🌟';
    else if (percentage >= 75) performanceMessage = 'Great Job! ⭐';
    else if (percentage >= 60) performanceMessage = 'Good Effort! 👍';
    else performanceMessage = 'Keep Practicing! 📚';

    return (
        <div>
            <h1>Quiz Complete!</h1>

            <div className="card">
                <div className="results-summary">
                    <div className="score-big">{score}/{total}</div>
                    <div className="percentage">{percentage}% Correct</div>
                    <p style={{marginTop: '1rem', fontSize: '1.25rem'}}>{performanceMessage}</p>
                </div>

                {missed.length > 0 && (
                    <div style={{marginTop: '2rem'}}>
                        <h2>Missed Constellations ({missed.length})</h2>
                        <ul className="missed-list">
                            {missed.map((answer, idx) => (
                                <li key={idx}>
                                    <strong>{answer.constellation}</strong>
                                    {answer.userAnswer && ` — You answered: ${answer.userAnswer}`}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="button-group">
                    <button className="button-primary" onClick={onRestart}>
                        Try Again (Same Settings)
                    </button>
                    <button className="button-secondary" onClick={onNewQuiz}>
                        New Quiz (Different Settings)
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ResultsScreen;
