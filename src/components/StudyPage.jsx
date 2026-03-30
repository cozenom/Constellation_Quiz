import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  mergeStudyData,
  formatSeasons,
  formatHemisphere,
  formatDifficulty,
  formatArea,
  formatSource
} from '../utils/studyDataUtils';
import QuizCanvas from './QuizCanvas';
import './StudyPage.css';

function StudyPage({ onBack, constellationData, constellationStudy }) {
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filterHemisphere, setFilterHemisphere] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [expandedRow, setExpandedRow] = useState(null);
  const [expandAll, setExpandAll] = useState(false);
  const [activeTab, setActiveTab] = useState({}); // Track active tab per constellation
  const [selectedIndex, setSelectedIndex] = useState(0); // Track selected row index
  const selectedRowRef = useRef(null);

  // Show loading state if data isn't ready
  if (!constellationData || !constellationStudy) {
    return (
      <div className="study-page">
        <div className="study-header">
          <button className="back-button" onClick={onBack}>← Back to Menu</button>
          <h1>Constellation Study Guide</h1>
          <p>Loading constellation data...</p>
        </div>
      </div>
    );
  }

  // Merge data once
  const studyData = useMemo(() => {
    return mergeStudyData(constellationData, constellationStudy);
  }, [constellationData, constellationStudy]);

  // Apply filters and sorting
  const filteredAndSorted = useMemo(() => {
    let data = studyData;

    // Apply filters
    if (filterHemisphere !== 'all') {
      data = data.filter(c => {
        if (filterHemisphere === 'both') return c.hemisphere === 'both';
        return c.hemisphere === filterHemisphere || c.hemisphere === 'both';
      });
    }

    if (filterDifficulty !== 'all') {
      data = data.filter(c => c.difficulty === filterDifficulty);
    }

    // Apply sorting
    data = [...data].sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'abbrev':
          aVal = a.abbrev.toLowerCase();
          bVal = b.abbrev.toLowerCase();
          break;
        case 'hemisphere':
          aVal = a.hemisphere;
          bVal = b.hemisphere;
          break;
        case 'difficulty':
          const diffOrder = { easy: 1, medium: 2, hard: 3 };
          aVal = diffOrder[a.difficulty];
          bVal = diffOrder[b.difficulty];
          break;
        case 'area':
          aVal = a.area?.value || 0;
          bVal = b.area?.value || 0;
          break;
        case 'source':
          // Sort by year (extract numeric year, handle "2nd century" format)
          const extractYear = (source) => {
            if (!source?.year) return 9999; // Put items without year at end
            const yearStr = source.year.toString();
            // Handle "2nd century" -> 200, "17th century" -> 1700, etc.
            if (yearStr.includes('century')) {
              const centuryMatch = yearStr.match(/(\d+)/);
              if (centuryMatch) {
                return parseInt(centuryMatch[1]) * 100;
              }
            }
            // Handle regular year like "1756"
            const yearMatch = yearStr.match(/(\d{3,4})/);
            return yearMatch ? parseInt(yearMatch[1]) : 9999;
          };
          aVal = extractYear(a.source);
          bVal = extractYear(b.source);
          break;
        case 'bordering':
          aVal = a.bordering?.length || 0;
          bVal = b.bordering?.length || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [studyData, sortBy, sortDir, filterHemisphere, filterDifficulty]);

  // Reset selected index when filters change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredAndSorted]);

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't interfere if user is typing in a form element
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      const currentConstellation = filteredAndSorted[selectedIndex];

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(filteredAndSorted.length - 1, prev + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (currentConstellation) {
            toggleRow(currentConstellation.abbrev);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (expandedRow === currentConstellation?.abbrev) {
            navigateTabs(currentConstellation.abbrev, -1);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (expandedRow === currentConstellation?.abbrev) {
            navigateTabs(currentConstellation.abbrev, 1);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredAndSorted, expandedRow, activeTab]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const toggleRow = (abbrev, index) => {
    const isExpanding = expandedRow !== abbrev;
    setExpandedRow(expandedRow === abbrev ? null : abbrev);

    // Update keyboard selection to clicked row if index provided
    if (index !== undefined) {
      setSelectedIndex(index);
    }

    // Set default tab to 'overview' when expanding
    if (isExpanding && !activeTab[abbrev]) {
      setActiveTab(prev => ({ ...prev, [abbrev]: 'overview' }));
    }

    // Scroll to show expanded content after a short delay
    if (isExpanding) {
      setTimeout(() => {
        if (selectedRowRef.current) {
          const detailsRow = selectedRowRef.current.nextElementSibling;
          if (detailsRow) {
            detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      }, 100);
    }
  };

  const handleTabChange = (abbrev, tab) => {
    setActiveTab(prev => ({ ...prev, [abbrev]: tab }));
  };

  const toggleExpandAll = () => {
    setExpandAll(!expandAll);
    setExpandedRow(null); // Clear individual selection
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return '⇕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const navigateTabs = (abbrev, direction) => {
    const constellation = filteredAndSorted.find(c => c.abbrev === abbrev);
    if (!constellation) return;

    // Get available tabs
    const availableTabs = ['overview'];
    if (constellation.mythology && (
      typeof constellation.mythology === 'string' ||
      (typeof constellation.mythology === 'object' && Object.keys(constellation.mythology).length > 0)
    )) {
      availableTabs.push('mythology');
    }
    if (constellation.starsText && (
      typeof constellation.starsText === 'string' ||
      (Array.isArray(constellation.starsText) && constellation.starsText.length > 0)
    )) {
      availableTabs.push('stars');
    }
    if (constellation.deepSkyObjects && (
      typeof constellation.deepSkyObjects === 'string' ||
      (Array.isArray(constellation.deepSkyObjects) && constellation.deepSkyObjects.length > 0)
    )) {
      availableTabs.push('deepsky');
    }
    if (constellation.meteorShowersDetail && (
      typeof constellation.meteorShowersDetail === 'string' ||
      (Array.isArray(constellation.meteorShowersDetail) && constellation.meteorShowersDetail.length > 0)
    )) {
      availableTabs.push('meteors');
    }

    // Get current tab index
    const currentTab = activeTab[abbrev] || 'overview';
    const currentIndex = availableTabs.indexOf(currentTab);

    // Calculate new index with wrapping
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = availableTabs.length - 1;
    if (newIndex >= availableTabs.length) newIndex = 0;

    // Set new tab
    setActiveTab(prev => ({ ...prev, [abbrev]: availableTabs[newIndex] }));
  };

  return (
    <div className="study-page">
      <div className="study-header">
        <button className="back-button" onClick={onBack}>← Back to Menu</button>
        <h1>Constellation Study Guide</h1>
        <p>Reference table for all 88 IAU constellations</p>
        <div className="under-construction-tag">🚧 Under Construction 🚧</div>
      </div>

      <div className="study-filters">
        <div className="filter-group">
          <label>Hemisphere:</label>
          <select value={filterHemisphere} onChange={(e) => setFilterHemisphere(e.target.value)}>
            <option value="all">All</option>
            <option value="north">Northern</option>
            <option value="south">Southern</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Difficulty:</label>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)}>
            <option value="all">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        <button className="expand-all-btn" onClick={toggleExpandAll}>
          {expandAll ? 'Collapse All' : 'Expand All'}
        </button>

        <div className="filter-stats">
          Showing {filteredAndSorted.length} of {studyData.length} constellations
        </div>
      </div>

      <div className="study-table-container">
        <table className="study-table">
          <thead>
            <tr>
              <th className="image-col">Image</th>
              <th onClick={() => handleSort('abbrev')} className="sortable">
                Abbrev {getSortIcon('abbrev')}
              </th>
              <th onClick={() => handleSort('name')} className="sortable">
                Name {getSortIcon('name')}
              </th>
              <th>English Name</th>
              <th onClick={() => handleSort('hemisphere')} className="sortable">
                Hemisphere {getSortIcon('hemisphere')}
              </th>
              <th onClick={() => handleSort('difficulty')} className="sortable">
                Difficulty {getSortIcon('difficulty')}
              </th>
              <th onClick={() => handleSort('area')} className="sortable">
                Area (sq°) {getSortIcon('area')}
              </th>
              <th onClick={() => handleSort('bordering')} className="sortable">
                Bordering {getSortIcon('bordering')}
              </th>
              <th onClick={() => handleSort('source')} className="sortable">
                Origin {getSortIcon('source')}
              </th>
              <th>Brightest Stars</th>
              <th className="expand-col"></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((constellation, index) => (
              <React.Fragment key={constellation.abbrev}>
                <tr
                  className={`
                    ${expandedRow === constellation.abbrev ? 'expanded' : ''}
                    ${selectedIndex === index ? 'selected' : ''}
                  `.trim()}
                  ref={selectedIndex === index ? selectedRowRef : null}
                >
                  <td className="image-cell">
                    <QuizCanvas
                      constellation={{
                        stars: constellationData[constellation.abbrev].stars,
                        lines: constellationData[constellation.abbrev].lines
                      }}
                      showLines={true}
                      backgroundStars={[]}
                      rotationAngle={0}
                      starSizeScale="large"
                    />
                    <div className="mobile-constellation-info">
                      <div className="mobile-constellation-name">{constellation.name}</div>
                      <div className="mobile-constellation-subtitle">{constellation.nameEnglish}</div>
                    </div>
                  </td>
                  <td className="abbrev">{constellation.abbrev}</td>
                  <td className="name">{constellation.name}</td>
                  <td className="name-english">{constellation.nameEnglish}</td>
                  <td className="hemisphere">
                    <span className={`table-badge badge-hemisphere badge-${constellation.hemisphere}`}>
                      {formatHemisphere(constellation.hemisphere)}
                    </span>
                  </td>
                  <td className="difficulty">
                    <span className={`table-badge badge-difficulty badge-diff-${constellation.difficulty}`}>
                      {formatDifficulty(constellation.difficulty)}
                    </span>
                  </td>
                  <td className="area">
                    {constellation.area ? (
                      <span className="table-badge badge-area">
                        {constellation.area.value} sq° <span className="area-rank-badge">(#{constellation.area.rank})</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="bordering">
                    {constellation.bordering && constellation.bordering.length > 0
                      ? constellation.bordering.join(', ')
                      : '—'}
                  </td>
                  <td className="source">{formatSource(constellation.source)}</td>
                  <td className="stars">
                    {constellation.namedStars.length > 0
                      ? constellation.namedStars.slice(0, 3).map((star, i) => (
                          <div key={i}>
                            {star.name} ({star.magnitude?.toFixed(1)})
                          </div>
                        ))
                      : '—'}
                  </td>
                  <td className="expand-col">
                    <button
                      className="expand-btn"
                      onClick={() => toggleRow(constellation.abbrev, index)}
                      aria-label="Expand details"
                    >
                      {(expandAll || expandedRow === constellation.abbrev) ? '▼' : '▶'}
                    </button>
                  </td>
                </tr>

                {(expandAll || expandedRow === constellation.abbrev) && (
                  <tr className="details-row">
                    <td colSpan="11">
                      <div className="details-content">
                        {/* Tab Navigation */}
                        <div className="tabs-nav">
                          <button
                            className={`tab-btn ${(activeTab[constellation.abbrev] || 'overview') === 'overview' ? 'active' : ''}`}
                            onClick={() => handleTabChange(constellation.abbrev, 'overview')}
                          >
                            Overview
                          </button>
                          {(constellation.mythology && (
                            typeof constellation.mythology === 'string' ||
                            (typeof constellation.mythology === 'object' && Object.keys(constellation.mythology).length > 0)
                          )) && (
                            <button
                              className={`tab-btn ${activeTab[constellation.abbrev] === 'mythology' ? 'active' : ''}`}
                              onClick={() => handleTabChange(constellation.abbrev, 'mythology')}
                            >
                              Mythology
                            </button>
                          )}
                          {(constellation.starsText && (
                            typeof constellation.starsText === 'string' ||
                            (Array.isArray(constellation.starsText) && constellation.starsText.length > 0)
                          )) && (
                            <button
                              className={`tab-btn ${activeTab[constellation.abbrev] === 'stars' ? 'active' : ''}`}
                              onClick={() => handleTabChange(constellation.abbrev, 'stars')}
                            >
                              Notable Stars
                            </button>
                          )}
                          {(constellation.deepSkyObjects && (
                            typeof constellation.deepSkyObjects === 'string' ||
                            (Array.isArray(constellation.deepSkyObjects) && constellation.deepSkyObjects.length > 0)
                          )) && (
                            <button
                              className={`tab-btn ${activeTab[constellation.abbrev] === 'deepsky' ? 'active' : ''}`}
                              onClick={() => handleTabChange(constellation.abbrev, 'deepsky')}
                            >
                              Deep Sky
                            </button>
                          )}
                          {(constellation.meteorShowersDetail && (
                            typeof constellation.meteorShowersDetail === 'string' ||
                            (Array.isArray(constellation.meteorShowersDetail) && constellation.meteorShowersDetail.length > 0)
                          )) && (
                            <button
                              className={`tab-btn ${activeTab[constellation.abbrev] === 'meteors' ? 'active' : ''}`}
                              onClick={() => handleTabChange(constellation.abbrev, 'meteors')}
                            >
                              Meteor Showers
                            </button>
                          )}
                        </div>

                        {/* Tab Content */}
                        <div className="tab-content">
                          {/* Overview Tab */}
                          {(activeTab[constellation.abbrev] || 'overview') === 'overview' && (
                            <div className="tab-panel">
                              {/* Symbolism - Featured */}
                              {constellation.symbolism && (
                                <div className="symbolism-featured">
                                  <div>
                                    <div className="symbolism-label">Symbolism</div>
                                    <div className="symbolism-text">{constellation.symbolism}</div>
                                  </div>
                                </div>
                              )}

                              {/* Description */}
                              {constellation.description && (
                                <div className="overview-description">
                                  {constellation.description}
                                </div>
                              )}

                              {/* Info Cards Grid */}
                              <div className="info-cards-grid">
                                {constellation.pronunciation && (
                                  <div className="info-card">
                                    <div className="info-card-header">
                                      <span className="info-card-title">Pronunciation</span>
                                    </div>
                                    <div className="info-card-content">{constellation.pronunciation}</div>
                                  </div>
                                )}
                                {constellation.genitive && (
                                  <div className="info-card">
                                    <div className="info-card-header">
                                      <span className="info-card-title">Genitive Form</span>
                                    </div>
                                    <div className="info-card-content">{constellation.genitive}</div>
                                  </div>
                                )}
                                {constellation.brightestStar && (
                                  <div className="info-card">
                                    <div className="info-card-header">
                                      <span className="info-card-title">Brightest Star</span>
                                    </div>
                                    <div className="info-card-content">{constellation.brightestStar}</div>
                                  </div>
                                )}
                                {constellation.messierObjects && (
                                  <div className="info-card">
                                    <div className="info-card-header">
                                      <span className="info-card-title">Messier Objects</span>
                                    </div>
                                    <div className="info-card-content">{constellation.messierObjects}</div>
                                  </div>
                                )}
                                {constellation.meteorShowers && (
                                  <div className="info-card">
                                    <div className="info-card-header">
                                      <span className="info-card-title">Meteor Showers</span>
                                    </div>
                                    <div className="info-card-content">{constellation.meteorShowers}</div>
                                  </div>
                                )}
                              </div>

                              {/* Brightest Stars Section */}
                              {constellation.namedStars.length > 0 && (
                                <div className="stars-section">
                                  <h4 className="section-title">
                                    Brightest Stars
                                  </h4>
                                  <div className="stars-grid">
                                    {constellation.namedStars.slice(0, 10).map((star, i) => (
                                      <div key={i} className="star-card">
                                        <span className="star-number">#{i + 1}</span>
                                        <span className="star-name">{star.name}</span>
                                        <span className="star-magnitude">mag {star.magnitude?.toFixed(1)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Mythology Tab */}
                          {activeTab[constellation.abbrev] === 'mythology' && constellation.mythology && (
                            <div className="tab-panel">
                              <div className="mythology-content">
                                {(typeof constellation.mythology === 'object' &&
                                  !Array.isArray(constellation.mythology) &&
                                  constellation.mythology !== null) ? (
                                  <>
                                    {constellation.mythology.babylonian && Array.isArray(constellation.mythology.babylonian) && constellation.mythology.babylonian.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Babylonian</h4>
                                        {constellation.mythology.babylonian.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.greek && Array.isArray(constellation.mythology.greek) && constellation.mythology.greek.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Greek</h4>
                                        {constellation.mythology.greek.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.roman && Array.isArray(constellation.mythology.roman) && constellation.mythology.roman.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Roman</h4>
                                        {constellation.mythology.roman.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.arab && Array.isArray(constellation.mythology.arab) && constellation.mythology.arab.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Arab</h4>
                                        {constellation.mythology.arab.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.chinese && Array.isArray(constellation.mythology.chinese) && constellation.mythology.chinese.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Chinese</h4>
                                        {constellation.mythology.chinese.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.hindu && Array.isArray(constellation.mythology.hindu) && constellation.mythology.hindu.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Hindu</h4>
                                        {constellation.mythology.hindu.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.polynesian && Array.isArray(constellation.mythology.polynesian) && constellation.mythology.polynesian.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>Polynesian</h4>
                                        {constellation.mythology.polynesian.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                    {constellation.mythology.history && Array.isArray(constellation.mythology.history) && constellation.mythology.history.length > 0 && (
                                      <div className="mythology-section">
                                        <h4>History</h4>
                                        {constellation.mythology.history.map((text, i) => (
                                          <p key={i}>{text}</p>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-content">{constellation.mythology}</div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Notable Stars Tab */}
                          {activeTab[constellation.abbrev] === 'stars' && constellation.starsText && (
                            <div className="tab-panel">
                              <div className="content-section">
                                {Array.isArray(constellation.starsText) ? (
                                  constellation.starsText.map((text, i) => (
                                    <p key={i}>{text}</p>
                                  ))
                                ) : (
                                  <p>{constellation.starsText}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Deep Sky Tab */}
                          {activeTab[constellation.abbrev] === 'deepsky' && constellation.deepSkyObjects && (
                            <div className="tab-panel">
                              <div className="content-section">
                                {Array.isArray(constellation.deepSkyObjects) ? (
                                  constellation.deepSkyObjects.map((text, i) => (
                                    <p key={i}>{text}</p>
                                  ))
                                ) : (
                                  <p>{constellation.deepSkyObjects}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Meteor Showers Tab */}
                          {activeTab[constellation.abbrev] === 'meteors' && constellation.meteorShowersDetail && (
                            <div className="tab-panel">
                              <div className="content-section">
                                {Array.isArray(constellation.meteorShowersDetail) ? (
                                  constellation.meteorShowersDetail.map((text, i) => (
                                    <p key={i}>{text}</p>
                                  ))
                                ) : (
                                  <p>{constellation.meteorShowersDetail}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StudyPage;
