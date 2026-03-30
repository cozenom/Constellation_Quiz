# Constellation Quiz

A mobile-friendly web quiz application for practicing constellation identification. Learn all 88 constellations on the go as a productive alternative to mindless scrolling.

## Features

- **Multiple Quiz Modes**
  - Multiple Choice Quiz: Identify constellations from star patterns with 4 answer choices
  - Sky View Mode: Click to identify constellations in a realistic dual-hemisphere night sky
  - Study Guide: Complete reference table with mythology, history, features, and visualizations (mobile-optimized)

- **Customizable Options**
  - Difficulty levels: Easy (20), Medium (36), Hard (32), or All (88) constellations
  - Hemisphere filter: Northern, Southern, or Both
  - Custom constellation selection: Pick specific constellations to quiz on
  - Rendering modes: Canvas (graphical) or ASCII art
  - Star brightness filter: Simulate city lights to dark sky conditions
  - Background stars: Authentic Hipparcos catalog star field
  - Random rotation: Increase difficulty (Multiple Choice Quiz only)
  - English names: Show constellation meanings (e.g., "Ursa Major (Big bear)")

- **Keyboard Shortcuts**
  - Space/Enter: Advance to next question
  - 1, 2, 3, 4: Select answer in multiple choice
  - Escape: Go back to previous screen
  - K: Toggle keybinds panel

- **Mobile-Optimized**
  - Clean, responsive UI
  - Works offline after first load
  - Add to home screen for app-like experience

## Quick Start

### Development

```bash
# One-time setup
npm install

# Copy data files to public/ (needed for Vite to serve them)
cp data/constellation_data.json data/constellation_study.json data/background_stars_visible.json data/stars_visible.json public/data/

# Run development server with hot reload
npm run dev
# Opens at http://localhost:5173

# Build for production
npm run build
# Output in dist/

# Preview production build
npm run preview
```

### Deploy to GitHub Pages

```bash
# One-time setup: Install gh-pages as dev dependency
npm install -D gh-pages

# Deploy to GitHub Pages (builds and pushes to gh-pages branch)
npm run deploy

# First deployment: Enable GitHub Pages in repo settings
# Settings → Pages → Source: gh-pages branch → Save

# Access at: https://[username].github.io/Constellation_Quiz

# Future deployments: Just run npm run deploy
```

## Project Structure

```
constellation-quiz/
├── src/
│   ├── main.jsx                  # Entry point
│   ├── App.jsx                   # Main app component
│   ├── components/               # React components
│   │   ├── Title.jsx/.css        # Home screen with mode selection
│   │   ├── Footer.jsx/.css       # Footer component
│   │   ├── KeybindsPanel.jsx/.css # Keyboard shortcuts panel
│   │   ├── StudyPage.jsx/.css    # Study guide reference table
│   │   ├── QuizSetup.jsx         # Multiple choice quiz configuration
│   │   ├── Quiz.jsx              # Quiz screen
│   │   ├── QuizResults.jsx       # Quiz results screen
│   │   ├── QuizCanvas.jsx        # Canvas constellation renderer
│   │   ├── QuizASCII.jsx         # ASCII constellation renderer
│   │   ├── SkyViewSetup.jsx      # Sky view mode configuration
│   │   ├── SkyView.jsx           # Sky view mode screen
│   │   ├── SkyViewResults.jsx    # Sky view results
│   │   └── SkyViewCanvas.jsx     # Sky view canvas renderer
│   ├── utils/
│   │   ├── quizHelpers.js        # Quiz generation logic
│   │   └── studyDataUtils.js     # Study page data utilities
│   └── styles/
│       └── index.css             # Global styles
├── data/                         # Constellation data files
│   ├── constellation_data.json   # Core constellation data (1.1 MB)
│   ├── constellation_study.json  # Study mode data with details (607 KB)
│   ├── background_stars_visible.json  # Background stars (1 KB)
│   └── stars_visible.json        # Naked-eye stars (840 KB)
├── public/
│   └── data/                     # Data symlinks (served by Vite)
├── dist/                         # Build output (generated)
├── index.html                    # HTML template
├── package.json                  # Dependencies
└── vite.config.js                # Vite configuration
```

## Technology Stack

- **Frontend**: React 18 + Vite
- **Rendering**: HTML5 Canvas API (stereographic projection for sky view)
- **Data Pipeline**: Python + Skyfield (Hipparcos catalog)
- **Styling**: CSS (custom dark theme)
- **Build Tool**: Vite (fast dev server, optimized production builds)
- **Deployment**: GitHub Pages (static hosting)

## Data Generation

Constellation data is pre-generated using Python scripts in `data/scripts/`:

```bash
cd data/scripts
pip install skyfield numpy
python build_quiz_data.py

# Copy generated data to public/ for Vite to serve
cp ../constellation_data.json ../constellation_study.json ../../public/data/
cp ../background_stars_visible.json ../stars_visible.json ../../public/data/
```

This generates:
- `constellation_data.json` - 88 constellations with stereographic projections (1.1 MB)
- `constellation_study.json` - Study mode data with mythology and details (607 KB)
- `background_stars_visible.json` - Background stars for rendering (1 KB)
- `stars_visible.json` - Naked-eye stars from Hipparcos catalog (840 KB)

**Note:** Only `data/*.json` files are tracked in git. The `public/data/*.json` copies are gitignored and created on-demand.

## Attribution

Constellation line data from [Stellarium](https://github.com/Stellarium/stellarium).
Star data from the Hipparcos catalog via [Skyfield](https://rhodesmill.org/skyfield/).
Constellation mythology and history from [Wikipedia](https://en.wikipedia.org/).

## License

MIT (for quiz application code). Data files are subject to their respective licenses.
