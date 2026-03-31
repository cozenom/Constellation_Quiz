import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Footer from './Footer';

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
        selectedConstellations: [],
    });

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [lastDifficulty, setLastDifficulty] = useState('all');

    // Restore saved config if provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(initialConfig);
        }
    }, [initialConfig]);

    // Get all constellations sorted alphabetically
    const allConstellations = useMemo(() => {
        if (!constellationData) return [];
        return Object.entries(constellationData).sort((a, b) => a[1].name.localeCompare(b[1].name));
    }, [constellationData]);

    // Get filtered constellations (by hemisphere/difficulty) - used for auto-selection
    const filteredConstellations = useMemo(() => {
        if (!constellationData) return [];
        // Use lastDifficulty for filtering when in custom mode
        const difficultyFilter = config.difficulty === 'custom' ? lastDifficulty : config.difficulty;
        return Object.entries(constellationData).filter(([abbrev, data]) => {
            const matchesHemisphere = config.hemisphere === 'both' || data.hemisphere === config.hemisphere || data.hemisphere === 'both';
            const matchesDifficulty = difficultyFilter === 'all' || data.difficulty === difficultyFilter;
            return matchesHemisphere && matchesDifficulty;
        });
    }, [constellationData, config.hemisphere, config.difficulty, lastDifficulty]);

    // Calculate final count (custom selection or all filtered)
    const filteredCount = useMemo(() => {
        if (config.difficulty === 'custom') {
            return config.selectedConstellations.length;
        }
        return filteredConstellations.length;
    }, [config.difficulty, config.selectedConstellations.length, filteredConstellations.length]);

    // When switching to custom selection, pre-select constellations based on last difficulty
    // Track if we've already initialized to avoid re-selecting after user deselects
    const [hasInitialized, setHasInitialized] = useState(false);

    useEffect(() => {
        if (config.difficulty === 'custom') {
            if (!hasInitialized) {
                const autoSelected = filteredConstellations.map(([abbrev]) => abbrev);
                setConfig(prev => ({ ...prev, selectedConstellations: autoSelected }));
                setHasInitialized(true);
            }
        } else {
            // Reset initialization flag when leaving custom mode
            setHasInitialized(false);
        }
    }, [config.difficulty, filteredConstellations, hasInitialized]);

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

    const handleStart = useCallback(() => {
        onStart(config);
    }, [onStart, config]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code === 'Escape') {
                onBack();
            }
            // Enter → Start quiz (if valid)
            if (e.code === 'Enter' && filteredCount > 0) {
                handleStart();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onBack, handleStart, filteredCount]);

    return (
        <div>
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>

            <div className="card">

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
                        onChange={(e) => {
                            // Save the previous difficulty before switching to custom
                            if (e.target.value === 'custom' && config.difficulty !== 'custom') {
                                setLastDifficulty(config.difficulty);
                            }
                            setConfig({...config, difficulty: e.target.value});
                        }}
                    >
                        <option value="all">All Difficulties</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="custom">Custom Selection</option>
                    </select>
                </div>

                {/* Custom Constellation Selection */}
                {config.difficulty === 'custom' && (
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

                {/* Advanced Options Toggle */}
                <div className="full-width" style={{marginTop: '1rem'}}>
                    <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{width: '100%', padding: '0.75rem'}}
                    >
                        {showAdvanced ? '▼' : '▶'} Advanced Options
                    </button>
                </div>

                {/* Advanced Options Section */}
                {showAdvanced && (
                    <>
                        {/* Section: Visual Aids */}
                        <div className="section-header full-width" style={{marginTop: '1rem'}}>Visual Aids</div>

                        <div className="checkbox-group">
                            <input
                                type="checkbox"
                                id="showLines"
                                checked={config.showLines}
                                onChange={(e) => setConfig({...config, showLines: e.target.checked})}
                            />
                            <label htmlFor="showLines">Show constellation lines</label>
                        </div>

                        <div className="checkbox-group">
                            <input
                                type="checkbox"
                                id="showBoundaries"
                                checked={config.showBoundaries}
                                onChange={(e) => setConfig({...config, showBoundaries: e.target.checked})}
                            />
                            <label htmlFor="showBoundaries">Show constellation boundaries</label>
                        </div>

                        <div className="checkbox-group">
                            <input
                                type="checkbox"
                                id="showEnglishNames"
                                checked={config.showEnglishNames}
                                onChange={(e) => setConfig({...config, showEnglishNames: e.target.checked})}
                            />
                            <label htmlFor="showEnglishNames">Show English names</label>
                        </div>

                        {/* Section: Star Visibility */}
                        <div className="section-header full-width">Star Visibility</div>

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

                        <div className="checkbox-group">
                            <input
                                type="checkbox"
                                id="showBackgroundStars"
                                checked={config.showBackgroundStars}
                                onChange={(e) => setConfig({...config, showBackgroundStars: e.target.checked})}
                            />
                            <label htmlFor="showBackgroundStars">Show background stars</label>
                        </div>

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
                    </>
                )}
                </div>

                <div className="filter-count">
                    {config.difficulty === 'custom'
                        ? `${filteredCount} constellation${filteredCount !== 1 ? 's' : ''} selected`
                        : `${filteredCount} constellation${filteredCount !== 1 ? 's' : ''} match your filters`
                    }
                </div>

                <button className="button-primary" onClick={handleStart} disabled={filteredCount === 0}>
                    Start Sky View
                </button>
            </div>

            <Footer />
        </div>
    );
}

export default SkyViewSetup;
