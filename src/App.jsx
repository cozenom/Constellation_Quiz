import React, { useState, useEffect } from 'react';
import Title from './components/Title';
import QuizSetup from './components/QuizSetup';
import SkyViewSetup from './components/SkyViewSetup';
import Quiz from './components/Quiz';
import QuizResults from './components/QuizResults';
import SkyView from './components/SkyView';
import StudyPage from './components/StudyPage';
import KeybindsPanel from './components/KeybindsPanel';
import StarField from './components/StarField';
import { generateQuestions, generateSingleQuestion } from './utils/quizHelpers';

function App() {
    const [screen, setScreen] = useState('title'); // 'title', 'setup', 'quiz', 'results', 'skyview-setup', 'skyview', 'study'
    const [starsEnabled, setStarsEnabled] = useState(() => {
        const stored = localStorage.getItem('stars-enabled');
        return stored === null ? true : stored === 'true';
    });
    const [config, setConfig] = useState(null);
    const [savedConfig, setSavedConfig] = useState(null); // Persist settings when returning to menu
    const [skyViewConfig, setSkyViewConfig] = useState(null);
    const [savedSkyViewConfig, setSavedSkyViewConfig] = useState(null);
    const [quizState, setQuizState] = useState(null);
    const [constellationData, setConstellationData] = useState(null);
    const [constellationStudy, setConstellationStudy] = useState(null);
    const [starCatalogData, setStarCatalogData] = useState(null);
    const [skyViewStars, setSkyViewStars] = useState(null);
    const [loadingError, setLoadingError] = useState(null);

    // Load constellation data from external JSON
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}data/constellation_data.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load constellation data: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                setConstellationData(data);
            })
            .catch(error => {
                console.error('Error loading constellation data:', error);
                setLoadingError(error.message);
            });
    }, []);

    // Load constellation study data (rich Wikipedia data) from external JSON
    useEffect(() => {
        fetch(`${import.meta.env.BASE_URL}data/constellation_study.json`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load constellation study data: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                setConstellationStudy(data);
            })
            .catch(error => {
                console.error('Error loading constellation study data:', error);
                // Don't block app if constellation study fails to load
                setConstellationStudy(null);
            });
    }, []);

    // Lazy load star catalog only when needed (for quiz modes)
    const loadStarCatalog = () => {
        // Return early if already loaded or loading
        if (starCatalogData !== null) {
            return Promise.resolve(starCatalogData);
        }

        const filename = `${import.meta.env.BASE_URL}data/background_stars_visible.json`;

        return fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load star catalog: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                setStarCatalogData(data);
                return data;
            })
            .catch(error => {
                console.error('Error loading star catalog:', error);
                // Don't block quiz if star catalog fails to load
                setStarCatalogData(null);
                return null;
            });
    };

    // Lazy load sky view stars (has ra/dec for sky view projection)
    const loadSkyViewStars = () => {
        // Return early if already loaded
        if (skyViewStars !== null) {
            return Promise.resolve(skyViewStars);
        }

        const filename = `${import.meta.env.BASE_URL}data/stars_visible.json`;

        return fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load sky view stars: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                setSkyViewStars(data);
                return data;
            })
            .catch(error => {
                console.error('Error loading sky view stars:', error);
                setSkyViewStars(null);
                return null;
            });
    };

    const startQuiz = async (quizConfig) => {
        setConfig(quizConfig);
        setSavedConfig(quizConfig); // Save config for when user returns to menu

        // Load star catalog if needed
        const catalog = await loadStarCatalog();

        const questions = generateQuestions(quizConfig, constellationData, catalog);
        setQuizState({
            questions,
            currentIndex: 0,
            score: 0,
            answers: []
        });
        setScreen('quiz');
    };

    const handleAnswer = (isCorrect, userAnswer, correctAnswer) => {
        const newAnswers = [...quizState.answers, {
            constellation: correctAnswer,
            userAnswer,
            correct: isCorrect
        }];

        const newScore = isCorrect ? quizState.score + 1 : quizState.score;

        setQuizState({
            ...quizState,
            score: newScore,
            answers: newAnswers
        });
    };

    const nextQuestion = async () => {
        if (quizState.currentIndex + 1 < quizState.questions.length) {
            setQuizState({
                ...quizState,
                currentIndex: quizState.currentIndex + 1
            });
        } else if (config.mode === 'endless') {
            // Endless mode: generate new question, avoiding last 3 asked
            const recentAbbrevs = quizState.answers.slice(-3).map(a => {
                // Find the abbrev from the constellation name
                const q = quizState.questions.find(q =>
                    q.constellation.displayName === a.constellation || q.constellation.name === a.constellation
                );
                return q ? q.constellation.abbrev : null;
            }).filter(Boolean);

            // Ensure star catalog is loaded (should already be loaded from startQuiz)
            const catalog = await loadStarCatalog();

            const newQuestion = generateSingleQuestion(config, constellationData, catalog, recentAbbrevs);
            setQuizState({
                ...quizState,
                questions: [...quizState.questions, newQuestion],
                currentIndex: quizState.currentIndex + 1
            });
        } else {
            // Single mode: go to results
            setScreen('results');
        }
    };

    const restartQuiz = () => {
        startQuiz(config);
    };

    const newQuiz = () => {
        setScreen('title');
        setConfig(null);
        setQuizState(null);
    };

    const backToSetup = () => {
        setScreen('setup');
    };

    const goToSetup = () => {
        setScreen('setup');
    };

    const goToSkyViewSetup = () => {
        setScreen('skyview-setup');
    };

    const goToStudy = () => {
        setScreen('study');
    };

    const backToTitle = () => {
        setScreen('title');
        setSavedConfig(config);
        setSavedSkyViewConfig(skyViewConfig);
    };

    const backToSkyViewSetup = () => {
        setScreen('skyview-setup');
    };

    // Show loading state
    if (!constellationData && !loadingError) {
        return (
            <div style={{textAlign: 'center', padding: '3rem'}}>
                <h1>Constellation Quiz</h1>
                <p style={{marginTop: '2rem', fontSize: '1.25rem', color: '#94a3b8'}}>Loading constellation data...</p>
            </div>
        );
    }

    // Show error state
    if (loadingError) {
        return (
            <div style={{textAlign: 'center', padding: '3rem'}}>
                <h1>Error Loading Data</h1>
                <div className="card" style={{marginTop: '2rem'}}>
                    <p style={{color: '#dc2626', marginBottom: '1rem'}}>Failed to load constellation data:</p>
                    <p style={{fontFamily: 'monospace', background: '#1e293b', padding: '1rem', borderRadius: '0.5rem'}}>
                        {loadingError}
                    </p>
                    <p style={{marginTop: '1.5rem', fontSize: '0.875rem', color: '#94a3b8'}}>
                        Make sure you're running a local HTTP server:
                    </p>
                    <p style={{fontFamily: 'monospace', marginTop: '0.5rem', fontSize: '0.875rem'}}>
                        python -m http.server 8000
                    </p>
                </div>
            </div>
        );
    }

    const startSkyView = async (newConfig) => {
        setSkyViewConfig(newConfig);
        setSavedSkyViewConfig(newConfig);

        // Load sky view stars (ra/dec format)
        await loadSkyViewStars();

        setScreen('skyview');
    };

    const toggleStars = () => {
        setStarsEnabled(prev => {
            localStorage.setItem('stars-enabled', String(!prev));
            return !prev;
        });
    };

    return (
        <>
            {starsEnabled && <StarField constellationData={constellationData} />}
            <button
                onClick={toggleStars}
                className="stars-toggle"
                title={starsEnabled ? 'Disable starfield' : 'Enable starfield'}
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    left: '1.5rem',
                    zIndex: 1000,
                    width: '2.25rem',
                    height: '2.25rem',
                    minHeight: 'unset',
                    padding: 0,
                    borderRadius: '50%',
                    background: starsEnabled ? 'rgba(59,130,246,0.25)' : 'rgba(71,85,105,0.25)',
                    border: `1px solid ${starsEnabled ? 'rgba(59,130,246,0.5)' : 'rgba(100,116,139,0.4)'}`,
                    fontSize: '1rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                    transition: 'background 0.2s, border-color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: starsEnabled ? 1 : 0.55,
                }}
            >
                ✦
            </button>
            <KeybindsPanel screen={screen} />

            {screen === 'title' && (
                <Title
                    onSelectRegularQuiz={goToSetup}
                    onSelectSkyView={goToSkyViewSetup}
                    onSelectStudy={goToStudy}
                />
            )}
            {screen === 'setup' && (
                <QuizSetup
                    onStart={startQuiz}
                    onBack={backToTitle}
                    constellationData={constellationData}
                    initialConfig={savedConfig}
                />
            )}
            {screen === 'skyview-setup' && (
                <SkyViewSetup
                    onStart={startSkyView}
                    onBack={backToTitle}
                    constellationData={constellationData}
                    initialConfig={savedSkyViewConfig}
                />
            )}
            {screen === 'quiz' && (
                <Quiz
                    config={config}
                    quizState={quizState}
                    onAnswer={handleAnswer}
                    onNext={nextQuestion}
                    onBack={backToSetup}
                />
            )}
            {screen === 'results' && (
                <QuizResults
                    quizState={quizState}
                    onRestart={restartQuiz}
                    onNewQuiz={newQuiz}
                    onBackToSetup={backToSetup}
                />
            )}
            {screen === 'skyview' && (
                <SkyView
                    constellationData={constellationData}
                    starCatalogData={skyViewStars}
                    config={skyViewConfig}
                    onBack={backToSkyViewSetup}
                />
            )}
            {screen === 'study' && (
                <StudyPage
                    onBack={backToTitle}
                    constellationData={constellationData}
                    constellationStudy={constellationStudy}
                />
            )}
        </>
    );
}

export default App;
