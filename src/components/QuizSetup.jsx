import React, { useState, useMemo, useEffect } from 'react';

function QuizSetup({ onStart, onBack, constellationData, initialConfig }) {
    const [config, setConfig] = useState({
        hemisphere: 'both',
        difficulty: 'all',
        mode: 'single',
        inputMode: 'multiple-choice',
        renderMode: 'canvas',
        showLines: true,
        randomRotation: false,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
        showEnglishNames: true,
    });

    // Restore from initialConfig when provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(prev => ({ ...prev, ...initialConfig }));
        }
    }, [initialConfig]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onBack]);

    // Calculate filtered constellation count
    const filteredCount = useMemo(() => {
        if (!constellationData) return 0;
        return Object.entries(constellationData).filter(([abbrev, data]) => {
            const matchesHemisphere = config.hemisphere === 'both' || data.hemisphere === config.hemisphere || data.hemisphere === 'both';
            const matchesDifficulty = config.difficulty === 'all' || data.difficulty === config.difficulty;
            return matchesHemisphere && matchesDifficulty;
        }).length;
    }, [constellationData, config.hemisphere, config.difficulty]);

    const handleStart = () => {
        onStart(config);
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
                    {/* Section: Quiz Settings */}
                    <div className="section-header full-width">Quiz Settings</div>

                    <div className="form-group">
                        <label htmlFor="mode">Mode</label>
                        <select
                            id="mode"
                            value={config.mode}
                            onChange={(e) => setConfig({ ...config, mode: e.target.value })}
                        >
                            <option value="single">Single (each once)</option>
                            <option value="endless">Endless</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="inputMode">Input Mode</label>
                        <select
                            id="inputMode"
                            value={config.inputMode}
                            onChange={(e) => setConfig({ ...config, inputMode: e.target.value })}
                        >
                            <option value="multiple-choice">Multiple Choice (4 options)</option>
                            <option value="text">Text Input</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="hemisphere">Hemisphere</label>
                        <select
                            id="hemisphere"
                            value={config.hemisphere}
                            onChange={(e) => setConfig({ ...config, hemisphere: e.target.value })}
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
                            value={config.difficulty}
                            onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
                        >
                            <option value="all">All Difficulties</option>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </div>

                    {/* Section: Visual Aids */}
                    <div className="section-header full-width">Visual Aids</div>

                    <div className="form-group">
                        <label htmlFor="renderMode">Rendering Mode</label>
                        <select
                            id="renderMode"
                            value={config.renderMode}
                            onChange={(e) => setConfig({ ...config, renderMode: e.target.value })}
                        >
                            <option value="canvas">Canvas (Graphical)</option>
                            <option value="ascii">ASCII Art</option>
                        </select>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="showLines"
                            checked={config.showLines}
                            onChange={(e) => setConfig({ ...config, showLines: e.target.checked })}
                        />
                        <label htmlFor="showLines">Show constellation lines</label>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="randomRotation"
                            checked={config.randomRotation}
                            onChange={(e) => setConfig({ ...config, randomRotation: e.target.checked })}
                        />
                        <label htmlFor="randomRotation">Random rotation (harder!)</label>
                    </div>

                    <div className="checkbox-group">
                        <input
                            type="checkbox"
                            id="showEnglishNames"
                            checked={config.showEnglishNames}
                            onChange={(e) => setConfig({ ...config, showEnglishNames: e.target.checked })}
                        />
                        <label htmlFor="showEnglishNames">Show English names</label>
                    </div>

                    {/* Section: Star Visibility */}
                    <div className="section-header full-width">Star Visibility</div>

                    <div className="form-group full-width">
                        <label htmlFor="maxMagnitude">
                            Star Brightness Filter (Mag ≤ {config.maxMagnitude.toFixed(1)})
                        </label>
                        <input
                            type="range"
                            id="maxMagnitude"
                            list="magnitude-presets"
                            min="0"
                            max="14"
                            step="0.5"
                            value={config.maxMagnitude}
                            onChange={(e) => setConfig({ ...config, maxMagnitude: parseFloat(e.target.value) })}
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
                                checked={config.showBackgroundStars}
                                onChange={(e) => setConfig({ ...config, showBackgroundStars: e.target.checked })}
                            />
                            {' '}Show background stars
                        </label>
                    </div>

                    {config.showBackgroundStars && config.renderMode === 'canvas' && (
                        <div className="form-group full-width">
                            <label htmlFor="backgroundStarOpacity">
                                Background star opacity: {config.backgroundStarOpacity}%
                            </label>
                            <input
                                type="range"
                                id="backgroundStarOpacity"
                                min="0"
                                max="100"
                                step="5"
                                value={config.backgroundStarOpacity}
                                onChange={(e) => setConfig({ ...config, backgroundStarOpacity: Number(e.target.value) })}
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

export default QuizSetup;
