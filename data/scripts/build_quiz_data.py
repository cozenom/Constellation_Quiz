#!/usr/bin/env python3
"""
Build Constellation Quiz Data
Consolidated script to generate quiz-ready constellation data from raw source files.

Input:
- data/raw/name.fab (Stellarium Bayer designations)
- data/raw/IAU_Star_Catalog.csv (Star proper names)
- data/raw/constellationship.fab (Constellation line connections)
- data/raw/constellation_abbreviations.json (Constellation names)
- Hipparcos catalog (via Skyfield)

Output:
- data/constellations_quiz.json (Complete quiz-ready data with metadata)
"""

import json
import math
import re
from typing import Dict, List, Tuple

import pandas as pd
from skyfield.api import load
from skyfield.data import hipparcos


# ==================== DIFFICULTY RATINGS (CURATED) ====================

DIFFICULTY_RATINGS = {
    # Easy - Famous, highly recognizable patterns (~20 constellations)
    "easy": [
        "Ori", "UMa", "UMi", "Cas", "Leo", "Sco", "Sgr", "Cyg", "Lyr",
        "Aur", "Gem", "Tau", "Per", "Cru", "Cen", "CMa", "And", "Peg",
        "Vir", "Aql"
    ],

    # Medium - Recognizable but less famous (~35 constellations)
    "medium": [
        "Boo", "Her", "Oph", "Ser", "Hya", "Aqr", "Psc", "Ari", "Cap",
        "Lib", "Cnc", "Dra", "Cep", "Lup", "Vel", "Car", "Pup", "CMi",
        "Del", "Eri", "Cet", "Phe", "Gru", "Pav", "Tuc", "Hyi", "Dor",
        "Col", "Lep", "Mon", "CrB", "CVn", "LMi", "Lyn", "Tri"
    ],

    # Hard - Obscure, faint, or shapeless (~33 constellations)
    "hard": [
        "Ant", "Aps", "Cae", "Cam", "Cha", "Cir", "Com", "CrA",
        "Crt", "Crv", "Equ", "For", "Hor", "Ind", "Lac", "Men", "Mic",
        "Mus", "Nor", "Oct", "Pic", "PsA", "Pyx", "Ret", "Scl", "Sct",
        "Sex", "Sge", "Tel", "TrA", "Vol", "Vul"
    ]
}

# Flatten to abbrev -> difficulty mapping
DIFFICULTY_MAP = {}
for difficulty, abbrevs in DIFFICULTY_RATINGS.items():
    for abbrev in abbrevs:
        DIFFICULTY_MAP[abbrev] = difficulty


# ==================== PROJECTION FUNCTIONS ====================

def stereographic_projection(ra: float, dec: float, ra_center: float, dec_center: float) -> Tuple[float, float]:
    """Project celestial coordinates using stereographic projection."""
    ra_rad = math.radians(ra * 15)
    dec_rad = math.radians(dec)
    ra0_rad = math.radians(ra_center * 15)
    dec0_rad = math.radians(dec_center)

    cos_c = (math.sin(dec0_rad) * math.sin(dec_rad) +
             math.cos(dec0_rad) * math.cos(dec_rad) * math.cos(ra_rad - ra0_rad))

    k = 2.0 / (1.0 + cos_c)

    x = k * math.cos(dec_rad) * math.sin(ra_rad - ra0_rad)
    y = k * (math.cos(dec0_rad) * math.sin(dec_rad) -
             math.sin(dec0_rad) * math.cos(dec_rad) * math.cos(ra_rad - ra0_rad))

    return -x, y


def polar_stereographic_projection(ra: float, dec: float, pole: str = 'north') -> Tuple[float, float]:
    """Project celestial coordinates using polar stereographic projection from celestial pole."""
    ra_rad = math.radians(ra * 15)
    dec_rad = math.radians(dec)

    if pole == 'south':
        dec_rad = -dec_rad

    k = 2.0 / (1.0 + math.sin(dec_rad))

    x = k * math.cos(dec_rad) * math.sin(ra_rad)
    y = -k * math.cos(dec_rad) * math.cos(ra_rad)

    return -x, y


