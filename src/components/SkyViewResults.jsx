import React, { useEffect } from 'react';

function SkyViewResults({ score, missedAnswers, onPlayAgain, onBack }) {
    const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    let performanceMessage = '';
    if (percentage === 100) performanceMessage = 'Perfect Score! 🎉';
    else if (percentage >= 90) performanceMessage = 'Excellent! 🌟';
    else if (percentage >= 75) performanceMessage = 'Great Job! ⭐';
    else if (percentage >= 60) performanceMessage = 'Good Effort! 👍';
    else performanceMessage = 'Keep Practicing! 📚';

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Escape → Go back to setup
            if (e.code === 'Escape') {
                onBack();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onBack]);

    return (
        <div>
            <h1>Quiz Complete!</h1>

            <button className="back-button" onClick={onBack}>
                ← Back
            </button>

            <div className="card">
                <div className="results-summary">
                    <div className="score-big">{score.correct}/{score.total}</div>
                    <div className="percentage">{percentage}% Correct</div>
                    <p style={{marginTop: '1rem', fontSize: '1.25rem'}}>{performanceMessage}</p>
                </div>

                {missedAnswers.length > 0 && (
                    <div style={{marginTop: '2rem'}}>
                        <h2>Missed ({missedAnswers.length})</h2>
                        <ul className="missed-list">
                            {missedAnswers.map((m, idx) => (
                                <li key={idx}>
                                    <strong>{m.target}</strong> — You tapped: {m.tapped}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="button-group">
                    <button className="button-primary" onClick={onPlayAgain}>
                        Try Again (Same Settings)
                    </button>
                    <button className="button-secondary" onClick={onBack}>
                        New Quiz (Different Settings)
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SkyViewResults;
