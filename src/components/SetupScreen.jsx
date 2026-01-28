import React, { useState } from 'react';

function SetupScreen({ onStart, onBack, initialConfig }) {
    const [hemisphere, setHemisphere] = useState(initialConfig?.hemisphere || 'both');
    const [difficulty, setDifficulty] = useState(initialConfig?.difficulty || 'all');
    const [season, setSeason] = useState(initialConfig?.season || 'all');
    const [numQuestions, setNumQuestions] = useState(initialConfig?.numQuestions || 'endless');
    const [inputMode, setInputMode] = useState(initialConfig?.inputMode || 'multiple-choice');
    const [renderMode, setRenderMode] = useState(initialConfig?.renderMode || 'canvas');
    const [showLines, setShowLines] = useState(initialConfig?.showLines ?? true);
    const [randomRotation, setRandomRotation] = useState(initialConfig?.randomRotation || false);
    const [maxMagnitude, setMaxMagnitude] = useState(initialConfig?.maxMagnitude || 6);
    const [showBackgroundStars, setShowBackgroundStars] = useState(initialConfig?.showBackgroundStars ?? true);
    const [backgroundStarOpacity, setBackgroundStarOpacity] = useState(initialConfig?.backgroundStarOpacity || 100);

    const handleStart = () => {
        onStart({
            hemisphere,
            difficulty,
            season,
            numQuestions,
            inputMode,
            renderMode,
            showLines,
            randomRotation,
            maxMagnitude,
            showBackgroundStars,
            backgroundStarOpacity
        });
    };

    return (
        <div>
            <h1>🌟 Constellation Quiz</h1>
            <p className="subtitle">Learn to identify all 88 constellations by their star patterns</p>

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
                            <option value="easy">Easy (20 constellations)</option>
                            <option value="medium">Medium (36 constellations)</option>
                            <option value="hard">Hard (32 constellations)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="season">Season Visibility</label>
                        <select
                            id="season"
                            value={season}
                            onChange={(e) => setSeason(e.target.value)}
                        >
                            <option value="all">All Seasons</option>
                            <option value="winter">Winter</option>
                            <option value="spring">Spring</option>
                            <option value="summer">Summer</option>
                            <option value="autumn">Autumn</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="numQuestions">Number of Questions</label>
                        <select
                            id="numQuestions"
                            value={numQuestions}
                            onChange={(e) => setNumQuestions(e.target.value === 'endless' ? 'endless' : parseInt(e.target.value))}
                        >
                            <option value="10">10 Questions</option>
                            <option value="20">20 Questions</option>
                            <option value="50">50 Questions</option>
                            <option value="endless">All Available</option>
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

                    <div className="form-group">
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
                        <div className="form-group">
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

                <button className="button-primary" onClick={handleStart}>
                    Start Quiz
                </button>

                <button className="button-secondary" onClick={onBack} style={{marginTop: '0.5rem', width: '100%'}}>
                    Back
                </button>
            </div>
        </div>
    );
}

export default SetupScreen;
