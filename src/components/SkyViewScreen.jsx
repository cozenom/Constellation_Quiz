import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SkyViewCanvas from './SkyViewCanvas';

function SkyViewScreen({ constellationData, starCatalogData, config, onBack }) {
    const [targetAbbrev, setTargetAbbrev] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [feedback, setFeedback] = useState(null);

    // Filter constellations by hemisphere, difficulty, season
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

        // Filter by season
        if (config.season !== 'all') {
            filtered = filtered.filter(abbrev => {
                const constellation = constellationData[abbrev];
                return constellation.season && constellation.season.toLowerCase().includes(config.season);
            });
        }

        return filtered;
    }, [constellationData, config.hemisphere, config.difficulty, config.season]);

    // Pick a random constellation
    const pickNewTarget = useCallback(() => {
        if (filteredConstellations.length === 0) {
            setTargetAbbrev(null);
            return;
        }

        // Pick random one, different from current if possible
        // Use functional update to avoid dependency on targetAbbrev
        setTargetAbbrev(prev => {
            let candidates = filteredConstellations.filter(a => a !== prev);
            if (candidates.length === 0) candidates = filteredConstellations;
            return candidates[Math.floor(Math.random() * candidates.length)];
        });
        setFeedback(null);
    }, [filteredConstellations]);

    // Initialize on first load
    useEffect(() => {
        pickNewTarget();
    }, [pickNewTarget]);

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

    // Handle empty filter results
    if (filteredConstellations.length === 0) {
        return (
            <div className="sky-view-screen">
                <div className="quiz-header">
                    <button className="back-button" onClick={onBack}>
                        ← Back to Menu
                    </button>
                </div>
                <div className="card">
                    <div className="no-results">
                        <p>No constellations match your filters.</p>
                        <p>Try adjusting your hemisphere, difficulty, or season settings.</p>
                        <button className="button-primary" onClick={onBack}>
                            Back to Setup
                        </button>
                    </div>
                </div>
            </div>
        );
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
                    filteredConstellations={filteredConstellations}
                    highlightedAbbrev={feedback ? targetAbbrev : null}
                    showBoundaries={true}
                    showLines={config.showLines}
                    maxMagnitude={config.maxMagnitude}
                    backgroundStars={starCatalogData || []}
                    backgroundStarOpacity={config.showBackgroundStars ? config.backgroundStarOpacity : 0}
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
                    Total constellations: {filteredConstellations.length}
                </div>
            </div>
        </div>
    );
}

export default SkyViewScreen;
