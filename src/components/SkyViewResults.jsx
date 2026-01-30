import React from 'react';

function SkyViewResults({ score, missedAnswers, onPlayAgain, onBack }) {
    const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    let performanceMessage = '';
    if (percentage === 100) performanceMessage = 'Perfect Score! 🎉';
    else if (percentage >= 90) performanceMessage = 'Excellent! 🌟';
    else if (percentage >= 75) performanceMessage = 'Great Job! ⭐';
    else if (percentage >= 60) performanceMessage = 'Good Effort! 👍';
    else performanceMessage = 'Keep Practicing! 📚';

    return (
        <div className="sky-view-screen">
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>
            <div className="card">
                <div className="results-screen">
                    <h2>Quiz Complete!</h2>
                    <div className="final-score">
                        <span className="score-number">{score.correct}</span>
                        <span className="score-divider">/</span>
                        <span className="score-total">{score.total}</span>
                    </div>
                    <div className="score-percentage">{percentage}%</div>
                    <p style={{marginTop: '1rem', fontSize: '1.25rem'}}>{performanceMessage}</p>

                    {missedAnswers.length > 0 && (
                        <div style={{marginTop: '2rem'}}>
                            <h3>Missed ({missedAnswers.length})</h3>
                            <ul className="missed-list">
                                {missedAnswers.map((m, idx) => (
                                    <li key={idx}>
                                        <strong>{m.target}</strong> — You tapped: {m.tapped}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="results-actions">
                        <button className="button-primary" onClick={onPlayAgain}>
                            Try Again (Same Settings)
                        </button>
                        <button className="button-secondary" onClick={onBack}>
                            New Quiz (Different Settings)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SkyViewResults;
