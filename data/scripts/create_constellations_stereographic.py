#!/usr/bin/env python3
"""
Create Stereographic Projection Data for Constellation Quiz
Generates pre-projected constellation coordinates for fast web rendering.

Input files:
- data/stars.json: Star catalog with RA/Dec coordinates
- data/constellations.json: Constellation line connections (HIP ID pairs)

Output:
- data/constellations_stereographic.json: Self-contained constellation data
  with stereographic-projected x,y coordinates ready for rendering
"""

import json
import math
from typing import Dict, List, Tuple


def stereographic_projection(ra: float, dec: float, ra_center: float, dec_center: float) -> Tuple[float, float]:
    """
    Project celestial coordinates using stereographic projection centered at (ra_center, dec_center).

    Stereographic projection is conformal (preserves angles) and is the standard for star charts.
    It shows constellation shapes accurately without the angular distortion of gnomonic projection.

    Args:
        ra, dec: Star position in hours and degrees
        ra_center, dec_center: Center of projection in hours and degrees

    Returns:
        (x, y) projected coordinates (unitless, centered at origin)
    """
    # Convert to radians
    ra_rad = math.radians(ra * 15)  # Hours to degrees to radians
    dec_rad = math.radians(dec)
    ra0_rad = math.radians(ra_center * 15)
    dec0_rad = math.radians(dec_center)

    # Calculate angular distance from center
    cos_c = (math.sin(dec0_rad) * math.sin(dec_rad) +
             math.cos(dec0_rad) * math.cos(dec_rad) * math.cos(ra_rad - ra0_rad))

    # Stereographic projection scale factor: k = 2 / (1 + cos_c)
    # This ensures shapes and angles are preserved
    k = 2.0 / (1.0 + cos_c)

    # Stereographic projection formulas
    x = k * math.cos(dec_rad) * math.sin(ra_rad - ra0_rad)
    y = k * (math.cos(dec0_rad) * math.sin(dec_rad) -
             math.sin(dec0_rad) * math.cos(dec_rad) * math.cos(ra_rad - ra0_rad))

    # Flip x-axis: RA increases eastward, but on sky charts east is LEFT when looking up
    return -x, y


def polar_stereographic_projection(ra: float, dec: float, pole: str = 'north') -> Tuple[float, float]:
    """
    Project celestial coordinates using polar stereographic projection from the celestial pole.

    This projection is optimal for circumpolar constellations, eliminating the scale
    distortion that occurs when projecting from the constellation center.

    Args:
        ra, dec: Star position in hours and degrees
        pole: 'north' for north polar projection (Dec=+90), 'south' for south polar (Dec=-90)

    Returns:
        (x, y) projected coordinates (unitless, centered at pole)
    """
    # Convert to radians
    ra_rad = math.radians(ra * 15)  # Hours to degrees to radians
    dec_rad = math.radians(dec)

    # Polar stereographic projection from celestial pole
    # For north pole: project from Dec=90°, for south pole: from Dec=-90°
    if pole == 'south':
        # South polar: mirror declination
        dec_rad = -dec_rad

    # Polar stereographic scale factor: k = 2 / (1 + sin(dec))
    k = 2.0 / (1.0 + math.sin(dec_rad))

    # Polar coordinates
    x = k * math.cos(dec_rad) * math.sin(ra_rad)
    y = -k * math.cos(dec_rad) * math.cos(ra_rad)  # Negative to match sky chart orientation

    return -x, y  # Flip x for east-left orientation


def load_data(stars_path: str, constellations_path: str) -> Tuple[Dict, Dict]:
    """Load stars and constellations JSON data."""
    print("📖 Loading data...")

    with open(stars_path, 'r', encoding='utf-8') as f:
        stars = json.load(f)

    with open(constellations_path, 'r', encoding='utf-8') as f:
        constellations = json.load(f)

    print(f"✅ Loaded {len(stars)} stars and {len(constellations)} constellations")
    return stars, constellations


