import React, { useState, useEffect } from 'react';
import QuizCanvas from './QuizCanvas';
import QuizASCII from './QuizASCII';

function Quiz({ config, quizState, onAnswer, onNext, onBack }) {
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [textInput, setTextInput] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [showNextButton, setShowNextButton] = useState(false);
    const [currentShowLines, setCurrentShowLines] = useState(false);

    const currentQuestion = quizState.questions[quizState.currentIndex];
    const isTextMode = config.inputMode === 'text';

    // Reset state when question changes
    useEffect(() => {
        setSelectedAnswer(null);
        setTextInput('');
        setFeedback(null);
        setShowNextButton(false);
        setCurrentShowLines(currentQuestion.showLines);
    }, [quizState.currentIndex, currentQuestion.showLines]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Escape → Go back
            if (e.code === 'Escape') {
                onBack();
                return;
            }

            // Space or Enter → Next question (when answered)
            if ((e.code === 'Space' || e.code === 'Enter') && showNextButton) {
                e.preventDefault();
                handleNext();
                return;
            }

            // 1-4 → Select answer (multiple choice only, when not answered)
            if (!isTextMode && !feedback) {
                const num = parseInt(e.key);
                if (num >= 1 && num <= 4 && currentQuestion.choices[num - 1]) {
                    handleMultipleChoiceAnswer(currentQuestion.choices[num - 1]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showNextButton, feedback, isTextMode, currentQuestion.choices, onBack]);

    const handleMultipleChoiceAnswer = (choice) => {
        if (feedback) return; // Already answered

        setSelectedAnswer(choice);
        const isCorrect = choice.correct;

        // Reveal lines after guessing (if lines were originally off)
        if (!currentQuestion.showLines) {
            setCurrentShowLines(true);
        }

        onAnswer(isCorrect, choice.name, currentQuestion.constellation.displayName || currentQuestion.constellation.name);
        setFeedback({
            correct: isCorrect,
            message: isCorrect
                ? '✓ Correct!'
                : `✗ Incorrect. The correct answer is ${currentQuestion.constellation.displayName || currentQuestion.constellation.name}`
        });
        setShowNextButton(true);
    };

    const handleTextInputSubmit = (e) => {
        e.preventDefault();
        if (feedback || !textInput.trim()) return;

        const userAnswer = textInput.trim().toLowerCase();
        const correctAnswer = currentQuestion.constellation.name.toLowerCase();
        const correctAbbrev = currentQuestion.constellation.abbrev.toLowerCase();

        // Check if answer matches name or abbreviation
        const isCorrect = userAnswer === correctAnswer || userAnswer === correctAbbrev;

        // Reveal lines after guessing (if lines were originally off)
        if (!currentQuestion.showLines) {
            setCurrentShowLines(true);
        }

        onAnswer(isCorrect, textInput, currentQuestion.constellation.displayName || currentQuestion.constellation.name);
        setFeedback({
            correct: isCorrect,
            message: isCorrect
                ? '✓ Correct!'
                : `✗ Incorrect. The correct answer is ${currentQuestion.constellation.displayName || currentQuestion.constellation.name}`
        });
        setShowNextButton(true);
    };

    const handleNext = () => {
        // Reset currentShowLines to match the NEXT question's setting before advancing
        // This prevents flickering where lines briefly appear before being hidden
        const nextIndex = quizState.currentIndex + 1;
        if (nextIndex < quizState.questions.length) {
            const nextQuestion = quizState.questions[nextIndex];
            setCurrentShowLines(nextQuestion.showLines);
        }
        onNext();
    };

    const progress = quizState.currentIndex + 1;
    const total = quizState.questions.length;
    const percentage = progress > 0 ? Math.round((quizState.score / progress) * 100) : 0;
    const isEndless = config.mode === 'endless';

    return (
        <div>
            <button className="back-button" onClick={onBack}>
                ← Back
            </button>

            <div className="card">
                <div className="quiz-header">
                    <div className="question-number">
                        {isEndless ? (
                            <>Question #{progress}</>
                        ) : (
                            <>Question {progress} of {total}</>
                        )}
                    </div>
                    <div className="score">
                        Score: {quizState.score}/{progress} ({percentage}%)
                    </div>
                </div>
                <div className="quiz-desktop-grid">
                    <div className="quiz-constellation-col">
                        {currentQuestion.renderMode === 'ascii' ? (
                            <QuizASCII
                                constellation={currentQuestion.constellation}
                                showLines={currentShowLines}
                                maxMagnitude={currentQuestion.maxMagnitude}
                                rotationAngle={currentQuestion.rotationAngle}
                                backgroundStars={currentQuestion.backgroundStars}
                            />
                        ) : (
                            <QuizCanvas
                                constellation={currentQuestion.constellation}
                                showLines={currentShowLines}
                                maxMagnitude={currentQuestion.maxMagnitude}
                                rotationAngle={currentQuestion.rotationAngle}
                                backgroundStars={currentQuestion.backgroundStars}
                                backgroundStarOpacity={currentQuestion.backgroundStarOpacity}
                            />
                        )}
                    </div>

                    <div className="quiz-interaction-col">
                        <h2 style={{textAlign: 'center', marginBottom: '1.5rem'}}>
                            What constellation is this?
                        </h2>

                        {isTextMode ? (
                            <div className="text-input-container">
                                <form onSubmit={handleTextInputSubmit}>
                                    <input
                                        type="text"
                                        value={textInput}
                                        onChange={(e) => setTextInput(e.target.value)}
                                        placeholder="Enter constellation name..."
                                        disabled={feedback !== null}
                                        autoFocus
                                    />
                                    {!showNextButton && (
                                        <button type="submit" className="button-primary">
                                            Submit Answer
                                        </button>
                                    )}
                                </form>
                            </div>
                        ) : (
                            <div className="answer-grid">
                                {currentQuestion.choices.map((choice, idx) => (
                                    <button
                                        key={idx}
                                        className={`answer-button ${
                                            feedback && choice.correct ? 'correct' : ''
                                        } ${
                                            feedback && selectedAnswer === choice && !choice.correct ? 'incorrect' : ''
                                        }`}
                                        onClick={() => handleMultipleChoiceAnswer(choice)}
                                        disabled={feedback !== null}
                                    >
                                        {choice.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        {feedback && (
                            <div className={`feedback ${feedback.correct ? 'correct' : 'incorrect'}`}>
                                {feedback.message}
                            </div>
                        )}

                        {showNextButton && (
                            <button
                                className="button-primary"
                                onClick={handleNext}
                                style={{marginTop: '1rem'}}
                            >
                                {isEndless || progress < total ? 'Next Question →' : 'See Results'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Quiz;
