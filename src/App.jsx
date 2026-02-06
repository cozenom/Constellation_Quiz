import React, { useState, useEffect } from 'react';
import Title from './components/Title';
import QuizSetup from './components/QuizSetup';
import SkyViewSetup from './components/SkyViewSetup';
import Quiz from './components/Quiz';
import QuizResults from './components/QuizResults';
import SkyView from './components/SkyView';
import { generateQuestions, generateSingleQuestion } from './utils/quizHelpers';

function App() {
    const [screen, setScreen] = useState('title'); // 'title', 'setup', 'quiz', 'results', 'skyview-setup', 'skyview'
    const [config, setConfig] = useState(null);
    const [savedConfig, setSavedConfig] = useState(null); // Persist settings when returning to menu
    const [skyViewConfig, setSkyViewConfig] = useState({
        hemisphere: 'both',
        difficulty: 'all',
        showLines: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
        showEnglishNames: true,
    });
    const [savedSkyViewConfig, setSavedSkyViewConfig] = useState(null);
    const [quizState, setQuizState] = useState(null);
    const [constellationData, setConstellationData] = useState(null);
    const [starCatalogData, setStarCatalogData] = useState(null);
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

    // Load star catalog on mount (preload so it's ready when quiz starts)
    useEffect(() => {
        const filename = `${import.meta.env.BASE_URL}data/background_stars_visible.json`;

        fetch(filename)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load star catalog: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                setStarCatalogData(data);
            })
            .catch(error => {
                console.error('Error loading star catalog:', error);
                // Don't block quiz if star catalog fails to load
                setStarCatalogData(null);
            });
    }, []);

    const startQuiz = (quizConfig) => {
        setConfig(quizConfig);
        setSavedConfig(quizConfig); // Save config for when user returns to menu
        const questions = generateQuestions(quizConfig, constellationData, starCatalogData);
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

    const nextQuestion = () => {
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

            const newQuestion = generateSingleQuestion(config, constellationData, starCatalogData, recentAbbrevs);
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
                <h1>🌟 Constellation Quiz</h1>
                <p style={{marginTop: '2rem', fontSize: '1.25rem'}}>Loading constellation data...</p>
            </div>
        );
    }

    // Show error state
    if (loadingError) {
        return (
            <div style={{textAlign: 'center', padding: '3rem'}}>
                <h1>❌ Error</h1>
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

    const startSkyView = (newConfig) => {
        setSkyViewConfig(newConfig);
        setSavedSkyViewConfig(newConfig);
        setScreen('skyview');
    };

    return (
        <>
            {screen === 'title' && (
                <Title
                    onSelectRegularQuiz={goToSetup}
                    onSelectSkyView={goToSkyViewSetup}
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
                    starCatalogData={starCatalogData}
                    config={skyViewConfig}
                    onBack={backToSkyViewSetup}
                />
            )}
        </>
    );
}

export default App;
