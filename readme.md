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

## Attribution

Constellation line data from [Stellarium](https://github.com/Stellarium/stellarium) (`constellationship.fab`, `name.fab`, `cross-id.cat`).

## License

MIT (for quiz application code). Stellarium data files are subject to their original license.
