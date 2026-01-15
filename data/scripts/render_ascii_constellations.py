#!/usr/bin/env python3
"""
ASCII Constellation Renderer for Constellation Quiz
Generates ASCII art visualizations of all 88 constellations from pre-computed stereographic projection data.

Outputs:
- {abbrev}_with_lines.txt: Full constellation pattern with connecting lines
- {abbrev}_stars_only.txt: Just the stars (for quiz mode)

Uses pre-projected coordinates from constellations_quiz.json for consistent rendering.
"""

import json
from pathlib import Path
from typing import Dict, List, Tuple


def load_data(constellations_path: str) -> Dict:
    """Load pre-computed quiz constellation data with stereographic projections."""
    print("📖 Loading constellation quiz data...")

    with open(constellations_path, 'r', encoding='utf-8') as f:
        constellations = json.load(f)

    print(f"✅ Loaded {len(constellations)} constellations with quiz metadata and projections")
    return constellations


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


def render_constellation(constellation_abbrev: str, constellation_data: Dict,
                        width: int = 70, height: int = 45,
                        with_lines: bool = True) -> Tuple[str, List[str]]:
    """
    Render a constellation as ASCII art using pre-computed stereographic projections.

    Args:
        constellation_abbrev: 3-letter constellation code (e.g., "Ori")
        constellation_data: Dict with pre-computed x,y coordinates and lines
        width: Canvas width in characters
        height: Canvas height in characters
        with_lines: Whether to draw constellation lines

    Returns:
        Tuple of (ascii_art_string, list_of_bright_star_info)
    """
    name = constellation_data['name']
    stars = constellation_data['stars']
    lines = constellation_data['lines']

    if not stars:
        return f"No valid stars found for {name}", []

    # Create canvas
    canvas = [[' ' for _ in range(width)] for _ in range(height)]

    def to_grid(x: float, y: float) -> Tuple[int, int]:
        """Convert normalized 0-1 coordinates to grid position."""
        grid_x = int(x * (width - 1))
        grid_y = int((1 - y) * (height - 1))  # Flip Y for screen coordinates
        return grid_x, grid_y

    # Draw connecting lines first (if requested)
    if with_lines:
        for line_indices in lines:
            idx1, idx2 = line_indices
            if idx1 < len(stars) and idx2 < len(stars):
                star1 = stars[idx1]
                star2 = stars[idx2]
                x1, y1 = to_grid(star1['x'], star1['y'])
                x2, y2 = to_grid(star2['x'], star2['y'])
                draw_line_bresenham(canvas, x1, y1, x2, y2, width, height)

    # Draw stars on top
    # Star magnitude to symbol mapping (lower magnitude = brighter star):
    #   ⬤  mag < 1.0   (brightest stars: Sirius, Vega, Rigel, etc.)
    #   ●  mag 1.0-2.5 (bright stars, easily visible)
    #   ○  mag 2.5-4.0 (medium brightness)
    #   ∘  mag > 4.0   (dimmer stars, faint to naked eye)
    # Lines use · (middle dot) to distinguish from stars
    star_positions = {}
    for idx, star in enumerate(stars):
        gx, gy = to_grid(star['x'], star['y'])
        if 0 <= gx < width and 0 <= gy < height:
            mag = star.get('magnitude') or 99
            if mag < 1.0:
                symbol = '⬤'
            elif mag < 2.5:
                symbol = '●'
            elif mag < 4.0:
                symbol = '○'
            else:
                symbol = '∘'
            canvas[gy][gx] = symbol
            star_positions[idx] = (gx, gy)

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
    # Sort by magnitude
    sorted_stars_with_idx = sorted(
        enumerate(stars),
        key=lambda x: x[1].get('magnitude') or 99
    )

    for idx, star in sorted_stars_with_idx[:7]:  # Top 7 brightest
        if idx in star_positions:
            bayer = star.get('bayer', '?')
            name_str = star.get('name', 'unnamed')
            mag = star.get('magnitude')
            mag_str = f"{mag:.2f}" if mag is not None else "N/A"

            try:
                bright_stars.append(f"  {bayer:10s} {name_str:15s} mag {mag_str}")
            except (TypeError, ValueError) as e:
                # Skip stars with formatting issues
                print(f"    Warning: Skipping star in legend ({e})")
                continue

    return '\n'.join(output_lines), bright_stars


def generate_all_constellations(constellations: Dict, output_dir: str):
    """Generate ASCII art for all 88 constellations using pre-computed projections."""
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
                abbrev, constellation_data, with_lines=True
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
                abbrev, constellation_data, with_lines=False
            )

            # Save stars only
            stars_only_file = output_path / f"{abbrev}_stars_only.txt"
            with open(stars_only_file, 'w', encoding='utf-8') as f:
                f.write(ascii_stars_only)

            print(f"✅ {abbrev:4s} - {name:25s} ({len(constellation_data['stars'])} stars, {len(constellation_data['lines'])} lines)")
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
    constellations_path = "data/constellations_quiz.json"
    output_dir = "data/ascii_gallery"

    # Load data
    constellations = load_data(constellations_path)

    # Generate all constellations
    generate_all_constellations(constellations, output_dir)

    print()
    print("=" * 70)
    print(f"📂 View your ASCII constellations in: {output_dir}/")
    print("   - *_with_lines.txt: Full constellation patterns")
    print("   - *_stars_only.txt: Just stars (for quiz mode)")
    print("=" * 70)


if __name__ == "__main__":
    main()
