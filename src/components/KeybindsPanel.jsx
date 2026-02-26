import React, { useState } from 'react';
import './KeybindsPanel.css';

function KeybindsPanel({ screen }) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Don't show on title screen
    if (screen === 'title') {
        return null;
    }

    const getKeybinds = () => {
        switch (screen) {
            case 'setup':
            case 'skyview-setup':
                return [
                    { keys: ['Esc'], label: 'Back to menu' }
                ];

            case 'quiz':
                return [
                    { keys: ['1', '2', '3', '4'], label: 'Select answer' },
                    { keys: ['Space', 'Enter'], label: 'Next question' },
                    { keys: ['Esc'], label: 'Back to setup' }
                ];

            case 'skyview':
                return [
                    { keys: ['Space', 'Enter'], label: 'Next question' },
                    { keys: ['Esc'], label: 'Back to setup' }
                ];

            case 'study':
                return [
                    { keys: ['Esc'], label: 'Back to menu' }
                ];

            case 'results':
            case 'skyview-results':
                return [
                    { keys: ['Esc'], label: 'Back to setup' }
                ];

            default:
                return [];
        }
    };

    const keybinds = getKeybinds();

    if (keybinds.length === 0) {
        return null;
    }

    return (
        <div className={`keybinds-panel ${isExpanded ? 'expanded' : ''}`}>
            <button
                className="keybinds-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-label="Toggle keyboard shortcuts"
            >
                ?
            </button>

            {isExpanded && (
                <div className="keybinds-content">
                    <div className="keybinds-panel-title">Keyboard Shortcuts</div>
                    <div className="keybinds-panel-list">
                        {keybinds.map((binding, index) => (
                            <div key={index} className="keybinds-panel-item">
                                <div className="keybinds-panel-keys">
                                    {binding.keys.map((key, i) => (
                                        <React.Fragment key={i}>
                                            {i > 0 && <span className="keybinds-panel-separator">/</span>}
                                            <kbd>{key}</kbd>
                                        </React.Fragment>
                                    ))}
                                </div>
                                <div className="keybinds-panel-label">{binding.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default KeybindsPanel;
