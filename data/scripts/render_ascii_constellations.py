#!/usr/bin/env python3
"""
ASCII Constellation Renderer for Constellation Quiz
Generates ASCII art visualizations of all 88 constellations from JSON data.

Outputs:
- {abbrev}_with_lines.txt: Full constellation pattern with connecting lines
- {abbrev}_stars_only.txt: Just the stars (for quiz mode)

Uses actual Hipparcos star coordinates and Stellarium line connections.
"""

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple


def load_data(stars_path: str, constellations_path: str) -> Tuple[Dict, Dict]:
    """Load stars and constellations JSON data."""
    print("📖 Loading data...")

    with open(stars_path, 'r', encoding='utf-8') as f:
        stars = json.load(f)

    with open(constellations_path, 'r', encoding='utf-8') as f:
        constellations = json.load(f)

    print(f"✅ Loaded {len(stars)} stars and {len(constellations)} constellations")
    return stars, constellations


def draw_line_bresenham(canvas: List[List[str]], x1: int, y1: int, x2: int, y2: int,
                       width: int, height: int, char: str = '·'):
    """Draw a line on the canvas using Bresenham's algorithm."""
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy

    x, y = x1, y1

    while True:
        if 0 <= x < width and 0 <= y < height:
            if canvas[y][x] == ' ':
                canvas[y][x] = char

        if x == x2 and y == y2:
            break

        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x += sx
        if e2 < dx:
            err += dx
            y += sy


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


def render_constellation(constellation_abbrev: str, constellation_data: Dict,
                        stars: Dict, width: int = 70, height: int = 45,
                        with_lines: bool = True) -> Tuple[str, List[str]]:
    """
    Render a constellation as ASCII art.

    Returns:
        Tuple of (ascii_art_string, list_of_bright_star_info)
    """
    lines = constellation_data['lines']
    name = constellation_data['name']

    # Collect all unique stars in this constellation with their celestial coordinates
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
                    'bayer': star.get('bayer', '?'),
                    'name': star.get('name'),
                    'magnitude': star.get('magnitude') or 99
                }
                ras.append(star['ra'])
                decs.append(star['dec'])

    if not constellation_stars:
        return f"No valid stars found for {name}", []

    # Calculate center point of constellation
    ra_center = sum(ras) / len(ras)
    dec_center = sum(decs) / len(decs)

    # Detect circumpolar constellations and use appropriate projection
    # Circumpolar: average declination > 60° (north) or < -60° (south)
    is_north_circumpolar = dec_center > 60
    is_south_circumpolar = dec_center < -60

    # Project all stars using appropriate projection
    for hip_id, star in constellation_stars.items():
        if is_north_circumpolar:
            # Use polar projection from north celestial pole
            x_proj, y_proj = polar_stereographic_projection(star['ra'], star['dec'], pole='north')
        elif is_south_circumpolar:
            # Use polar projection from south celestial pole
            x_proj, y_proj = polar_stereographic_projection(star['ra'], star['dec'], pole='south')
        else:
            # Use standard stereographic projection centered on constellation
            x_proj, y_proj = stereographic_projection(star['ra'], star['dec'], ra_center, dec_center)

        star['x'] = x_proj
        star['y'] = y_proj

    # Find coordinate bounds (now using projected coordinates)
    x_coords = [s['x'] for s in constellation_stars.values()]
    y_coords = [s['y'] for s in constellation_stars.values()]
    x_min, x_max = min(x_coords), max(x_coords)
    y_min, y_max = min(y_coords), max(y_coords)

    # Add padding (10%)
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

    # Create canvas
    canvas = [[' ' for _ in range(width)] for _ in range(height)]

    def to_grid(x: float, y: float) -> Tuple[int, int]:
        """Convert normalized coordinates to grid position."""
        grid_x = int((x - x_min) / (x_max - x_min) * (width - 1))
        grid_y = int((1 - (y - y_min) / (y_max - y_min)) * (height - 1))  # Flip Y
        return grid_x, grid_y

    # Draw connecting lines first (if requested)
    if with_lines:
        for line in lines:
            hip1, hip2 = str(line[0]), str(line[1])
            if hip1 in constellation_stars and hip2 in constellation_stars:
                x1, y1 = to_grid(constellation_stars[hip1]['x'], constellation_stars[hip1]['y'])
                x2, y2 = to_grid(constellation_stars[hip2]['x'], constellation_stars[hip2]['y'])
                draw_line_bresenham(canvas, x1, y1, x2, y2, width, height)

    # Draw stars on top
    star_positions = {}
    for hip_id, star in constellation_stars.items():
        gx, gy = to_grid(star['x'], star['y'])
        if 0 <= gx < width and 0 <= gy < height:
            # Use different symbols based on magnitude (bigger/more visible symbols)
            mag = star['magnitude']
            if mag < 1.0:
                symbol = '⬤'  # Brightest (filled circle)
            elif mag < 2.5:
                symbol = '●'  # Bright (medium circle)
            elif mag < 4.0:
                symbol = '○'  # Medium (hollow circle)
            else:
                symbol = '∘'  # Dimmer (small hollow circle/ring)
            canvas[gy][gx] = symbol
            star_positions[hip_id] = (gx, gy)

    # Build output string
    separator = "=" * width
    output_lines = [
        f"{name.upper()} ({constellation_abbrev})",
        separator
    ]

    for row in canvas:
        output_lines.append(''.join(row))

    output_lines.append(separator)

    # Collect info about brightest stars for legend
    bright_stars = []
    # Sort by magnitude, treating None as very dim (99)
    sorted_stars = sorted(constellation_stars.items(),
                         key=lambda x: x[1]['magnitude'] if x[1]['magnitude'] is not None else 99)

    for hip_id, star in sorted_stars[:7]:  # Top 7 brightest
        if hip_id in star_positions:
            bayer = star['bayer'] or '?'
            name_str = star['name'] or 'unnamed'
            mag = star['magnitude']
            gx, gy = star_positions[hip_id]
            # Handle None magnitude
            mag_str = f"{mag:.2f}" if mag is not None else "N/A"
            # Handle None values in formatting
            try:
                bright_stars.append(f"  {bayer:10s} {name_str:15s} mag {mag_str}")
            except (TypeError, ValueError) as e:
                # Skip stars with formatting issues
                print(f"    Warning: Skipping HIP {hip_id} in legend ({e})")
                continue

    return '\n'.join(output_lines), bright_stars


