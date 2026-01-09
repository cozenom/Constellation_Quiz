# Constellation Quiz

A mobile-friendly web quiz application for practicing constellation identification. Learn all 88 constellations on the go as a productive alternative to mindless scrolling.

## Features

- **Multiple Quiz Modes**
  - Image Recognition: See constellation pattern → select name
  - Name to Image: Given name → pick correct pattern

- **Three Knowledge Levels**
  - Beginner: 20-30 most recognizable constellations
  - Intermediate: 40-60 constellations
  - Advanced: All 88 constellations

- **Mobile-Optimized**
  - Clean, responsive UI
  - Works offline after first load
  - Add to home screen for app-like experience

## Quick Start

### 1. Setup Stellarium Data Files

Download these files from [Stellarium](https://github.com/Stellarium/stellarium) and place in `data/raw/`:
- `constellationship.fab` - Constellation line connections
- `name.fab` - Star Bayer/Flamsteed designations
- `cross-id.cat` - Cross-reference catalog

### 2. Generate Constellation Data

```bash
cd data/scripts
pip install -r requirements.txt
python data_extraction.py
```

This creates `data/constellations.json` with normalized constellation coordinates.

### 3. Deploy

The web app is a single HTML file in `public/index.html`. Deploy to GitHub Pages:

```bash
git add public/index.html
git commit -m "Add constellation quiz app"
git push

# Enable GitHub Pages in repo settings
# Access at: https://[username].github.io/constellation-quiz
```

## Technology

- **Data Pipeline**: Python + Skyfield (Hipparcos catalog)
- **Web App**: Single-file React + Tailwind CSS
- **Rendering**: HTML Canvas for clean constellation display
- **Hosting**: GitHub Pages (free, fast, offline-capable)

## Project Structure

```
constellation-quiz/
├── data/
│   ├── raw/                        # Source data files
│   │   └── constellation_abbreviations.json
│   ├── scripts/                    # Python data extraction
│   └── constellations.json         # Generated output
├── public/
│   └── index.html                  # Deployable web app
└── screenshots/                    # Optional UI screenshots
```

## Coordinate System

Uses standard celestial coordinates (RA/Dec) normalized to 0-1 range:
- Right Ascension (0-24h) → x-axis (0-1)
- Declination (-90° to +90°) → y-axis (0-1)
- Standard chart orientation (North up, East left)

## Future Enhancements

- Bayer designation quiz (Greek letters)
- Abbreviation matching quiz
- Sky visibility quiz (stereographic projection)
- Cross-session progress tracking
- Timed mode and streak counter

## Attribution

Constellation line data from [Stellarium](https://github.com/Stellarium/stellarium) (`constellationship.fab`, `name.fab`, `cross-id.cat`).

## License

MIT (for quiz application code). Stellarium data files are subject to their original license.
