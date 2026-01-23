#!/usr/bin/env python3
"""
Build Constellation Quiz Data
Consolidated script to generate quiz-ready constellation data from raw source files.

Input:
- data/raw/name.fab (Stellarium Bayer designations)
- data/raw/IAU_Star_Catalog.csv (Star proper names)
- data/raw/constellationship.fab (Constellation line connections)
- data/raw/constellation_abbreviations.json (Constellation names)
- data/raw/constellation_english.json (English translations)
- data/raw/bound_in_20.txt (IAU constellation boundaries)
- Hipparcos catalog (via Skyfield, cached at data/raw/hip_main.dat)

Output:
- data/constellation_data.json (Complete quiz-ready data with metadata)
- data/stars_visible.json (Naked-eye visible stars, mag ≤ 6.5)
- data/stars_all.json (All Hipparcos stars, ~118k stars)
- data/background_stars_visible.json (Pre-projected background stars per constellation)
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


def angular_distance(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """
    Calculate angular distance in degrees between two celestial coordinates using haversine formula.

    Args:
        ra1, dec1: First coordinate (RA in hours, Dec in degrees)
        ra2, dec2: Second coordinate (RA in hours, Dec in degrees)

    Returns:
        Angular distance in degrees
    """
    ra1_rad = math.radians(ra1 * 15)  # Convert RA hours to degrees then radians
    dec1_rad = math.radians(dec1)
    ra2_rad = math.radians(ra2 * 15)
    dec2_rad = math.radians(dec2)

    dlat = dec2_rad - dec1_rad
    dlon = ra2_rad - ra1_rad

    a = math.sin(dlat/2)**2 + math.cos(dec1_rad) * math.cos(dec2_rad) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))

    return math.degrees(c)


def normalize_circular_region(
    constellation_stars: Dict,
    projection_type: str,
    ra_center: float,
    dec_center: float
) -> Tuple[List[Tuple[float, float]], Dict]:
    """
    Normalize constellation stars using circular region approach.

    This creates a symmetric coordinate system centered at (0.5, 0.5) where:
    - Constellation center is at (0.5, 0.5)
    - Max radius (furthest star) maps to ~0.4 canvas units
    - Padding of 100% (2x radius) ensures background stars fit evenly

    Args:
        constellation_stars: Dict of {hip_id: star_data} with 'ra', 'dec', 'x_proj', 'y_proj'
        projection_type: 'stereographic', 'polar_north', or 'polar_south'
        ra_center: RA center for stereographic projection (hours)
        dec_center: Dec center for stereographic projection (degrees)

    Returns:
        Tuple of (normalized_coords, normalization_params)
        - normalized_coords: List of (norm_x, norm_y) tuples
        - normalization_params: Dict with center, radius, scale for reuse
    """
    if not constellation_stars:
        return [], {}

    # 1. Calculate constellation center (mean RA/Dec)
    ras = [star['ra'] for star in constellation_stars.values()]
    decs = [star['dec'] for star in constellation_stars.values()]
    center_ra = sum(ras) / len(ras)
    center_dec = sum(decs) / len(decs)

    # 2. Find max radius from center to furthest constellation star
    max_radius = 0.0
    for star in constellation_stars.values():
        dist = angular_distance(center_ra, center_dec, star['ra'], star['dec'])
        max_radius = max(max_radius, dist)

    # 3. Add 100% padding (2x radius) for background star region
    padded_radius = max_radius * 2.0

    # 4. Project center point
    if projection_type == 'polar_north':
        center_x_proj, center_y_proj = polar_stereographic_projection(center_ra, center_dec, pole='north')
    elif projection_type == 'polar_south':
        center_x_proj, center_y_proj = polar_stereographic_projection(center_ra, center_dec, pole='south')
    else:  # stereographic
        center_x_proj, center_y_proj = stereographic_projection(center_ra, center_dec, ra_center, dec_center)

    # 5. Calculate scale factor: map max_radius degrees to ~0.4 canvas units
    # This makes constellation fill ~80% of canvas (0.4 * 2 = 0.8)
    # Background stars (at padded_radius = 2x max_radius) extend beyond canvas edges
    # This "square inside circle" approach allows rotation without losing background stars
    if projection_type in ['polar_north', 'polar_south']:
        # Polar projections: radius ~= 2 * tan(0.5 * angular_dist)
        projected_max_radius = 2.0 * math.tan(math.radians(max_radius / 2.0))
    else:
        # Stereographic: radius ~= 2 * tan(0.5 * angular_dist)
        projected_max_radius = 2.0 * math.tan(math.radians(max_radius / 2.0))

    scale = 0.4 / max(projected_max_radius, 0.1)  # Map to 0.4 canvas units, min 0.1 to prevent division issues

    # 6. Normalize all constellation stars
    normalized = []
    for star in constellation_stars.values():
        norm_x, norm_y = apply_circular_normalization(
            star['x_proj'], star['y_proj'], center_x_proj, center_y_proj, scale
        )
        normalized.append((norm_x, norm_y))

    # Return normalization parameters for reuse in background stars
    normalization_params = {
        'center_ra': center_ra,
        'center_dec': center_dec,
        'max_radius': max_radius,
        'padded_radius': padded_radius,
        'center_x_proj': center_x_proj,
        'center_y_proj': center_y_proj,
        'scale': scale
    }

    return normalized, normalization_params


def apply_circular_normalization(x_proj: float, y_proj: float, center_x_proj: float, center_y_proj: float, scale: float) -> Tuple[float, float]:
    """
    Apply circular normalization to a projected coordinate.

    Args:
        x_proj, y_proj: Projected coordinates
        center_x_proj, center_y_proj: Projected center point
        scale: Scale factor

    Returns:
        Tuple of (norm_x, norm_y) normalized coordinates
    """
    # Translate so center is at origin
    dx = x_proj - center_x_proj
    dy = y_proj - center_y_proj

    # Scale and translate to center at (0.5, 0.5)
    norm_x = 0.5 + dx * scale
    norm_y = 0.5 + dy * scale

    return norm_x, norm_y


# ==================== RAW DATA PARSERS ====================

def parse_constellation_boundaries(filepath: str) -> Dict[str, List[List[float]]]:
    """
    Parse IAU constellation boundary file (J2000.0 coordinates).

    Format: RA(hours) Dec(degrees) ABBREV

    Returns:
        Dict mapping constellation abbreviation to list of [ra, dec] vertices
    """
    print(f"📖 Reading constellation boundaries from {filepath}...")

    boundaries = {}
    current_abbrev = None
    current_vertices = []

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts = line.split()
            if len(parts) != 3:
                continue

            ra = float(parts[0])
            dec = float(parts[1])
            abbrev = parts[2].upper()

            # If we've moved to a new constellation, save the previous one
            if abbrev != current_abbrev:
                if current_abbrev and current_vertices:
                    boundaries[current_abbrev] = current_vertices
                current_abbrev = abbrev
                current_vertices = []

            current_vertices.append([round(ra, 6), round(dec, 6)])

        # Save the last constellation
        if current_abbrev and current_vertices:
            boundaries[current_abbrev] = current_vertices

    print(f"✅ Loaded boundaries for {len(boundaries)} constellations")
    total_vertices = sum(len(v) for v in boundaries.values())
    print(f"   Total vertices: {total_vertices}")

    return boundaries


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


def load_english_names(filepath: str) -> Dict[str, str]:
    """Load English translations/meanings for constellation names."""
    print(f"📖 Reading {filepath}...")

    with open(filepath, "r", encoding="utf-8") as f:
        english_names = json.load(f)

    print(f"✅ Loaded {len(english_names)} English constellation names")
    return english_names


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
    english_names = load_english_names("data/raw/constellation_english.json")
    hipparcos_data = load_hipparcos_data()
    boundaries = parse_constellation_boundaries("data/raw/bound_in_20.txt")

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

            # Normalize coordinates using circular region approach
            normalized_coords, normalization_params = normalize_circular_region(
                constellation_stars, projection_type, ra_center, dec_center
            )

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
                    'ra': round(star['ra'], 4),    # Global RA in hours (for sky view)
                    'dec': round(star['dec'], 4),  # Global Dec in degrees (for sky view)
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
            # Get IAU boundary polygon for this constellation
            boundary = boundaries.get(abbrev.upper(), [])

            quiz_data[abbrev] = {
                'name': name,
                'name_english': english_names.get(name, name),  # English translation/meaning
                'abbrev': abbrev,
                'hemisphere': hemisphere,
                'difficulty': difficulty,
                'seasons': seasons,
                'ra_center': round(ra_center, 2),
                'dec_center': round(dec_center, 2),
                'projection_type': projection_type,
                'stars': star_array,
                'lines': line_indices,
                'boundary': boundary  # IAU boundary polygon [[ra, dec], ...]
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


def generate_star_catalogs(hipparcos_data: Dict[int, Dict], iau_stars: Dict[int, Dict[str, str]]):
    """Generate separate star catalog files for background stars."""
    print("\n" + "=" * 70)
    print("GENERATING STAR CATALOGS")
    print("=" * 70)
    print()

    # Generate visible stars (mag <= 6.5)
    print("📖 Building visible stars catalog (mag ≤ 6.5)...")
    visible_stars = []

    for hip_id, hip_data in hipparcos_data.items():
        mag = hip_data.get('magnitude')
        ra = hip_data.get('ra')
        dec = hip_data.get('dec')

        # Skip if no magnitude or coordinates
        if mag is None or ra is None or dec is None:
            continue

        # Filter by magnitude
        if mag <= 6.5:
            # Simple equatorial projection: x = RA/24, y = (Dec+90)/180
            x = ra / 24.0
            y = (dec + 90) / 180.0

            star_entry = {
                'hip': str(hip_id),
                'x': round(x, 6),
                'y': round(y, 6),
                'mag': round(mag, 2)
            }

            # Add name if this is a famous star
            iau_data = iau_stars.get(hip_id, {})
            if iau_data.get('name'):
                star_entry['name'] = iau_data['name']

            visible_stars.append(star_entry)

    # Sort by magnitude (brightest first)
    visible_stars.sort(key=lambda s: s['mag'])

    # Write visible stars
    output_path = "data/stars_visible.json"
    print(f"💾 Writing {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(visible_stars, f, indent=2, ensure_ascii=False)

    named_count = sum(1 for s in visible_stars if 'name' in s)
    print(f"✅ Generated {output_path}")
    print(f"   Total stars: {len(visible_stars)}")
    print(f"   Named stars: {named_count}")
    print(f"   File size: ~{len(json.dumps(visible_stars)) / 1024:.0f} KB")

    # Generate all stars catalog
    print(f"\n📖 Building complete star catalog (all Hipparcos stars)...")
    all_stars = []

    for hip_id, hip_data in hipparcos_data.items():
        mag = hip_data.get('magnitude')
        ra = hip_data.get('ra')
        dec = hip_data.get('dec')

        # Skip if no coordinates (magnitude can be missing)
        if ra is None or dec is None:
            continue

        # Simple equatorial projection
        x = ra / 24.0
        y = (dec + 90) / 180.0

        star_entry = {
            'hip': str(hip_id),
            'x': round(x, 6),
            'y': round(y, 6)
        }

        # Add magnitude if available
        if mag is not None:
            star_entry['mag'] = round(mag, 2)

        # Add name if this is a famous star
        iau_data = iau_stars.get(hip_id, {})
        if iau_data.get('name'):
            star_entry['name'] = iau_data['name']

        all_stars.append(star_entry)

    # Sort by magnitude (brightest first, nulls last)
    all_stars.sort(key=lambda s: s.get('mag', 99))

    # Write all stars
    output_path = "data/stars_all.json"
    print(f"💾 Writing {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_stars, f, indent=2, ensure_ascii=False)

    named_count = sum(1 for s in all_stars if 'name' in s)
    print(f"✅ Generated {output_path}")
    print(f"   Total stars: {len(all_stars)}")
    print(f"   Named stars: {named_count}")
    print(f"   File size: ~{len(json.dumps(all_stars)) / 1024:.0f} KB")

    print("\n" + "=" * 70)
    print("✨ STAR CATALOGS COMPLETE!")
    print("=" * 70)


def generate_background_stars_for_constellations(constellation_data_path: str, stars_visible_path: str, stars_all_path: str):
    """Generate background stars for each constellation using correct projections."""
    print("\n" + "=" * 70)
    print("GENERATING BACKGROUND STARS PER CONSTELLATION")
    print("=" * 70)
    print()

    # Load constellation data
    print("📖 Loading constellation data...")
    with open(constellation_data_path, 'r', encoding='utf-8') as f:
        constellations = json.load(f)
    print(f"✅ Loaded {len(constellations)} constellations")

    # Load star catalogs
    print("📖 Loading visible stars catalog...")
    with open(stars_visible_path, 'r', encoding='utf-8') as f:
        stars_visible = json.load(f)
    print(f"✅ Loaded {len(stars_visible)} visible stars")

    print("📖 Loading all stars catalog...")
    with open(stars_all_path, 'r', encoding='utf-8') as f:
        stars_all = json.load(f)
    print(f"✅ Loaded {len(stars_all)} total stars")

    # Convert star arrays to dictionaries for lookups
    stars_visible_dict = {int(s['hip']): s for s in stars_visible}
    stars_all_dict = {int(s['hip']): s for s in stars_all}

    # Load Hipparcos data for RA/Dec
    hipparcos_data = load_hipparcos_data()

    # Process each constellation
    background_visible = {}
    background_all = {}

    for abbrev, const in sorted(constellations.items()):
        name = const['name']
        ra_center = const['ra_center']
        dec_center = const['dec_center']
        projection_type = const['projection_type']

        # First, get RA/Dec coordinates of all constellation stars
        const_ra_dec = []
        const_projected = []
        for star in const['stars']:
            hip_id = int(star['hip'])
            if hip_id not in hipparcos_data:
                continue
            hip_data = hipparcos_data[hip_id]
            ra = hip_data.get('ra')
            dec = hip_data.get('dec')
            if ra is None or dec is None:
                continue

            const_ra_dec.append((ra, dec))

            # Also project for later use
            if projection_type == 'polar_north':
                x_proj, y_proj = polar_stereographic_projection(ra, dec, pole='north')
            elif projection_type == 'polar_south':
                x_proj, y_proj = polar_stereographic_projection(ra, dec, pole='south')
            else:  # stereographic
                x_proj, y_proj = stereographic_projection(ra, dec, ra_center, dec_center)

            const_projected.append((x_proj, y_proj, ra, dec))

        if not const_ra_dec:
            print(f"⚠️  {abbrev:4s} - {name:25s} (no constellation stars to establish bounds)")
            background_visible[abbrev] = []
            background_all[abbrev] = []
            continue

        # CIRCULAR REGION APPROACH:
        # 1. Calculate constellation center (mean RA/Dec)
        center_ra = sum(ra for ra, dec in const_ra_dec) / len(const_ra_dec)
        center_dec = sum(dec for ra, dec in const_ra_dec) / len(const_ra_dec)

        # 2. Find max radius from center to furthest constellation star
        max_radius = 0.0
        for ra, dec in const_ra_dec:
            dist = angular_distance(center_ra, center_dec, ra, dec)
            max_radius = max(max_radius, dist)

        # 3. Add 100% padding (2x radius) for background star region
        padded_radius = max_radius * 2.0

        # 4. Set up normalization:
        # - Project center point
        if projection_type == 'polar_north':
            center_x_proj, center_y_proj = polar_stereographic_projection(center_ra, center_dec, pole='north')
        elif projection_type == 'polar_south':
            center_x_proj, center_y_proj = polar_stereographic_projection(center_ra, center_dec, pole='south')
        else:
            center_x_proj, center_y_proj = stereographic_projection(center_ra, center_dec, ra_center, dec_center)

        # - Calculate scale factor: map max_radius degrees to ~0.4 canvas units
        # This makes constellation fill ~80% of canvas (0.4 * 2 = 0.8)
        # Background stars (at padded_radius = 2x max_radius) extend beyond canvas edges
        # This "square inside circle" approach allows rotation without losing background stars
        if projection_type in ['polar_north', 'polar_south']:
            # Polar projections: radius ~= 2 * tan(0.5 * angular_dist)
            projected_max_radius = 2.0 * math.tan(math.radians(max_radius / 2.0))
        else:
            # Stereographic: radius ~= 2 * tan(0.5 * angular_dist)
            projected_max_radius = 2.0 * math.tan(math.radians(max_radius / 2.0))

        scale = 0.4 / max(projected_max_radius, 0.1)  # Map to 0.4 canvas units, min 0.1 to prevent division issues

        # Process background stars for visible catalog only
        # DEPRECATED: All-stars mode commented out due to 97MB file size (too large for browsers)
        # To re-enable: uncomment the ('all', stars_all_dict, background_all) line below
        for catalog_name, star_dict, output_dict in [
            ('visible', stars_visible_dict, background_visible),
            # ('all', stars_all_dict, background_all)  # DEPRECATED: 97MB too large
        ]:
            bg_stars = []

            for hip_id, star in star_dict.items():
                if hip_id not in hipparcos_data:
                    continue
                hip_data = hipparcos_data[hip_id]
                ra = hip_data.get('ra')
                dec = hip_data.get('dec')
                mag = star.get('mag')

                if ra is None or dec is None or mag is None:
                    continue

                # CIRCULAR REGION FILTERING:
                # Only include stars within padded_radius from constellation center
                dist_from_center = angular_distance(center_ra, center_dec, ra, dec)
                if dist_from_center > padded_radius:
                    continue

                # Project star using constellation's projection
                if projection_type == 'polar_north':
                    x_proj, y_proj = polar_stereographic_projection(ra, dec, pole='north')
                elif projection_type == 'polar_south':
                    x_proj, y_proj = polar_stereographic_projection(ra, dec, pole='south')
                else:
                    x_proj, y_proj = stereographic_projection(ra, dec, ra_center, dec_center)

                # Normalize using circular coordinates (same approach as constellation stars)
                norm_x, norm_y = apply_circular_normalization(x_proj, y_proj, center_x_proj, center_y_proj, scale)

                # Only include stars that fall within visible area (0-1 range with some tolerance)
                if -0.1 <= norm_x <= 1.1 and -0.1 <= norm_y <= 1.1:
                    bg_stars.append({
                        'hip': str(hip_id),
                        'x': round(norm_x, 6),
                        'y': round(norm_y, 6),
                        'mag': round(mag, 2)
                    })

            output_dict[abbrev] = bg_stars

        visible_count = len(background_visible[abbrev])
        print(f"✅ {abbrev:4s} - {name:25s} ({visible_count} background stars)")

    # Write output files
    print(f"\n💾 Writing data/background_stars_visible.json...")
    with open("data/background_stars_visible.json", 'w', encoding='utf-8') as f:
        json.dump(background_visible, f, indent=2, ensure_ascii=False)

    total_visible = sum(len(stars) for stars in background_visible.values())
    print(f"✅ Generated data/background_stars_visible.json")
    print(f"   Total background stars: {total_visible}")
    print(f"   File size: ~{len(json.dumps(background_visible)) / 1024:.0f} KB")

    # DEPRECATED: All-stars mode commented out due to 97MB file size
    # print(f"\n💾 Writing data/background_stars_all.json...")
    # with open("data/background_stars_all.json", 'w', encoding='utf-8') as f:
    #     json.dump(background_all, f, indent=2, ensure_ascii=False)
    #
    # total_all = sum(len(stars) for stars in background_all.values())
    # print(f"✅ Generated data/background_stars_all.json")
    # print(f"   Total background stars: {total_all}")
    # print(f"   File size: ~{len(json.dumps(background_all)) / 1024:.0f} KB")

    print("\n" + "=" * 70)
    print("✨ BACKGROUND STARS GENERATION COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    # Build main quiz data
    build_quiz_data("data/constellation_data.json")

    # Load data for star catalogs
    print("\n")
    iau_stars = parse_iau_catalog("data/raw/IAU_Star_Catalog.csv")
    hipparcos_data = load_hipparcos_data()

    # Generate star catalogs
    generate_star_catalogs(hipparcos_data, iau_stars)

    # Generate background stars for constellations
    generate_background_stars_for_constellations(
        "data/constellation_data.json",
        "data/stars_visible.json",
        "data/stars_all.json"
    )
