import React, { useState, useMemo } from 'react';

function SetupScreen({ onStart, onBack, constellationData, initialConfig }) {
    const [hemisphere, setHemisphere] = useState(initialConfig?.hemisphere || 'both');
    const [difficulty, setDifficulty] = useState(initialConfig?.difficulty || 'all');
    const [mode, setMode] = useState(initialConfig?.mode || 'single');
    const [inputMode, setInputMode] = useState(initialConfig?.inputMode || 'multiple-choice');
    const [renderMode, setRenderMode] = useState(initialConfig?.renderMode || 'canvas');
    const [showLines, setShowLines] = useState(initialConfig?.showLines ?? true);
    const [randomRotation, setRandomRotation] = useState(initialConfig?.randomRotation || false);
    const [maxMagnitude, setMaxMagnitude] = useState(initialConfig?.maxMagnitude || 6);
    const [showBackgroundStars, setShowBackgroundStars] = useState(initialConfig?.showBackgroundStars ?? true);
    const [backgroundStarOpacity, setBackgroundStarOpacity] = useState(initialConfig?.backgroundStarOpacity || 100);
    const [showEnglishNames, setShowEnglishNames] = useState(initialConfig?.showEnglishNames ?? true);

    // Calculate filtered constellation count
    const filteredCount = useMemo(() => {
        if (!constellationData) return 0;
        return Object.entries(constellationData).filter(([abbrev, data]) => {
            const matchesHemisphere = hemisphere === 'both' || data.hemisphere === hemisphere || data.hemisphere === 'both';
            const matchesDifficulty = difficulty === 'all' || data.difficulty === difficulty;
            return matchesHemisphere && matchesDifficulty;
        }).length;
    }, [constellationData, hemisphere, difficulty]);

    const handleStart = () => {
        onStart({
            hemisphere,
            difficulty,
            mode,
            inputMode,
            renderMode,
            showLines,
            randomRotation,
            maxMagnitude,
            showBackgroundStars,
            backgroundStarOpacity,
            showEnglishNames
        });
    };

    return (
        <div>
            <h1>🌟 Constellation Quiz</h1>
            <p className="subtitle">Learn to identify all 88 constellations by their star patterns</p>

            <button className="back-button" onClick={onBack}>
                ← Back
            </button>

            <div className="card">
                <div className="setup-grid">
                    <div className="form-group">
                        <label htmlFor="hemisphere">Hemisphere</label>
                        <select
                            id="hemisphere"
                            value={hemisphere}
                            onChange={(e) => setHemisphere(e.target.value)}
                        >
                            <option value="both">Both Hemispheres</option>
                            <option value="north">Northern Only</option>
                            <option value="south">Southern Only</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="difficulty">Difficulty</label>
                        <select
                            id="difficulty"
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                        >
                            <option value="all">All Difficulties</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="mode">Mode</label>
                        <select
                            id="mode"
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                        >
                            <option value="single">Single (each once)</option>
                            <option value="endless">Endless</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="inputMode">Input Mode</label>
                        <select
                            id="inputMode"
                            value={inputMode}
                            onChange={(e) => setInputMode(e.target.value)}
                        >
                            <option value="multiple-choice">Multiple Choice (4 options)</option>
                            <option value="text">Text Input</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="renderMode">Rendering Mode</label>
                        <select
                            id="renderMode"
                            value={renderMode}
                            onChange={(e) => setRenderMode(e.target.value)}
                        >
                            <option value="canvas">Canvas (Graphical)</option>
                            <option value="ascii">ASCII Art</option>
                        </select>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="showLines"
                            checked={showLines}
                            onChange={(e) => setShowLines(e.target.checked)}
                        />
                        <label htmlFor="showLines">Show constellation lines</label>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="randomRotation"
                            checked={randomRotation}
                            onChange={(e) => setRandomRotation(e.target.checked)}
                        />
                        <label htmlFor="randomRotation">Random rotation (harder!)</label>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="showEnglishNames"
                            checked={showEnglishNames}
                            onChange={(e) => setShowEnglishNames(e.target.checked)}
                        />
                        <label htmlFor="showEnglishNames">Show English names</label>
                    </div>

                    <div className="form-group full-width">
                        <label htmlFor="maxMagnitude">
                            Star Brightness Filter (Mag ≤ {maxMagnitude.toFixed(1)})
                        </label>
                        <input
                            type="range"
                            id="maxMagnitude"
                            list="magnitude-presets"
                            min="0"
                            max="14"
                            step="0.5"
                            value={maxMagnitude}
                            onChange={(e) => setMaxMagnitude(parseFloat(e.target.value))}
                            style={{width: '100%'}}
                        />
                        <datalist id="magnitude-presets">
                            <option value="2.5" label="City"></option>
                            <option value="4.0" label="Suburban"></option>
                            <option value="5.0" label="Rural"></option>
                            <option value="6.0" label="Dark Sky"></option>
                            <option value="10.0" label="Binoculars"></option>
                            <option value="14.0" label="Telescope"></option>
                        </datalist>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem', textAlign: 'center'}}>
                            <span>Bright City<br/>(2.5)</span>
                            <span>Suburban<br/>(4.0)</span>
                            <span>Rural<br/>(5.0)</span>
                            <span>Dark Sky<br/>(6.0)</span>
                            <span>Binoculars<br/>(10.0)</span>
                            <span>Telescope<br/>(14.0)</span>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>
                            <input
                                type="checkbox"
                                id="showBackgroundStars"
                                checked={showBackgroundStars}
                                onChange={(e) => setShowBackgroundStars(e.target.checked)}
                            />
                            {' '}Show Background Stars
                        </label>
                    </div>

                    {showBackgroundStars && renderMode === 'canvas' && (
                        <div className="form-group full-width">
                            <label htmlFor="backgroundStarOpacity">
                                Background Star Opacity: {backgroundStarOpacity}%
                            </label>
                            <input
                                type="range"
                                id="backgroundStarOpacity"
                                min="0"
                                max="100"
                                step="5"
                                value={backgroundStarOpacity}
                                onChange={(e) => setBackgroundStarOpacity(Number(e.target.value))}
                            />
                        </div>
                    )}
                </div>

                <div className="filter-count">
                    {filteredCount} constellation{filteredCount !== 1 ? 's' : ''} match your filters
                </div>

                <button className="button-primary" onClick={handleStart} disabled={filteredCount === 0}>
                    Start Quiz
                </button>
            </div>
        </div>
    );
}

export default SetupScreen;