def generate_all_constellations(stars: Dict, constellations: Dict,
                                output_dir: str):
    """Generate ASCII art for all 88 constellations."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    print(f"\n🎨 Generating ASCII art for {len(constellations)} constellations...")
    print(f"📁 Output directory: {output_dir}")
    print()

    success_count = 0
    errors = []

    for abbrev, constellation_data in sorted(constellations.items()):
        name = constellation_data['name']

        try:
            # Generate version with lines
            ascii_with_lines, bright_stars = render_constellation(
                abbrev, constellation_data, stars, with_lines=True
            )

            # Add legend
            full_output = ascii_with_lines
            if bright_stars:
                full_output += "\n\nBrightest Stars:\n" + '\n'.join(bright_stars)

            # Save with lines
            with_lines_file = output_path / f"{abbrev}_with_lines.txt"
            with open(with_lines_file, 'w', encoding='utf-8') as f:
                f.write(full_output)

            # Generate version without lines (stars only)
            ascii_stars_only, _ = render_constellation(
                abbrev, constellation_data, stars, with_lines=False
            )

            # Save stars only
            stars_only_file = output_path / f"{abbrev}_stars_only.txt"
            with open(stars_only_file, 'w', encoding='utf-8') as f:
                f.write(ascii_stars_only)

            print(f"✅ {abbrev:4s} - {name:25s} ({len(constellation_data['lines'])} lines)")
            success_count += 1

        except Exception as e:
            error_msg = f"❌ {abbrev} - {name}: {str(e)}"
            print(error_msg)
            errors.append(error_msg)

    print()
    print("=" * 70)
    print(f"✨ GENERATION COMPLETE!")
    print(f"   Successfully generated: {success_count}/{len(constellations)} constellations")
    print(f"   Total files created: {success_count * 2}")

    if errors:
        print(f"\n⚠️  Errors encountered: {len(errors)}")
        for error in errors:
            print(f"   {error}")
    else:
        print("\n✅ All constellations rendered successfully!")


def main():
    """Main execution function."""
    print("=" * 70)
    print("ASCII CONSTELLATION RENDERER")
    print("=" * 70)
    print()

    # File paths
    stars_path = "data/stars.json"
    constellations_path = "data/constellations.json"
    output_dir = "data/ascii_gallery"

    # Load data
    stars, constellations = load_data(stars_path, constellations_path)

    # Generate all constellations
    generate_all_constellations(stars, constellations, output_dir)

    print()
    print("=" * 70)
    print(f"📂 View your ASCII constellations in: {output_dir}/")
    print("   - *_with_lines.txt: Full constellation patterns")
    print("   - *_stars_only.txt: Just stars (for quiz mode)")
    print("=" * 70)


if __name__ == "__main__":
    main()
