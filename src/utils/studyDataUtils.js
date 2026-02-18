/**
 * Utility functions for preparing constellation study data
 * Merges constellation_data.json and constellation_info.json
 */

/**
 * Extract named stars from stars array
 * @param {Array} stars - Array of star objects
 * @returns {Array} - Array of star names
 */
export function extractNamedStars(stars) {
  if (!Array.isArray(stars)) return [];

  return stars
    .filter(star => star.name)
    .map(star => star.name)
    .sort();
}

/**
 * Merge constellation data and info for study page
 * @param {Object} constellationData - From constellation_data.json
 * @param {Object} constellationInfo - From constellation_info.json
 * @returns {Array} - Array of merged constellation objects
 */
export function mergeStudyData(constellationData, constellationInfo) {
  const merged = [];

  for (const [abbrev, data] of Object.entries(constellationData)) {
    const info = constellationInfo[abbrev] || {};

    merged.push({
      // From constellation_data.json
      abbrev: data.abbrev,
      name: data.name,
      nameEnglish: data.name_english,
      hemisphere: data.hemisphere,
      seasons: data.seasons || [],
      difficulty: data.difficulty,
      namedStars: extractNamedStars(data.stars),
      starCount: data.stars?.length || 0,

      // From constellation_info.json
      intro: info.intro || null,
      mythology: info.mythology?.summary || null,
      history: info.history?.summary || null,
      features: info.features || null,
      cultural: info.cultural || null,
    });
  }

  return merged;
}

/**
 * Format seasons for display
 * @param {Array} seasons - Array of season strings
 * @returns {string} - Formatted season string
 */
export function formatSeasons(seasons) {
  if (!Array.isArray(seasons) || seasons.length === 0) {
    return 'Year-round';
  }

  // Capitalize first letter
  return seasons.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
}

/**
 * Format hemisphere for display
 * @param {string} hemisphere - 'north', 'south', or 'both'
 * @returns {string} - Formatted hemisphere
 */
export function formatHemisphere(hemisphere) {
  const map = {
    'north': 'Northern',
    'south': 'Southern',
    'both': 'Both'
  };
  return map[hemisphere] || hemisphere;
}

/**
 * Format difficulty for display
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @returns {string} - Formatted difficulty
 */
export function formatDifficulty(difficulty) {
  return difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : '';
}

/**
 * Get features summary text
 * @param {Object} features - Features object from constellation_info
 * @returns {string|null} - Summary text
 */
export function getFeaturesSummary(features) {
  if (!features) return null;

  if (features.summary) return features.summary;

  // If no summary, combine stars and deep_sky
  const parts = [];
  if (features.stars) {
    const starsText = typeof features.stars === 'string'
      ? features.stars
      : features.stars.stars || '';
    if (starsText) parts.push(starsText);
  }
  if (features.deep_sky) {
    const dsoText = typeof features.deep_sky === 'string'
      ? features.deep_sky
      : features.deep_sky.deep_sky_objects || '';
    if (dsoText) parts.push(dsoText);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * Get cultural info summary
 * @param {Object} cultural - Cultural object from constellation_info
 * @returns {string|null} - Summary text
 */
export function getCulturalSummary(cultural) {
  if (!cultural) return null;

  // Combine all cultural fields
  const parts = [];
  for (const [key, value] of Object.entries(cultural)) {
    if (value) parts.push(value);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
