import React, { useState, useMemo, useEffect } from 'react';
import {
  mergeStudyData,
  formatSeasons,
  formatHemisphere,
  formatDifficulty,
  getFeaturesSummary,
  getCulturalSummary
} from '../utils/studyDataUtils';
import QuizCanvas from './QuizCanvas';
import './StudyPage.css';

function StudyPage({ onBack, constellationData, constellationInfo }) {
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [filterHemisphere, setFilterHemisphere] = useState('all');
  const [filterSeason, setFilterSeason] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [expandedRow, setExpandedRow] = useState(null);
  const [expandAll, setExpandAll] = useState(false);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack]);

  // Show loading state if data isn't ready
  if (!constellationData || !constellationInfo) {
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
    return mergeStudyData(constellationData, constellationInfo);
  }, [constellationData, constellationInfo]);

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

    if (filterSeason !== 'all') {
      data = data.filter(c => c.seasons.includes(filterSeason));
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
        case 'seasons':
          aVal = a.seasons[0] || '';
          bVal = b.seasons[0] || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return data;
  }, [studyData, sortBy, sortDir, filterHemisphere, filterSeason, filterDifficulty]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const toggleRow = (abbrev) => {
    setExpandedRow(expandedRow === abbrev ? null : abbrev);
  };

  const toggleExpandAll = () => {
    setExpandAll(!expandAll);
    setExpandedRow(null); // Clear individual selection
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return '⇕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="study-page">
      <div className="study-header">
        <button className="back-button" onClick={onBack}>← Back to Menu</button>
        <h1>Constellation Study Guide</h1>
        <p>Reference table for all 88 IAU constellations</p>
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
          <label>Season:</label>
          <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}>
            <option value="all">All</option>
            <option value="winter">Winter</option>
            <option value="spring">Spring</option>
            <option value="summer">Summer</option>
            <option value="fall">Fall</option>
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
              <th onClick={() => handleSort('seasons')} className="sortable">
                Best Seasons {getSortIcon('seasons')}
              </th>
              <th onClick={() => handleSort('difficulty')} className="sortable">
                Difficulty {getSortIcon('difficulty')}
              </th>
              <th>Brightest Stars</th>
              <th className="expand-col"></th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((constellation) => (
              <React.Fragment key={constellation.abbrev}>
                <tr className={expandedRow === constellation.abbrev ? 'expanded' : ''}>
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
                  </td>
                  <td className="abbrev">{constellation.abbrev}</td>
                  <td className="name">{constellation.name}</td>
                  <td className="name-english">{constellation.nameEnglish}</td>
                  <td className="hemisphere">{formatHemisphere(constellation.hemisphere)}</td>
                  <td className="seasons">{formatSeasons(constellation.seasons)}</td>
                  <td className={`difficulty difficulty-${constellation.difficulty}`}>
                    {formatDifficulty(constellation.difficulty)}
                  </td>
                  <td className="stars">
                    {constellation.namedStars.length > 0
                      ? constellation.namedStars.slice(0, 5).map((star, i) => (
                          <div key={i}>
                            {star.name} {star.magnitude?.toFixed(1)}
                          </div>
                        ))
                      : '—'}
                  </td>
                  <td className="expand-col">
                    <button
                      className="expand-btn"
                      onClick={() => toggleRow(constellation.abbrev)}
                      aria-label="Expand details"
                    >
                      {(expandAll || expandedRow === constellation.abbrev) ? '▼' : '▶'}
                    </button>
                  </td>
                </tr>

                {(expandAll || expandedRow === constellation.abbrev) && (
                  <tr className="details-row">
                    <td colSpan="9">
                      <div className="details-content">
                        <div className="details-text">
                            {constellation.intro && (
                              <div className="detail-section">
                                <h4>Description</h4>
                                <p>{constellation.intro}</p>
                              </div>
                            )}

                            {constellation.mythology && (
                              <div className="detail-section">
                                <h4>Mythology</h4>
                                <p>{constellation.mythology}</p>
                              </div>
                            )}

                            {constellation.history && (
                              <div className="detail-section">
                                <h4>History</h4>
                                <p>{constellation.history}</p>
                              </div>
                            )}

                            {getFeaturesSummary(constellation.features) && (
                              <div className="detail-section">
                                <h4>Notable Features</h4>
                                <p>{getFeaturesSummary(constellation.features)}</p>
                              </div>
                            )}

                            {getCulturalSummary(constellation.cultural) && (
                              <div className="detail-section">
                                <h4>Cultural Significance</h4>
                                <p>{getCulturalSummary(constellation.cultural)}</p>
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
