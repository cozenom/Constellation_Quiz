/**
 * Utility functions for preparing constellation study data
 * Merges constellation_data.json and constellation_study.json
 */

/**
 * Extract named stars from stars array with magnitudes
 * @param {Array} stars - Array of star objects
 * @returns {Array} - Array of {name, magnitude} objects sorted by brightness
 */
export function extractNamedStars(stars) {
  if (!Array.isArray(stars)) return [];

  return stars
    .filter(star => star.name)
    .map(star => ({ name: star.name, magnitude: star.magnitude }))
    .sort((a, b) => a.magnitude - b.magnitude); // Sort by brightness (lower mag = brighter)
}

/**
 * Merge constellation data and study info for study page
 * @param {Object} constellationData - From constellation_data.json
 * @param {Object} constellationStudy - From constellation_study.json
 * @returns {Array} - Array of merged constellation objects
 */
export function mergeStudyData(constellationData, constellationStudy) {
  const merged = [];

  for (const [abbrev, data] of Object.entries(constellationData)) {
    const study = constellationStudy[abbrev] || {};

    merged.push({
      // From constellation_data.json
      abbrev: data.abbrev,
      name: data.name,
      hemisphere: data.hemisphere,
      seasons: data.seasons || [],
      difficulty: data.difficulty,
      namedStars: extractNamedStars(data.stars),
      starCount: data.stars?.length || 0,

      // From constellation_study.json - rich Wikipedia data
      wikiUrl: study.wiki_url || null,
      genitive: study.genitive || null,
      pronunciation: study.pronunciation || null,
      symbolism: study.symbolism || null,
      nameEnglish: study.symbolism || data.name_english || null, // Use symbolism from study, fallback to old name_english
      area: study.area || null,
      brightestStar: study.brightest_star || null,
      messierObjects: study.messier_objects || null,
      bordering: study.bordering || [],
      meteorShowers: study.meteor_showers || null,
      source: study.source || null,
      description: study.description || null,
      // Keep the data types as-is (object for mythology, arrays for text fields)
      mythology: study.mythology || null,
      starsText: study.stars_text || null,
      deepSkyObjects: study.deep_sky_objects || null,
      meteorShowersDetail: study.meteor_showers_detail || null,
      namedStarsFromStudy: study.named_stars || [],
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
 * Format area for display
 * @param {Object} area - Area object with value and rank
 * @returns {string|null} - Formatted area string
 */
export function formatArea(area) {
  if (!area || !area.value) return null;
  return `${area.value.toFixed(0)} sq. deg. (rank ${area.rank})`;
}

/**
 * Format source (discoverer) for display
 * @param {Object} source - Source object with discoverer and year
 * @returns {string|null} - Formatted source string
 */
export function formatSource(source) {
  if (!source) return null;
  if (source.discoverer && source.year) {
    return `${source.discoverer}, ${source.year}`;
  }
  return source.discoverer || source.year || null;
}