def normalize_coordinates(coords: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """Normalize projected coordinates to 0-1 range with 10% padding."""
    if not coords:
        return []

    xs = [x for x, y in coords]
    ys = [y for x, y in coords]

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    x_range = x_max - x_min
    y_range = y_max - y_min

    if x_range < 0.001:
        x_range = 0.01
        x_min -= 0.005
        x_max += 0.005
    if y_range < 0.001:
        y_range = 0.01
        y_min -= 0.005
        y_max += 0.005

    x_padding = x_range * 0.1
    y_padding = y_range * 0.1
    x_min -= x_padding
    x_max += x_padding
    y_min -= y_padding
    y_max += y_padding

    normalized = []
    for x, y in coords:
        norm_x = (x - x_min) / (x_max - x_min)
        norm_y = (y - y_min) / (y_max - y_min)
        normalized.append((norm_x, norm_y))

    return normalized


# ==================== RAW DATA PARSERS ====================

def parse_name_fab(filepath: str) -> Dict[int, List[str]]:
    """Parse name.fab file to extract star designations."""
    print(f"📖 Reading {filepath}...")

    stars = {}
    greek_letters = "αβγδεζηθικλμνξοπρστυφχψω"

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split("|")
            if len(parts) < 2:
                continue

            try:
                hip_id = int(parts[0].strip())
            except ValueError:
                continue

            designation = parts[1].strip()

            if any(greek in designation for greek in greek_letters):
                if hip_id not in stars:
                    stars[hip_id] = []
                stars[hip_id].append(designation)

    print(f"✅ Parsed {len(stars)} stars with designations")
    return stars


def parse_iau_catalog(filepath: str) -> Dict[int, Dict[str, str]]:
    """Parse IAU Star Catalog CSV."""
    print(f"📖 Reading {filepath}...")

    df = pd.read_csv(filepath)
    iau_stars = {}

    for _, row in df.iterrows():
        hip_id = row.get("HIP")
        if pd.isna(hip_id):
            continue

        hip_id = int(hip_id)

        # Helper to convert pandas NaN to empty string
        def clean_value(val):
            return "" if pd.isna(val) else str(val)

        iau_stars[hip_id] = {
            "name": clean_value(row.get("proper names", "")),
            "constellation": clean_value(row.get("Constellation", "")),
            "origin": clean_value(row.get("Origin", "")),
            "cultural_group": clean_value(row.get("Ethnic-Cultural_Group_or_Language", "")),
            "date_adopted": clean_value(row.get("Date of Adoption", ""))
        }

    print(f"✅ Parsed {len(iau_stars)} IAU star names")
    return iau_stars


def parse_constellationship_fab(filepath: str) -> Dict[str, List[List[int]]]:
    """Parse constellationship.fab file to extract constellation line connections."""
    print(f"📖 Reading {filepath}...")

    constellations = {}

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            if len(parts) < 3:
                continue

            if not (len(parts[0]) == 3 and parts[0][0].isupper() and parts[1].isdigit()):
                continue

            constellation_abbrev = parts[0]
            hip_ids = [int(hip) for hip in parts[2:]]

            lines = [[hip_ids[i], hip_ids[i + 1]] for i in range(0, len(hip_ids) - 1, 2)]
            constellations[constellation_abbrev] = lines

    print(f"✅ Parsed {len(constellations)} constellations")
    return constellations


def load_constellation_names(filepath: str) -> Dict[str, str]:
    """Load constellation abbreviation to full name mappings."""
    print(f"📖 Reading {filepath}...")

    with open(filepath, "r", encoding="utf-8") as f:
        const_names = json.load(f)

    print(f"✅ Loaded {len(const_names)} constellation names")
    return const_names


def load_hipparcos_data() -> Dict[int, Dict]:
    """Load Hipparcos catalog via Skyfield."""
    print(f"📖 Loading Hipparcos catalog (this may take a moment)...")

    # Use cached file if it exists, otherwise download
    import os
    cache_path = "data/raw/hip_main.dat"
    if os.path.exists(cache_path):
        with open(cache_path, 'rb') as f:
            df = hipparcos.load_dataframe(f)
    else:
        with load.open(hipparcos.URL) as f:
            df = hipparcos.load_dataframe(f)

    hip_data = {}

    for hip_id, row in df.iterrows():
        magnitude = row.get("magnitude")
        parallax = row.get("parallax_mas")
        ra_hours = row.get("ra_hours")
        dec_degrees = row.get("dec_degrees")

        distance = None
        if parallax and not pd.isna(parallax) and parallax > 0:
            distance_parsecs = 1000.0 / parallax
            distance = round(distance_parsecs * 3.26156, 2)

        hip_data[hip_id] = {
            "magnitude": float(magnitude) if magnitude is not None and not pd.isna(magnitude) else None,
            "distance_ly": distance,
            "ra": float(ra_hours) if ra_hours is not None and not pd.isna(ra_hours) else None,
            "dec": float(dec_degrees) if dec_degrees is not None and not pd.isna(dec_degrees) else None
        }

    print(f"✅ Loaded Hipparcos data for {len(hip_data)} stars")
    return hip_data


# ==================== QUIZ METADATA CALCULATORS ====================

def calculate_hemisphere(dec_center: float) -> str:
    """Determine hemisphere based on declination center."""
    if dec_center > 20:
        return "north"
    elif dec_center < -20:
        return "south"
    else:
        return "both"


def calculate_seasons(ra_center: float, dec_center: float) -> List[str]:
    """Determine best viewing season(s) based on RA."""
    # Circumpolar constellations visible year-round
    if abs(dec_center) > 60:
        return ["all"]

    # Normalize RA to 0-24 range
    ra = ra_center % 24

    # Determine season(s) based on RA
    # RA 21h-3h (335°-45°) → Autumn
    # RA 3h-9h (45°-135°) → Winter
    # RA 9h-15h (135°-225°) → Spring
    # RA 15h-21h (225°-335°) → Summer

    seasons = []
    if 21 <= ra or ra < 3:
        seasons.append("autumn")
    if 3 <= ra < 9:
        seasons.append("winter")
    if 9 <= ra < 15:
        seasons.append("spring")
    if 15 <= ra < 21:
        seasons.append("summer")

    return seasons if seasons else ["all"]


# ==================== MAIN PROCESSING ====================

def build_quiz_data(output_path: str):
    """Main function to build complete quiz data."""
    print("=" * 70)
    print("CONSTELLATION QUIZ - BUILD COMPLETE QUIZ DATA")
    print("=" * 70)
    print()

    # Load all raw data
    stellarium_names = parse_name_fab("data/raw/name.fab")
    iau_stars = parse_iau_catalog("data/raw/IAU_Star_Catalog.csv")
    constellation_lines = parse_constellationship_fab("data/raw/constellationship.fab")
    constellation_names = load_constellation_names("data/raw/constellation_abbreviations.json")
    hipparcos_data = load_hipparcos_data()

    # Manual constellation line fixes
    # Hydra: Missing connection between α Crt (HIP 53740) and β Crt (HIP 54682)
    # The Sky & Telescope source data has a gap here, but Hydra should be continuous.
    # This connection passes through Crater constellation but is part of Hydra's body.
    if 'Hya' in constellation_lines:
        constellation_lines['Hya'].append([53740, 54682])
        print("✏️  Applied manual fix: Added missing Hydra connection (HIP 53740 → 54682)")

    print("\n🔗 Building quiz data for all constellations...")

    quiz_data = {}
    success_count = 0

    for abbrev, lines in sorted(constellation_lines.items()):
        name = constellation_names.get(abbrev, abbrev)

        try:
            # Collect all unique stars in this constellation
            constellation_stars = {}
            ras = []
            decs = []

            for line in lines:
                for hip_id in [line[0], line[1]]:
                    if hip_id in hipparcos_data and hipparcos_data[hip_id].get('ra') is not None:
                        hip_data = hipparcos_data[hip_id]

                        # Get designation and name
                        bayer = None
                        if hip_id in stellarium_names:
                            bayer = stellarium_names[hip_id][0]  # Take first designation

                        # Get IAU star data (name, cultural info, etc.)
                        iau_data = iau_stars.get(hip_id, {})

                        constellation_stars[hip_id] = {
                            'ra': hip_data['ra'],
                            'dec': hip_data['dec'],
                            'magnitude': hip_data['magnitude'] or 99,
                            'bayer': bayer,
                            'name': iau_data.get("name"),
                            'cultural_group': iau_data.get("cultural_group"),
                            'date_adopted': iau_data.get("date_adopted"),
                            'origin': iau_data.get("origin")
                        }
                        ras.append(hip_data['ra'])
                        decs.append(hip_data['dec'])

            if not constellation_stars:
                print(f"⚠️  {abbrev:4s} - {name:25s} (no valid stars)")
                continue

            # Calculate constellation center
            ra_center = sum(ras) / len(ras)
            dec_center = sum(decs) / len(decs)

            # Determine projection type
            is_north_circumpolar = dec_center > 60
            is_south_circumpolar = dec_center < -60

            # Project all stars
            projected_coords = []
            for hip_id, star in constellation_stars.items():
                if is_north_circumpolar:
                    x_proj, y_proj = polar_stereographic_projection(star['ra'], star['dec'], pole='north')
                    projection_type = 'polar_north'
                elif is_south_circumpolar:
                    x_proj, y_proj = polar_stereographic_projection(star['ra'], star['dec'], pole='south')
                    projection_type = 'polar_south'
                else:
                    x_proj, y_proj = stereographic_projection(star['ra'], star['dec'], ra_center, dec_center)
                    projection_type = 'stereographic'

                star['x_proj'] = x_proj
                star['y_proj'] = y_proj
                projected_coords.append((x_proj, y_proj))

            # Normalize coordinates
            normalized_coords = normalize_coordinates(projected_coords)

            for (hip_id, star), (norm_x, norm_y) in zip(constellation_stars.items(), normalized_coords):
                star['x'] = round(norm_x, 6)
                star['y'] = round(norm_y, 6)

            # Build star array and line indices
            hip_to_index = {hip_id: idx for idx, hip_id in enumerate(constellation_stars.keys())}
            star_array = []

            for hip_id, star in constellation_stars.items():
                star_entry = {
                    'hip': str(hip_id),
                    'x': star['x'],
                    'y': star['y'],
                    'magnitude': star['magnitude'] if star['magnitude'] != 99 else None
                }

                # Add optional star metadata if available
                if star.get('bayer'):
                    star_entry['bayer'] = star['bayer']

                # If star has IAU data (name exists), include all IAU fields for consistency
                # (even if some are empty strings like origin for Diadem and Alpherg)
                if star.get('name'):
                    star_entry['name'] = star['name']
                    star_entry['cultural_group'] = star.get('cultural_group', '')
                    star_entry['date_adopted'] = star.get('date_adopted', '')
                    star_entry['origin'] = star.get('origin', '')

                star_array.append(star_entry)

            line_indices = []
            for line in lines:
                hip1, hip2 = line[0], line[1]
                if hip1 in hip_to_index and hip2 in hip_to_index:
                    line_indices.append([hip_to_index[hip1], hip_to_index[hip2]])

            # Calculate quiz metadata
            hemisphere = calculate_hemisphere(dec_center)
            seasons = calculate_seasons(ra_center, dec_center)
            difficulty = DIFFICULTY_MAP.get(abbrev, "medium")  # Default to medium if not in curated list

            # Build final constellation data
            quiz_data[abbrev] = {
                'name': name,
                'abbrev': abbrev,
                'hemisphere': hemisphere,
                'difficulty': difficulty,
                'seasons': seasons,
                'ra_center': round(ra_center, 2),
                'dec_center': round(dec_center, 2),
                'projection_type': projection_type,
                'stars': star_array,
                'lines': line_indices
            }

            print(f"✅ {abbrev:4s} - {name:25s} ({hemisphere:5s}, {difficulty:6s}, {len(star_array)} stars, {projection_type})")
            success_count += 1

        except Exception as e:
            print(f"❌ {abbrev:4s} - {name:25s}: {str(e)}")

    # Write output
    print(f"\n💾 Generating {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(quiz_data, f, indent=2, ensure_ascii=False)

    total_stars = sum(len(data['stars']) for data in quiz_data.values())
    total_lines = sum(len(data['lines']) for data in quiz_data.values())

    print(f"✅ Successfully generated {output_path}")
    print(f"   Constellations: {success_count}/{len(constellation_lines)}")
    print(f"   Total stars: {total_stars}")
    print(f"   Total line segments: {total_lines}")

    # Print hemisphere/difficulty breakdown
    hemispheres = {"north": 0, "south": 0, "both": 0}
    difficulties = {"easy": 0, "medium": 0, "hard": 0}

    for data in quiz_data.values():
        hemispheres[data['hemisphere']] += 1
        difficulties[data['difficulty']] += 1

    print(f"\n📊 Breakdown:")
    print(f"   North: {hemispheres['north']}, South: {hemispheres['south']}, Both: {hemispheres['both']}")
    print(f"   Easy: {difficulties['easy']}, Medium: {difficulties['medium']}, Hard: {difficulties['hard']}")

    print("\n" + "=" * 70)
    print("✨ QUIZ DATA BUILD COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    build_quiz_data("data/constellations_quiz.json")