def normalize_coordinates(coords: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
    """
    Normalize projected coordinates to 0-1 range while preserving aspect ratio.

    Args:
        coords: List of (x, y) projected coordinates

    Returns:
        List of (x, y) normalized to 0-1 range
    """
    if not coords:
        return []

    xs = [x for x, y in coords]
    ys = [y for x, y in coords]

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    # Add 10% padding
    x_range = x_max - x_min
    y_range = y_max - y_min

    # Handle single-star or very small constellations
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

    # Normalize to 0-1
    normalized = []
    for x, y in coords:
        norm_x = (x - x_min) / (x_max - x_min)
        norm_y = (y - y_min) / (y_max - y_min)
        normalized.append((norm_x, norm_y))

    return normalized


def process_constellation(constellation_abbrev: str, constellation_data: Dict, stars: Dict) -> Dict:
    """
    Process a single constellation: project stars and build output structure.

    Args:
        constellation_abbrev: 3-letter constellation code (e.g., "Ori")
        constellation_data: Dict with 'name' and 'lines' keys
        stars: Full star catalog

    Returns:
        Dict with processed constellation data ready for JSON output
    """
    lines = constellation_data['lines']
    name = constellation_data['name']

    # Collect all unique stars in this constellation
    constellation_stars = {}
    ras = []
    decs = []

    for line in lines:
        for hip_id in [str(line[0]), str(line[1])]:
            if hip_id in stars and stars[hip_id].get('ra') is not None:
                star = stars[hip_id]
                constellation_stars[hip_id] = {
                    'ra': star['ra'],
                    'dec': star['dec'],
                    'bayer': star.get('bayer'),
                    'name': star.get('name'),
                    'magnitude': star.get('magnitude') or 99
                }
                ras.append(star['ra'])
                decs.append(star['dec'])

    if not constellation_stars:
        return None

    # Calculate center point of constellation
    ra_center = sum(ras) / len(ras)
    dec_center = sum(decs) / len(decs)

    # Detect circumpolar constellations and use appropriate projection
    is_north_circumpolar = dec_center > 60
    is_south_circumpolar = dec_center < -60

    # Project all stars using appropriate projection
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

    # Normalize coordinates to 0-1 range
    normalized_coords = normalize_coordinates(projected_coords)

    # Update star coordinates with normalized values
    for (hip_id, star), (norm_x, norm_y) in zip(constellation_stars.items(), normalized_coords):
        star['x'] = round(norm_x, 6)
        star['y'] = round(norm_y, 6)

    # Build star array with indices for line references
    hip_to_index = {hip_id: idx for idx, hip_id in enumerate(constellation_stars.keys())}
    star_array = []

    for hip_id, star in constellation_stars.items():
        star_entry = {
            'hip': hip_id,
            'x': star['x'],
            'y': star['y'],
            'magnitude': star['magnitude'] if star['magnitude'] != 99 else None
        }

        # Add optional fields if available
        if star['bayer']:
            star_entry['bayer'] = star['bayer']
        if star['name']:
            star_entry['name'] = star['name']

        star_array.append(star_entry)

    # Convert line HIP IDs to array indices
    line_indices = []
    for line in lines:
        hip1, hip2 = str(line[0]), str(line[1])
        if hip1 in hip_to_index and hip2 in hip_to_index:
            line_indices.append([hip_to_index[hip1], hip_to_index[hip2]])

    return {
        'name': name,
        'abbrev': constellation_abbrev,
        'projection_type': projection_type,
        'stars': star_array,
        'lines': line_indices
    }


def generate_stereographic_json(output_path: str, stars: Dict, constellations: Dict) -> None:
    """Generate JSON file with stereographic-projected constellation data."""
    print(f"\n🎨 Processing {len(constellations)} constellations...")

    output_data = {}
    success_count = 0

    for abbrev, constellation_data in sorted(constellations.items()):
        name = constellation_data['name']

        try:
            result = process_constellation(abbrev, constellation_data, stars)

            if result:
                output_data[abbrev] = result
                print(f"✅ {abbrev:4s} - {name:25s} ({len(result['stars'])} stars, {len(result['lines'])} lines, {result['projection_type']})")
                success_count += 1
            else:
                print(f"⚠️  {abbrev:4s} - {name:25s} (no valid stars)")

        except Exception as e:
            print(f"❌ {abbrev:4s} - {name:25s}: {str(e)}")

    # Write output file
    print(f"\n💾 Generating {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    total_stars = sum(len(data['stars']) for data in output_data.values())
    total_lines = sum(len(data['lines']) for data in output_data.values())

    print(f"✅ Successfully generated {output_path}")
    print(f"   Constellations: {success_count}/{len(constellations)}")
    print(f"   Total stars: {total_stars}")
    print(f"   Total line segments: {total_lines}")


def main():
    """Main execution function."""
    print("=" * 70)
    print("CONSTELLATION QUIZ - STEREOGRAPHIC PROJECTION DATA GENERATION")
    print("=" * 70)
    print()

    # Load data
    stars, constellations = load_data("data/stars.json", "data/constellations.json")

    # Generate stereographic projection data
    generate_stereographic_json("data/constellations_stereographic.json", stars, constellations)

    print("\n" + "=" * 70)
    print("✨ STEREOGRAPHIC PROJECTION DATA GENERATION COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    main()
