import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Footer from './Footer';
import VisibilityFilterControls from './VisibilityFilterControls';
import { getMatchingAbbrevs } from '../utils/quizHelpers';

function SkyViewSetup({ onStart, onBack, constellationData, initialConfig, cityData, loadCityData, loadSkyViewStars }) {
    const [config, setConfig] = useState({
        mode: 'single',
        hemisphere: ['north', 'south', 'both'],
        difficulty: ['easy', 'medium', 'hard'],
        customSelection: false,
        showLines: true,
        showBoundaries: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
        showEnglishNames: true,
        selectedConstellations: [],
        visibilityEnabled: false,
        visibilityDateTime: '',
        visibilityLat: null,
        visibilityLon: null,
        visibilityCityLabel: null,
        visibilityMinAltitude: 10,
    });

    const [showAdvanced, setShowAdvanced] = useState(false);

    // Restore saved config if provided
    useEffect(() => {
        if (initialConfig) {
            setConfig(initialConfig);
        }
    }, [initialConfig]);

    // Prefetch the (large) star catalog while the user is still configuring,
    // so it's already cached by the time they hit Start Sky View.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (loadSkyViewStars) loadSkyViewStars();
    }, []);

    // Get all constellations sorted alphabetically
    const allConstellations = useMemo(() => {
        if (!constellationData) return [];
        return Object.entries(constellationData).sort((a, b) => a[1].name.localeCompare(b[1].name));
    }, [constellationData]);

    // Get filtered constellations (by hemisphere/difficulty/visibility) - used for auto-selection
    const filteredConstellations = useMemo(() => {
        if (!constellationData) return [];
        const abbrevs = getMatchingAbbrevs(constellationData, config);
        return abbrevs.map((abbrev) => [abbrev, constellationData[abbrev]]);
    }, [constellationData, config.hemisphere, config.difficulty, config.visibilityEnabled, config.visibilityDateTime, config.visibilityLat, config.visibilityLon, config.visibilityMinAltitude]);

    // Calculate final count (custom selection or all filtered)
    const filteredCount = useMemo(() => {
        if (config.customSelection) {
            return config.selectedConstellations.length;
        }
        return filteredConstellations.length;
    }, [config.customSelection, config.selectedConstellations.length, filteredConstellations.length]);

    // While custom selection is on, keep the checked constellations in sync with
    // the hemisphere/difficulty filters live (any change to those re-syncs the list)
    useEffect(() => {
        if (config.customSelection) {
            const autoSelected = filteredConstellations.map(([abbrev]) => abbrev);
            setConfig(prev => ({ ...prev, selectedConstellations: autoSelected }));
        }
    }, [config.customSelection, filteredConstellations]);

    // Toggle individual constellation
    const handleToggleConstellation = (abbrev, checked) => {
        setConfig(prev => ({
            ...prev,
            selectedConstellations: checked
                ? [...prev.selectedConstellations, abbrev]
                : prev.selectedConstellations.filter(a => a !== abbrev)
        }));
    };

    // Toggle a hemisphere in the multiselect
    const handleToggleHemisphere = (value, checked) => {
        setConfig(prev => ({
            ...prev,
            hemisphere: checked
                ? [...prev.hemisphere, value]
                : prev.hemisphere.filter(h => h !== value)
        }));
    };

    // Toggle a difficulty in the multiselect
    const handleToggleDifficulty = (value, checked) => {
        setConfig(prev => ({
            ...prev,
            difficulty: checked
                ? [...prev.difficulty, value]
                : prev.difficulty.filter(d => d !== value)
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

                <div className="setting-row full-width">
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
                </div>

                <div className="setting-row full-width">
                    <div className="form-group">
                        <label>Hemisphere</label>
                        <div className="checkbox-row">
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="hemisphere-north"
                                    checked={config.hemisphere.includes('north')}
                                    onChange={(e) => handleToggleHemisphere('north', e.target.checked)}
                                />
                                <label htmlFor="hemisphere-north">Northern</label>
                            </div>
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="hemisphere-south"
                                    checked={config.hemisphere.includes('south')}
                                    onChange={(e) => handleToggleHemisphere('south', e.target.checked)}
                                />
                                <label htmlFor="hemisphere-south">Southern</label>
                            </div>
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="hemisphere-both"
                                    checked={config.hemisphere.includes('both')}
                                    onChange={(e) => handleToggleHemisphere('both', e.target.checked)}
                                />
                                <label htmlFor="hemisphere-both">Equatorial</label>
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Difficulty</label>
                        <div className="checkbox-row">
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="difficulty-easy"
                                    checked={config.difficulty.includes('easy')}
                                    onChange={(e) => handleToggleDifficulty('easy', e.target.checked)}
                                />
                                <label htmlFor="difficulty-easy">Easy</label>
                            </div>
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="difficulty-medium"
                                    checked={config.difficulty.includes('medium')}
                                    onChange={(e) => handleToggleDifficulty('medium', e.target.checked)}
                                />
                                <label htmlFor="difficulty-medium">Medium</label>
                            </div>
                            <div className="checkbox-group">
                                <input
                                    type="checkbox"
                                    id="difficulty-hard"
                                    checked={config.difficulty.includes('hard')}
                                    onChange={(e) => handleToggleDifficulty('hard', e.target.checked)}
                                />
                                <label htmlFor="difficulty-hard">Hard</label>
                            </div>
                        </div>
                    </div>
                </div>

                <VisibilityFilterControls config={config} onChange={setConfig} cityData={cityData} loadCityData={loadCityData} />

                <div className="checkbox-group full-width custom-selection-toggle">
                    <input
                        type="checkbox"
                        id="customSelection"
                        checked={config.customSelection}
                        onChange={(e) => setConfig({ ...config, customSelection: e.target.checked })}
                    />
                    <label htmlFor="customSelection">Use custom constellation selection</label>
                </div>

                {/* Custom Constellation Selection */}
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
                    {config.customSelection
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
