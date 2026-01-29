import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SkyViewCanvas from './SkyViewCanvas';

function SkyViewScreen({ constellationData, starCatalogData, config, onBack }) {
    const [targetAbbrev, setTargetAbbrev] = useState(null);
    const [score, setScore] = useState({ correct: 0, total: 0 });
    const [feedback, setFeedback] = useState(null);

    // Helper to format constellation names
    const formatConstellationName = (constellation) => {
        if (config.showEnglishNames && constellation.name_english) {
            return `${constellation.name} (${constellation.name_english})`;
        }
        return constellation.name;
    };

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
        const tappedName = tappedAbbrev ? formatConstellationName(constellationData[tappedAbbrev]) : 'empty space';
        const targetName = formatConstellationName(constellationData[targetAbbrev]);

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
                <button className="back-button" onClick={onBack}>
                    ← Back
                </button>
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
    const targetName = targetData ? formatConstellationName(targetData) : '...';
    const targetHemisphere = targetData?.dec_center >= 0 ? 'Northern' : 'Southern';
    const percentage = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    return (
        <div className="sky-view-screen">
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>
            <div className="card">
                <div className="quiz-header" style={{justifyContent: 'space-between', alignItems: 'center'}}>
                    <div className="score">
                        Score: {score.correct}/{score.total} ({percentage}%)
                    </div>
                    <div style={{textAlign: 'center', flex: 1}}>
                        <div style={{fontSize: '1.25rem', fontWeight: '500'}}>
                            Tap on: <span style={{color: '#60a5fa'}}>{targetName}</span>
                        </div>
                        <div style={{fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem'}}>
                            ({targetHemisphere} Hemisphere)
                        </div>
                    </div>
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
                    hemisphereFilter={config.hemisphere}
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
            </div>
        </div>
    );
}

export default SkyViewScreen;
