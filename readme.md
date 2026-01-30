# Constellation Quiz

A mobile-friendly web quiz application for practicing constellation identification. Learn all 88 constellations on the go as a productive alternative to mindless scrolling.

## Features

- **Multiple Quiz Modes**
  - Regular Quiz: Identify constellation from star pattern (multiple choice or text input)
  - Sky View Mode: Click to identify constellations in dual-hemisphere view

- **Customizable Options**
  - Difficulty levels: Easy (20), Medium (36), Hard (32), or All (88) constellations
  - Hemisphere filter: Northern, Southern, or Both
  - Rendering modes: Canvas (graphical) or ASCII art
  - Star brightness filter: Simulate city lights to dark sky conditions
  - Background stars: Authentic Hipparcos catalog star field
  - Random rotation: Increase difficulty
  - English names: Show constellation meanings (e.g., "Ursa Major (Big bear)")

- **Keyboard Shortcuts**
  - Space/Enter: Advance to next question
  - 1, 2, 3, 4: Select answer in multiple choice
  - Escape: Go back to previous screen

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
cp data/constellation_data.json data/background_stars_visible.json public/data/

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
# Build the app
npm run build

# Deploy dist/ directory to GitHub Pages
# Option 1: Use gh-pages package
npm install -g gh-pages
gh-pages -d dist

# Option 2: Manual deployment
git add dist/
git commit -m "Deploy constellation quiz"
git push
# Then configure GitHub Pages to serve from the dist/ directory

# Access at: https://[username].github.io/Constellation_Quiz
```

## Project Structure

```
constellation-quiz/
├── src/
│   ├── main.jsx                  # Entry point
│   ├── App.jsx                   # Main app component
│   ├── components/               # React components
│   │   ├── TitleScreen.jsx
│   │   ├── SetupScreen.jsx
│   │   ├── SkyViewSetupScreen.jsx
│   │   ├── QuizScreen.jsx
│   │   ├── ResultsScreen.jsx
│   │   ├── SkyViewScreen.jsx
│   │   ├── ConstellationCanvas.jsx
│   │   ├── ASCIIConstellation.jsx
│   │   └── SkyViewCanvas.jsx
│   ├── utils/
│   │   └── quizHelpers.js        # Quiz generation logic
│   └── styles/
│       └── index.css             # Global styles
├── public/
│   └── data/                     # Constellation data (copied to dist/)
│       ├── constellation_data.json
│       └── background_stars_visible.json
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
cp ../constellation_data.json ../../public/data/
cp ../background_stars_visible.json ../../public/data/
```

This generates:
- `constellation_data.json` - 88 constellations with stereographic projections (1.0 MB)
- `background_stars_visible.json` - Naked-eye stars from Hipparcos catalog (5.8 MB)

**Note:** Only `data/*.json` files are tracked in git. The `public/data/*.json` copies are gitignored and created on-demand.

## Attribution

Constellation line data from [Stellarium](https://github.com/Stellarium/stellarium).
Star data from the Hipparcos catalog via [Skyfield](https://rhodesmill.org/skyfield/).

## License

MIT (for quiz application code). Data files are subject to their respective licenses.
