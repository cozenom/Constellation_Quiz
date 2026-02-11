// Generate quiz questions based on config
export function generateQuestions(config, constellationData, starCatalogData) {
    const { hemisphere, difficulty, mode, inputMode, renderMode, showLines, randomRotation, maxMagnitude, showBackgroundStars, backgroundStarOpacity, showEnglishNames, customSelection, selectedConstellations } = config;

    // Helper to format constellation names
    const formatName = (data) => {
        if (showEnglishNames && data.name_english) {
            return `${data.name} (${data.name_english})`;
        }
        return data.name;
    };

    // Filter constellations
    let pool = Object.entries(constellationData).filter(([abbrev, data]) => {
        // Custom selection mode: only include selected constellations
        if (customSelection) {
            return selectedConstellations.includes(abbrev);
        }
        // Normal mode: filter by hemisphere and difficulty
        const matchesHemisphere = hemisphere === 'both' || data.hemisphere === hemisphere || data.hemisphere === 'both';
        const matchesDifficulty = difficulty === 'all' || data.difficulty === difficulty;
        return matchesHemisphere && matchesDifficulty;
    });

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
            backgroundStars: (starCatalogData && starCatalogData[abbrev]) || [],
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
    const { hemisphere, difficulty, renderMode, showLines, randomRotation, maxMagnitude, backgroundStarOpacity, showEnglishNames, customSelection, selectedConstellations } = config;

    // Helper to format constellation names
    const formatName = (data) => {
        if (showEnglishNames && data.name_english) {
            return `${data.name} (${data.name_english})`;
        }
        return data.name;
    };

    // Filter constellations
    let pool = Object.entries(constellationData).filter(([abbrev, data]) => {
        // Custom selection mode: only include selected constellations
        if (customSelection) {
            return selectedConstellations.includes(abbrev);
        }
        // Normal mode: filter by hemisphere and difficulty
        const matchesHemisphere = hemisphere === 'both' || data.hemisphere === hemisphere || data.hemisphere === 'both';
        const matchesDifficulty = difficulty === 'all' || data.difficulty === difficulty;
        return matchesHemisphere && matchesDifficulty;
    });

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
        backgroundStars: (starCatalogData && starCatalogData[abbrev]) || [],
        backgroundStarOpacity
    };
}
