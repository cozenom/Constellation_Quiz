import React from 'react';

function TitleScreen({ onSelectRegularQuiz, onSelectSkyView }) {
    return (
        <div className="card">
            <h1>Constellation Quiz</h1>
            <p className="subtitle">Learn to identify all 88 constellations</p>

            <div className="title-buttons">
                <button className="button-primary" onClick={onSelectRegularQuiz}>
                    Regular Quiz Mode
                </button>
                <button className="button-primary" onClick={onSelectSkyView}>
                    Sky View Mode
                </button>
            </div>
        </div>
    );
}

export default TitleScreen;
