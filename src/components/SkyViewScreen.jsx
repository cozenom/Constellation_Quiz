import React, { useState, useEffect } from 'react';
import SkyViewCanvas from './SkyViewCanvas';

function SkyViewScreen({ constellationData, onBack }) {
    const [targetAbbrev, setTargetAbbrev] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [feedback, setFeedback] = useState(null);

    // Pick a random constellation
    const pickNewTarget = () => {
        if (!constellationData) return;

        const allAbbrevs = Object.keys(constellationData);
        // Pick random one, different from current if possible
        let candidates = allAbbrevs.filter(a => a !== targetAbbrev);
        if (candidates.length === 0) candidates = allAbbrevs;

        const newTarget = candidates[Math.floor(Math.random() * candidates.length)];
        setTargetAbbrev(newTarget);
        setFeedback(null);
    };

    // Initialize on first load
    useEffect(() => {
        pickNewTarget();
    }, [constellationData]);

    // Get total constellation count (all are visible in dual-hemisphere view)
    const getTotalConstellations = () => {
        if (!constellationData) return 0;
        return Object.keys(constellationData).length;
    };

    // Handle tap on constellation
    const handleTap = (tappedAbbrev, x, y) => {
        if (feedback) return; // Already answered

        const isCorrect = tappedAbbrev === targetAbbrev;
        const tappedName = tappedAbbrev ? constellationData[tappedAbbrev]?.name : 'empty space';
        const targetName = constellationData[targetAbbrev]?.name;

        setScore(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            total: prev.total + 1
        }));

        setFeedback({
            correct: isCorrect,
            message: isCorrect
                ? `Correct! That's ${targetName}`
                : `Incorrect. You tapped ${tappedName}. ${targetName} is highlighted.`
        });
    };

    const handleNext = () => {
        pickNewTarget();
    };

    if (!constellationData) {
        return <div className="loading">Loading constellation data...</div>;
    }

    const targetData = targetAbbrev ? constellationData[targetAbbrev] : null;
    const targetName = targetData?.name || '...';
    const targetHemisphere = targetData?.dec_center >= 0 ? 'Northern' : 'Southern';
    const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    return (
        <div className="sky-view-screen">
            <div className="quiz-header">
                <button className="back-button" onClick={onBack}>
                    ← Back to Menu
                </button>
                <div className="score">
                    Score: {score.correct}/{score.total} ({percentage}%)
                </div>
            </div>

            <div className="card">
                <h2 style={{textAlign: 'center', marginBottom: '0.5rem'}}>
                    Tap on: <span style={{color: '#60a5fa'}}>{targetName}</span>
                </h2>
                <div style={{textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem', color: '#64748b'}}>
                    ({targetHemisphere} Hemisphere)
                </div>

                <SkyViewCanvas
                    constellations={constellationData}
                    highlightedAbbrev={feedback ? targetAbbrev : null}
                    showBoundaries={true}
                    showLines={true}
                    maxMagnitude={5}
                    onClick={handleTap}
                />

                {feedback && (
                    <div className={`feedback ${feedback.correct ? 'correct' : 'incorrect'}`}>
                        {feedback.message}
                    </div>
                )}

                {feedback && (
                    <button
                        className="button-primary"
                        onClick={handleNext}
                        style={{marginTop: '1rem'}}
                    >
                        Next Constellation →
                    </button>
                )}

                <div style={{marginTop: '1rem', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center'}}>
                    Total constellations: {getTotalConstellations()}
                </div>
            </div>
        </div>
    );
}

export default SkyViewScreen;
