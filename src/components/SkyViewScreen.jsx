import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SkyViewCanvas from './SkyViewCanvas';
import { shuffleArray } from '../utils/quizHelpers';

function SkyViewScreen({ constellationData, starCatalogData, config, onBack }) {
    const [targetAbbrev, setTargetAbbrev] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [feedback, setFeedback] = useState(null);
    const [questionQueue, setQuestionQueue] = useState([]);  // For single mode
    const [recentlyAsked, setRecentlyAsked] = useState([]);  // For endless mode
    const [isComplete, setIsComplete] = useState(false);     // For single mode completion

    // Helper to format constellation names
    const formatConstellationName = (constellation) => {
        if (config.showEnglishNames && constellation.name_english) {
            return `${constellation.name} (${constellation.name_english})`;
        }
        return constellation.name;
    };

    // Filter constellations by hemisphere and difficulty
    const filteredConstellations = useMemo(() => {
        if (!constellationData) return [];

        const allAbbrevs = Object.keys(constellationData);

        // Filter by hemisphere
        let filtered = allAbbrevs.filter(abbrev => {
            const constellation = constellationData[abbrev];
            if (config.hemisphere === 'both') return true;
            return constellation.hemisphere.toLowerCase() === config.hemisphere;
        });

        // Filter by difficulty
        if (config.difficulty !== 'all') {
            filtered = filtered.filter(abbrev => {
                const constellation = constellationData[abbrev];
                return constellation.difficulty === config.difficulty;
            });
        }

        return filtered;
    }, [constellationData, config.hemisphere, config.difficulty]);

    // Pick a new target based on mode
    const pickNewTarget = useCallback((isInitial = false) => {
        if (filteredConstellations.length === 0) {
            setTargetAbbrev(null);
            return;
        }

        if (config.mode === 'endless') {
            // Endless: Random pick, exclude last 3 to reduce immediate repeats
            setRecentlyAsked(prev => {
                let candidates = filteredConstellations.filter(a => !prev.includes(a));
                if (candidates.length === 0) candidates = filteredConstellations;
                const next = candidates[Math.floor(Math.random() * candidates.length)];
                setTargetAbbrev(next);
                return [...prev.slice(-2), next];  // Keep last 3 (including new one)
            });
        } else {
            // Single: Go through shuffled queue once
            if (isInitial) {
                // Initialize queue on first load
                const shuffled = shuffleArray([...filteredConstellations]);
                setQuestionQueue(shuffled);
                setTargetAbbrev(shuffled[0]);
            } else {
                // Pop from queue
                setQuestionQueue(prev => {
                    const remaining = prev.slice(1);
                    if (remaining.length === 0) {
                        setIsComplete(true);
                        setTargetAbbrev(null);
                    } else {
                        setTargetAbbrev(remaining[0]);
                    }
                    return remaining;
                });
            }
        }
        setFeedback(null);
    }, [filteredConstellations, config.mode]);

    // Initialize on first load
    useEffect(() => {
        pickNewTarget(true);  // isInitial = true
    }, []);  // Only run once on mount

    // Handle tap on constellation
    const handleTap = (tappedAbbrev, x, y) => {
        if (feedback) return; // Already answered

        const isCorrect = tappedAbbrev === targetAbbrev;
        const targetName = formatConstellationName(constellationData[targetAbbrev]);

        // Determine what was tapped
        const tappedName = tappedAbbrev
            ? formatConstellationName(constellationData[tappedAbbrev])
            : 'empty space';

        setScore(prev => ({
            correct: prev.correct + (isCorrect ? 1 : 0),
            total: prev.total + 1
        }));

        const message = isCorrect
            ? `Correct! That's ${targetName}`
            : `Incorrect. You tapped ${tappedName}. ${targetName} is highlighted.`;

        setFeedback({
            correct: isCorrect,
            tappedAbbrev: tappedAbbrev,
            message
        });
    };

    const handleNext = () => {
        pickNewTarget(false);  // Not initial
    };

    if (!constellationData) {
        return <div className="loading">Loading constellation data...</div>;
    }

    // Handle empty filter results
    if (filteredConstellations.length === 0) {
        return (
            <div className="sky-view-screen">
                <button className="back-button" onClick={onBack}>
                    ← Back
                </button>
                <div className="card">
                    <div className="no-results">
                        <p>No constellations match your filters.</p>
                        <p>Try adjusting your hemisphere or difficulty settings.</p>
                        <button className="button-primary" onClick={onBack}>
                            Back to Setup
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Handle single mode completion
    if (isComplete) {
        const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
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
                        <div className="results-actions">
                            <button className="button-primary" onClick={() => {
                                setScore({ correct: 0, total: 0 });
                                setIsComplete(false);
                                setFeedback(null);
                                pickNewTarget(true);
                            }}>
                                Play Again
                            </button>
                            <button className="button-secondary" onClick={onBack}>
                                Back to Setup
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const targetData = targetAbbrev ? constellationData[targetAbbrev] : null;
    const targetName = targetData ? formatConstellationName(targetData) : '...';
    const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
    const totalQuestions = filteredConstellations.length;
    const currentQuestion = config.mode === 'single' ? (totalQuestions - questionQueue.length + 1) : null;

    return (
        <div className="sky-view-screen">
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>
            <div className="card">
                <div className="sky-view-header">
                    <div className="sky-view-score">
                        {config.mode === 'single' ? (
                            <>Question {currentQuestion}/{totalQuestions} · {score.correct} correct</>
                        ) : (
                            <>Score: {score.correct}/{score.total} ({percentage}%)</>
                        )}
                    </div>

                    {!feedback ? (
                        <div className="sky-view-prompt">
                            Tap on: <span style={{color: '#60a5fa'}}>{targetName}</span>
                        </div>
                    ) : (
                        <div className="sky-view-feedback">
                            <span className={feedback.correct ? 'correct' : 'incorrect'}>
                                {feedback.correct ? '✓' : '✗'} {feedback.message}
                            </span>
                            <button className="button-primary" onClick={handleNext}>
                                Next →
                            </button>
                        </div>
                    )}
                </div>

                <SkyViewCanvas
                    constellations={constellationData}
                    filteredConstellations={filteredConstellations}
                    highlightedAbbrev={feedback ? targetAbbrev : null}
                    tappedFeedback={feedback ? { abbrev: feedback.tappedAbbrev, correct: feedback.correct } : null}
                    showBoundaries={true}
                    showLines={config.showLines}
                    maxMagnitude={config.maxMagnitude}
                    backgroundStars={starCatalogData || []}
                    backgroundStarOpacity={config.showBackgroundStars ? config.backgroundStarOpacity : 0}
                    hemisphereFilter={config.hemisphere}
                    onClick={handleTap}
                />
            </div>
        </div>
    );
}

export default SkyViewScreen;
