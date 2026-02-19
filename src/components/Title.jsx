import React from 'react';
import './Title.css';

function Title({ onSelectRegularQuiz, onSelectSkyView, onSelectStudy }) {
    return (
        <div className="card title-screen">
            {/* Empty header for consistent spacing with other screens */}
            <div className="quiz-header" style={{visibility: 'hidden'}}>
                <button className="back-button">← Back</button>
            </div>

            <div className="title-hero">
                <h1>Constellation Quiz</h1>
                <p className="subtitle">Learn to identify all 88 IAU (International Astronomical Union) constellations</p>
            </div>

            <div className="title-buttons">
                <button className="mode-button" onClick={onSelectRegularQuiz}>
                    <div className="mode-title">Multiple Choice Quiz</div>
                    <div className="mode-description">Test your knowledge with multiple choice questions</div>
                </button>
                <button className="mode-button" onClick={onSelectSkyView}>
                    <div className="mode-title">Sky View Mode</div>
                    <div className="mode-description">Identify constellations in a realistic night sky</div>
                </button>
                <button className="mode-button mode-button-secondary" onClick={onSelectStudy}>
                    <div className="mode-title">Study Guide</div>
                    <div className="mode-description">Complete reference with mythology, history, and data</div>
                </button>
            </div>
        </div>
    );
}

export default Title;
