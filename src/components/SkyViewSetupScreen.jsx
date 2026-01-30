import React, { useState, useEffect, useMemo } from 'react';

function SkyViewSetupScreen({ onStart, onBack, constellationData, initialConfig }) {
    const [config, setConfig] = useState({
        mode: 'single',
        hemisphere: 'both',
        difficulty: 'all',
        showLines: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
        showEnglishNames: true,
    });

    // Restore saved config if provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(initialConfig);
        }
    }, [initialConfig]);

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
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>

            <div className="card">
                <h2>Sky View Mode Setup</h2>

                <div className="setup-grid">
                {/* Hemisphere Filter */}
                <div className="form-group">
                    <label>Hemisphere</label>
                    <select
                        value={config.hemisphere}
                        onChange={(e) => setConfig({...config, hemisphere: e.target.value})}
                    >
                        <option value="both">Both</option>
                        <option value="north">Northern</option>
                        <option value="south">Southern</option>
                    </select>
                </div>

                {/* Difficulty Filter */}
                <div className="form-group">
                    <label>Difficulty</label>
                    <select
                        value={config.difficulty}
                        onChange={(e) => setConfig({...config, difficulty: e.target.value})}
                    >
                        <option value="all">All Difficulties</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                    </select>
                </div>

                {/* Quiz Mode */}
                <div className="form-group">
                    <label>Mode</label>
                    <select
                        value={config.mode}
                        onChange={(e) => setConfig({...config, mode: e.target.value})}
                    >
                        <option value="single">Single (each once)</option>
                        <option value="endless">Endless</option>
                    </select>
                </div>

                {/* Show Constellation Lines */}
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config.showLines}
                            onChange={(e) => setConfig({...config, showLines: e.target.checked})}
                        />
                        Show constellation lines
                    </label>
                </div>

                {/* Show English Names */}
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config.showEnglishNames}
                            onChange={(e) => setConfig({...config, showEnglishNames: e.target.checked})}
                        />
                        Show English names
                    </label>
                </div>

                {/* Star Brightness Slider */}
                <div className="form-group full-width">
                    <label>Star brightness limit (magnitude {config.maxMagnitude})</label>
                    <input
                        type="range"
                        min="0"
                        max="14"
                        step="0.1"
                        value={config.maxMagnitude}
                        onChange={(e) => setConfig({...config, maxMagnitude: parseFloat(e.target.value)})}
                    />
                </div>

                {/* Background Stars */}
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config.showBackgroundStars}
                            onChange={(e) => setConfig({...config, showBackgroundStars: e.target.checked})}
                        />
                        Show background stars
                    </label>
                </div>

                {/* Background Star Opacity (conditional) */}
                {config.showBackgroundStars && (
                    <div className="form-group full-width">
                        <label>Background star opacity ({config.backgroundStarOpacity}%)</label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={config.backgroundStarOpacity}
                            onChange={(e) => setConfig({...config, backgroundStarOpacity: parseInt(e.target.value)})}
                        />
                    </div>
                )}
                </div>

                <div className="filter-count">
                    {filteredCount} constellation{filteredCount !== 1 ? 's' : ''} match your filters
                </div>

                <button className="button-primary" onClick={handleStart} disabled={filteredCount === 0}>
                    Start Sky View
                </button>
            </div>
        </div>
    );
}

export default SkyViewSetupScreen;
