import React, { useState, useEffect } from 'react';

function SkyViewSetupScreen({ onStart, onBack, initialConfig }) {
    const [config, setConfig] = useState({
        hemisphere: 'both',
        difficulty: 'all',
        season: 'all',
        showLines: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
    });

    // Restore saved config if provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(initialConfig);
        }
    }, [initialConfig]);

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
                        <option value="all">All (88 constellations)</option>
                        <option value="easy">Easy (20 constellations)</option>
                        <option value="medium">Medium (36 constellations)</option>
                        <option value="hard">Hard (32 constellations)</option>
                    </select>
                </div>

                {/* Season Filter */}
                <div className="form-group">
                    <label>Season</label>
                    <select
                        value={config.season}
                        onChange={(e) => setConfig({...config, season: e.target.value})}
                    >
                        <option value="all">All Seasons</option>
                        <option value="winter">Winter</option>
                        <option value="spring">Spring</option>
                        <option value="summer">Summer</option>
                        <option value="autumn">Autumn</option>
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

                <button className="button-primary" onClick={handleStart}>
                    Start Sky View
                </button>
            </div>
        </div>
    );
}

export default SkyViewSetupScreen;
