import React, { useState, useMemo, useRef, useEffect } from 'react';

const LOCATION_STORAGE_KEY = 'visibility-location';

function toLocalDateTimeInputValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Short zone abbreviation (e.g. "PDT") for the device's current timezone, so the
// date/time input can make clear it's read in local time, not the picked location's.
function getLocalTimeZoneAbbrev(date) {
    try {
        return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
            .formatToParts(date)
            .find((p) => p.type === 'timeZoneName').value;
    } catch {
        return '';
    }
}

// Shared "visibility at time X, location Y" filter controls, used by both
// QuizSetup and SkyViewSetup. `config`/`onChange` follow the same shape as
// the parent's own useState config (onChange accepts a functional updater).
function VisibilityFilterControls({ config, onChange, cityData, loadCityData }) {
    const [citySearch, setCitySearch] = useState(config.visibilityCityLabel || '');
    const [showCityResults, setShowCityResults] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [geoLoading, setGeoLoading] = useState(false);
    const [geoError, setGeoError] = useState(null);
    const restoredLocation = useRef(false);

    // The parent (QuizSetup/SkyViewSetup) restores initialConfig via its own
    // effect a render *after* mount - a lazy useState init here would only see
    // the pre-restore default. Syncing on every change instead of just at mount
    // catches that late-arriving restore too.
    useEffect(() => {
        setCitySearch(config.visibilityCityLabel || '');
    }, [config.visibilityCityLabel]);

    const update = (fields) => onChange((prev) => ({ ...prev, ...fields }));

    // cityLabel is only passed when the change came from picking a city, so the
    // search box keeps showing its name; any other change (manual lat/lon edit,
    // "use my location") clears it since it's no longer describing the location.
    const setLocation = (lat, lon, cityLabel = null) => {
        update({ visibilityLat: lat, visibilityLon: lon, visibilityCityLabel: cityLabel });
        if (lat != null && lon != null) {
            localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ lat, lon, cityLabel }));
        }
        setCitySearch(cityLabel ?? '');
    };

    const handleToggleEnabled = (checked) => {
        const fields = { visibilityEnabled: checked };
        if (checked) {
            if (!config.visibilityDateTime) {
                fields.visibilityDateTime = toLocalDateTimeInputValue(new Date());
            }
            if (!restoredLocation.current && config.visibilityLat == null) {
                restoredLocation.current = true;
                const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
                if (stored) {
                    try {
                        const { lat, lon, cityLabel } = JSON.parse(stored);
                        fields.visibilityLat = lat;
                        fields.visibilityLon = lon;
                        fields.visibilityCityLabel = cityLabel ?? null;
                        setCitySearch(cityLabel ?? '');
                    } catch {
                        // ignore malformed stored value
                    }
                }
            }
        }
        update(fields);
    };

    const handleUseMyLocation = () => {
        if (!navigator.geolocation) {
            setGeoError('Geolocation is not supported by your browser.');
            return;
        }
        setGeoLoading(true);
        setGeoError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation(position.coords.latitude, position.coords.longitude);
                setGeoLoading(false);
            },
            (error) => {
                setGeoError(`Could not get your location: ${error.message}`);
                setGeoLoading(false);
            }
        );
    };

    const handleCitySearchFocus = () => {
        setShowCityResults(true);
        if (!cityData && loadCityData) loadCityData();
    };

    const cityMatches = useMemo(() => {
        if (!cityData || citySearch.trim().length < 2) return [];
        const q = citySearch.trim().toLowerCase();
        return cityData.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 8);
    }, [cityData, citySearch]);

    const handleSelectCity = (city) => {
        setLocation(city.lat, city.lon, `${city.name}, ${city.country}`);
        setShowCityResults(false);
        setHighlightedIndex(-1);
    };

    // Arrow-key/Enter/Escape navigation for the suggestion list. Setup screens
    // have global window-level Escape (back) and Enter (start) shortcuts, so
    // stopPropagation is used here whenever this input handles the key itself -
    // otherwise picking a suggestion with Enter would also fire "Start Quiz".
    const handleSearchKeyDown = (e) => {
        if (!showCityResults || cityMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => (i + 1) % cityMatches.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => (i - 1 + cityMatches.length) % cityMatches.length);
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            e.stopPropagation();
            handleSelectCity(cityMatches[highlightedIndex]);
            e.target.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setShowCityResults(false);
            setHighlightedIndex(-1);
            e.target.blur();
        }
    };

    return (
        <div className="full-width" style={{ marginTop: '0.5rem' }}>
            <div className="checkbox-group custom-selection-toggle">
                <input
                    type="checkbox"
                    id="visibilityEnabled"
                    checked={config.visibilityEnabled}
                    onChange={(e) => handleToggleEnabled(e.target.checked)}
                />
                <label htmlFor="visibilityEnabled">Filter by visibility at a specific time &amp; location</label>
            </div>

            {config.visibilityEnabled && (
                <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                }}>
                    <div className="form-group">
                        <label htmlFor="visibilityDateTime">
                            Date &amp; time ({getLocalTimeZoneAbbrev(config.visibilityDateTime ? new Date(config.visibilityDateTime) : new Date())})
                        </label>
                        <input
                            type="datetime-local"
                            id="visibilityDateTime"
                            value={config.visibilityDateTime}
                            onChange={(e) => update({ visibilityDateTime: e.target.value })}
                        />
                    </div>

                    <div className="form-group full-width">
                        <label>Location</label>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={handleUseMyLocation}
                                disabled={geoLoading}
                                style={{ flex: '0 0 auto' }}
                            >
                                📍 {geoLoading ? 'Locating...' : 'Use my location'}
                            </button>
                            <div style={{ position: 'relative', flex: '1 1 200px' }}>
                                <input
                                    type="text"
                                    placeholder="Search for a city..."
                                    value={citySearch}
                                    onChange={(e) => { setCitySearch(e.target.value); setShowCityResults(true); setHighlightedIndex(-1); }}
                                    onFocus={handleCitySearchFocus}
                                    onKeyDown={handleSearchKeyDown}
                                    onBlur={() => setTimeout(() => setShowCityResults(false), 150)}
                                    role="combobox"
                                    aria-expanded={showCityResults && cityMatches.length > 0}
                                    aria-activedescendant={highlightedIndex >= 0 ? `city-option-${highlightedIndex}` : undefined}
                                    style={{ width: '100%' }}
                                />
                                {showCityResults && cityMatches.length > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        zIndex: 10,
                                        backgroundColor: '#0f172a',
                                        border: '1px solid #475569',
                                        borderRadius: '6px',
                                        maxHeight: '200px',
                                        overflowY: 'auto',
                                    }}>
                                        {cityMatches.map((city, i) => (
                                            <div
                                                key={`${city.name}-${city.country}-${i}`}
                                                id={`city-option-${i}`}
                                                onClick={() => handleSelectCity(city)}
                                                onMouseEnter={() => setHighlightedIndex(i)}
                                                style={{
                                                    padding: '0.4rem 0.6rem',
                                                    cursor: 'pointer',
                                                    backgroundColor: i === highlightedIndex ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                                                }}
                                            >
                                                {city.name}, {city.country}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {geoError && (
                            <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{geoError}</div>
                        )}

                        <div className="setting-row">
                            <div className="form-group">
                                <label htmlFor="visibilityLat">Latitude</label>
                                <input
                                    type="number"
                                    id="visibilityLat"
                                    min="-90"
                                    max="90"
                                    step="0.01"
                                    value={config.visibilityLat ?? ''}
                                    onChange={(e) => setLocation(e.target.value === '' ? null : parseFloat(e.target.value), config.visibilityLon)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="visibilityLon">Longitude</label>
                                <input
                                    type="number"
                                    id="visibilityLon"
                                    min="-180"
                                    max="180"
                                    step="0.01"
                                    value={config.visibilityLon ?? ''}
                                    onChange={(e) => setLocation(config.visibilityLat, e.target.value === '' ? null : parseFloat(e.target.value))}
                                />
                            </div>
                        </div>

                        {config.visibilityLat == null && (
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                Pick a location to apply the visibility filter.
                            </div>
                        )}
                    </div>

                    <div className="form-group full-width">
                        <label htmlFor="visibilityMinAltitude">
                            Minimum altitude above horizon ({config.visibilityMinAltitude}°)
                        </label>
                        <input
                            type="range"
                            id="visibilityMinAltitude"
                            min="0"
                            max="45"
                            step="1"
                            value={config.visibilityMinAltitude}
                            onChange={(e) => update({ visibilityMinAltitude: Number(e.target.value) })}
                            style={{ width: '100%' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default VisibilityFilterControls;
