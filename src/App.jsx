import React, { useState, useEffect } from 'react';
import TitleScreen from './components/TitleScreen';
import SetupScreen from './components/SetupScreen';
import SkyViewSetupScreen from './components/SkyViewSetupScreen';
import QuizScreen from './components/QuizScreen';
import ResultsScreen from './components/ResultsScreen';
import SkyViewScreen from './components/SkyViewScreen';
import { generateQuestions } from './utils/quizHelpers';

function App() {
    const [screen, setScreen] = useState('title'); // 'title', 'setup', 'quiz', 'results', 'skyview-setup', 'skyview'
    const [config, setConfig] = useState(null);
    const [savedConfig, setSavedConfig] = useState(null); // Persist settings when returning to menu
    const [skyViewConfig, setSkyViewConfig] = useState({
        hemisphere: 'both',
        difficulty: 'all',
        season: 'all',
        showLines: true,
        maxMagnitude: 6,
        showBackgroundStars: true,
        backgroundStarOpacity: 100,
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
        } else {
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
        setScreen('title');
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
                <TitleScreen
                    onSelectRegularQuiz={goToSetup}
                    onSelectSkyView={goToSkyViewSetup}
                />
            )}
            {screen === 'setup' && (
                <SetupScreen
                    onStart={startQuiz}
                    onBack={backToTitle}
                    constellationData={constellationData}
                    initialConfig={savedConfig}
                />
            )}
            {screen === 'skyview-setup' && (
                <SkyViewSetupScreen
                    onStart={startSkyView}
                    onBack={backToTitle}
                    initialConfig={savedSkyViewConfig}
                />
            )}
            {screen === 'quiz' && (
                <QuizScreen
                    config={config}
                    quizState={quizState}
                    onAnswer={handleAnswer}
                    onNext={nextQuestion}
                    onBack={backToSetup}
                />
            )}
            {screen === 'results' && (
                <ResultsScreen
                    quizState={quizState}
                    onRestart={restartQuiz}
                    onNewQuiz={newQuiz}
                />
            )}
            {screen === 'skyview' && (
                <SkyViewScreen
                    constellationData={constellationData}
                    starCatalogData={starCatalogData}
                    config={skyViewConfig}
                    onBack={backToTitle}
                />
            )}
        </>
    );
}

export default App;
