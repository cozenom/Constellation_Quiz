// Generate quiz questions based on config
export function generateQuestions(config, constellationData, starCatalogData) {
    const { hemisphere, difficulty, season, numQuestions, inputMode, renderMode, showLines, randomRotation, maxMagnitude, showBackgroundStars, backgroundStarOpacity } = config;

    // Filter constellations
    let pool = Object.entries(constellationData).filter(([abbrev, data]) => {
        const matchesHemisphere = hemisphere === 'both' || data.hemisphere === hemisphere || data.hemisphere === 'both';
        const matchesDifficulty = difficulty === 'all' || data.difficulty === difficulty;
        const matchesSeason = season === 'all' || data.seasons.includes(season);
        return matchesHemisphere && matchesDifficulty && matchesSeason;
    });

    // Shuffle and limit
    pool = shuffleArray(pool);
    const count = numQuestions === 'endless' ? pool.length : Math.min(numQuestions, pool.length);
    pool = pool.slice(0, count);

    // Generate questions with multiple choice options
    return pool.map(([abbrev, data]) => {
        const wrongAnswers = generateWrongAnswers(abbrev, data, pool, 3);
        const allChoices = shuffleArray([
            { abbrev, name: data.name, correct: true },
            ...wrongAnswers.map(w => ({ abbrev: w[0], name: w[1].name, correct: false }))
        ]);

        // Generate random rotation angle (0-360 degrees) if rotation is enabled
        const rotationAngle = randomRotation ? Math.random() * 360 : 0;

        return {
            constellation: { abbrev, ...data },
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
