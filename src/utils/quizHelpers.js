import { getVisibleAbbrevs } from './visibility';

// Filter constellations by hemisphere + difficulty (ignores customSelection).
// This is the "matching filters" set: used directly as the pool when
// customSelection is off, and to auto-reseed the manual checklist when it's on.
export function getMatchingAbbrevs(constellationData, config) {
    const { hemisphere, difficulty, visibilityEnabled, visibilityDateTime, visibilityLat, visibilityLon, visibilityMinAltitude } = config;

    let abbrevs = Object.keys(constellationData).filter((abbrev) => {
        const data = constellationData[abbrev];
        const matchesHemisphere = hemisphere.length === 2 || hemisphere.includes(data.hemisphere) || data.hemisphere === 'both';
        const matchesDifficulty = difficulty.includes(data.difficulty);
        return matchesHemisphere && matchesDifficulty;
    });

    if (visibilityEnabled && visibilityLat != null && visibilityLon != null) {
        const visible = getVisibleAbbrevs(constellationData, abbrevs, {
            date: new Date(visibilityDateTime),
            lat: visibilityLat,
            lon: visibilityLon,
            minAltitude: visibilityMinAltitude,
        });
        abbrevs = abbrevs.filter((abbrev) => visible.has(abbrev));
    }

    return abbrevs;
}

// Final pool respecting customSelection override.
export function getFilteredAbbrevs(constellationData, config) {
    return config.customSelection ? config.selectedConstellations : getMatchingAbbrevs(constellationData, config);
}

// Generate quiz questions based on config
export function generateQuestions(config, constellationData, starCatalogData) {
    const { mode, inputMode, renderMode, showLines, randomRotation, maxMagnitude, showBackgroundStars, backgroundStarOpacity, showEnglishNames } = config;

    // Helper to format constellation names
    const formatName = (data) => {
        if (showEnglishNames && data.name_english) {
            return `${data.name} (${data.name_english})`;
        }
        return data.name;
    };

    // Filter constellations
    const filteredAbbrevs = getFilteredAbbrevs(constellationData, config);
    let pool = filteredAbbrevs.map((abbrev) => [abbrev, constellationData[abbrev]]);

    // Shuffle - use all filtered constellations for both modes
    pool = shuffleArray(pool);

    // Generate questions with multiple choice options
    return pool.map(([abbrev, data]) => {
        const wrongAnswers = generateWrongAnswers(abbrev, data, pool, 3);
        const allChoices = shuffleArray([
            { abbrev, name: formatName(data), correct: true },
            ...wrongAnswers.map(w => ({ abbrev: w[0], name: formatName(w[1]), correct: false }))
        ]);

        // Generate random rotation angle (0-360 degrees) if rotation is enabled
        const rotationAngle = randomRotation ? Math.random() * 360 : 0;

        return {
            constellation: {
                abbrev,
                ...data,
                displayName: formatName(data)
            },
            choices: allChoices,
            showLines,
            renderMode,
            maxMagnitude,
            rotationAngle,
            backgroundStars: (showBackgroundStars && starCatalogData && starCatalogData[abbrev]) || [],
            backgroundStarOpacity
        };
    });
}

// Generate wrong answer choices from same hemisphere
export function generateWrongAnswers(correctAbbrev, correctData, pool, count) {
    const candidates = pool.filter(([abbrev, data]) =>
        abbrev !== correctAbbrev && data.hemisphere === correctData.hemisphere
    );

    // If not enough from same hemisphere, add from other hemispheres
    if (candidates.length < count) {
        const candidateAbbrevs = new Set(candidates.map(([abbrev]) => abbrev));
        const others = pool.filter(([abbrev]) =>
            abbrev !== correctAbbrev && !candidateAbbrevs.has(abbrev)
        );

        // Combine and ensure uniqueness
        const combined = [...candidates, ...others];
        return shuffleArray(combined).slice(0, count);
    }

    return shuffleArray(candidates).slice(0, count);
}

// Shuffle array utility
export function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// Generate a single new question for endless mode, avoiding recently asked
export function generateSingleQuestion(config, constellationData, starCatalogData, recentAbbrevs = []) {
    const { renderMode, showLines, randomRotation, maxMagnitude, showBackgroundStars, backgroundStarOpacity, showEnglishNames } = config;

    // Helper to format constellation names
    const formatName = (data) => {
        if (showEnglishNames && data.name_english) {
            return `${data.name} (${data.name_english})`;
        }
        return data.name;
    };

    // Filter constellations
    const filteredAbbrevs = getFilteredAbbrevs(constellationData, config);
    let pool = filteredAbbrevs.map((abbrev) => [abbrev, constellationData[abbrev]]);

    // Exclude recently asked (last 3)
    let candidates = pool.filter(([abbrev]) => !recentAbbrevs.includes(abbrev));
    if (candidates.length === 0) candidates = pool;

    // Pick random constellation
    const [abbrev, data] = candidates[Math.floor(Math.random() * candidates.length)];

    // Generate wrong answers
    const wrongAnswers = generateWrongAnswers(abbrev, data, pool, 3);
    const allChoices = shuffleArray([
        { abbrev, name: formatName(data), correct: true },
        ...wrongAnswers.map(w => ({ abbrev: w[0], name: formatName(w[1]), correct: false }))
    ]);

    // Generate random rotation angle if enabled
    const rotationAngle = randomRotation ? Math.random() * 360 : 0;

    return {
        constellation: {
            abbrev,
            ...data,
            displayName: formatName(data)
        },
        choices: allChoices,
        showLines,
        renderMode,
        maxMagnitude,
        rotationAngle,
        backgroundStars: (showBackgroundStars && starCatalogData && starCatalogData[abbrev]) || [],
        backgroundStarOpacity
    };
}
