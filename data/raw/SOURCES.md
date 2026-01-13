# Data Sources

This document tracks all external data sources used in the Constellation Quiz project.

---

## Sky & Telescope Constellation Line Data

**Source:** Sky & Telescope magazine constellation figures
**Files Used:**
- `SnT_constellations.txt` - Constellation vertex coordinates (RA/Dec)
- `generate_constellationship.py` - Script to convert S&T data to Hipparcos IDs
- `generate_star_names.py` - Star name extraction utility

**What we extract:**
- Constellation line patterns for visual rendering
- Uses VizieR to match coordinates to Hipparcos catalog IDs
- Generates `constellationship.fab` (88 constellations, 848 line segments)

**Attribution:** External scripts and source data, not original to this project.

---

## Stellarium Data Files

**Source:** https://github.com/Stellarium/stellarium
**License:** GPL v2
**Files Used:**
- `name.fab` - Star Bayer/Flamsteed designations (HIP ID mappings)
- `constellation_abbreviations.json` - 3-letter codes to full constellation names

**What we extract:**
- Bayer designations (Greek letters: α, β, γ, etc.)
- Flamsteed numbers
- Latin letter designations
- Constellation name mappings

---

## IAU Star Names Catalog

**Primary Source:** https://exopla.net/star-names/modern-iau-star-names/
**Secondary Source:** https://iauarchive.eso.org/public/themes/constellations/
**License:** Public domain (IAU official data)
**Files Used:**
- `IAU_Star_Catalog.csv` - Official IAU star proper names

**What we extract:**
- Traditional star names (Betelgeuse, Rigel, Sirius, etc.)
- Star constellation associations
- Name origins/etymology
- Cultural group information
- Date adopted by IAU

---

## Hipparcos Star Catalog

**Source:** Accessed via Skyfield Python library
**Reference:** https://www.cosmos.esa.int/web/hipparcos
**License:** Public domain (ESA mission data)
**Cached File:** `hip_main.dat` (51MB, auto-downloaded by Skyfield)

**What we extract:**
- Star positions (Right Ascension, Declination)
- Visual magnitude
- Parallax (converted to distance in light-years)
- Used to generate normalized constellation coordinates (x, y)

---
