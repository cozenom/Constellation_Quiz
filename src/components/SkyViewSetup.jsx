import React, { useState, useEffect, useMemo } from 'react';

function SkyViewSetup({ onStart, onBack, constellationData, initialConfig }) {
    const [config, setConfig] = useState({
        mode: 'single',
        hemisphere: 'both',
        difficulty: 'all',
        showLines: true,
        showBoundaries: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
        showEnglishNames: true,
        customSelection: false,
        selectedConstellations: [],
    });

    // Restore saved config if provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(initialConfig);
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

    // Get all constellations sorted alphabetically
    const allConstellations = useMemo(() => {
        if (!constellationData) return [];
        return Object.entries(constellationData).sort((a, b) => a[1].name.localeCompare(b[1].name));
    }, [constellationData]);

    // Get filtered constellations (by hemisphere/difficulty) - used for auto-selection
    const filteredConstellations = useMemo(() => {
        if (!constellationData) return [];
        return Object.entries(constellationData).filter(([abbrev, data]) => {
            const matchesHemisphere = config.hemisphere === 'both' || data.hemisphere === config.hemisphere || data.hemisphere === 'both';
            const matchesDifficulty = config.difficulty === 'all' || data.difficulty === config.difficulty;
            return matchesHemisphere && matchesDifficulty;
        });
    }, [constellationData, config.hemisphere, config.difficulty]);

    // Calculate final count (custom selection or all filtered)
    const filteredCount = useMemo(() => {
        if (config.customSelection) {
            return config.selectedConstellations.length;
        }
        return filteredConstellations.length;
    }, [config.customSelection, config.selectedConstellations.length, filteredConstellations.length]);

    // When filters change, auto-select constellations that match filters
    useEffect(() => {
        if (config.customSelection) {
            const autoSelected = filteredConstellations.map(([abbrev]) => abbrev);
            setConfig(prev => ({ ...prev, selectedConstellations: autoSelected }));
        }
    }, [config.hemisphere, config.difficulty]);

    // When custom selection is first enabled, auto-select based on current filters
    useEffect(() => {
        if (config.customSelection && config.selectedConstellations.length === 0) {
            const autoSelected = filteredConstellations.map(([abbrev]) => abbrev);
            setConfig(prev => ({ ...prev, selectedConstellations: autoSelected }));
        }
    }, [config.customSelection]);

    // Toggle individual constellation
    const handleToggleConstellation = (abbrev, checked) => {
        setConfig(prev => ({
            ...prev,
            selectedConstellations: checked
                ? [...prev.selectedConstellations, abbrev]
                : prev.selectedConstellations.filter(a => a !== abbrev)
        }));
    };

    // Select/Deselect all
    const handleSelectAll = () => {
        setConfig(prev => ({
            ...prev,
            selectedConstellations: allConstellations.map(([abbrev]) => abbrev)
        }));
    };

    const handleDeselectAll = () => {
        setConfig(prev => ({ ...prev, selectedConstellations: [] }));
    };

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
                {/* Section: Quiz Settings */}
                <div className="section-header full-width">Quiz Settings</div>

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

                {/* Custom Constellation Selection */}
                <div className="checkbox-group full-width">
                    <input
                        type="checkbox"
                        id="customSelection"
                        checked={config.customSelection}
                        onChange={(e) => setConfig({ ...config, customSelection: e.target.checked, selectedConstellations: [] })}
                    />
                    <label htmlFor="customSelection">Custom constellation selection</label>
                </div>

                {config.customSelection && (
                    <div className="full-width" style={{marginTop: '0.5rem'}}>
                        <div style={{display: 'flex', gap: '0.5rem', marginBottom: '0.5rem'}}>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={handleSelectAll}
                                style={{flex: 1, padding: '0.5rem'}}
                            >
                                Select All
                            </button>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={handleDeselectAll}
                                style={{flex: 1, padding: '0.5rem'}}
                            >
                                Deselect All
                            </button>
                        </div>
                        <div style={{
                            maxHeight: '300px',
                            overflowY: 'auto',
                            border: '1px solid #475569',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            backgroundColor: '#1e293b'
                        }}>
                            {allConstellations.map(([abbrev, data]) => (
                                <div key={abbrev} className="checkbox-group" style={{marginBottom: '0.25rem'}}>
                                    <input
                                        type="checkbox"
                                        id={`const-${abbrev}`}
                                        checked={config.selectedConstellations.includes(abbrev)}
                                        onChange={(e) => handleToggleConstellation(abbrev, e.target.checked)}
                                    />
                                    <label htmlFor={`const-${abbrev}`}>
                                        {config.showEnglishNames && data.name_english
                                            ? `${data.name} (${data.name_english})`
                                            : data.name
                                        }
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Section: Visual Aids */}
                <div className="section-header full-width">Visual Aids</div>

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

                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={config.showBoundaries}
                            onChange={(e) => setConfig({...config, showBoundaries: e.target.checked})}
                        />
                        Show constellation boundaries
                    </label>
                </div>

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

                {/* Section: Star Visibility */}
                <div className="section-header full-width">Star Visibility</div>

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

                {config.showBackgroundStars && (
                    <>
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
                    </>
                )}
                </div>

                <div className="filter-count">
                    {config.customSelection
                        ? `${filteredCount} constellation${filteredCount !== 1 ? 's' : ''} selected`
                        : `${filteredCount} constellation${filteredCount !== 1 ? 's' : ''} match your filters`
                    }
                </div>

                <button className="button-primary" onClick={handleStart} disabled={filteredCount === 0}>
                    Start Sky View
                </button>
            </div>
        </div>
    );
}

export default SkyViewSetup;
