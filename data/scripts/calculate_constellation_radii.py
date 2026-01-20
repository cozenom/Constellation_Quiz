#!/usr/bin/env python3
"""
Calculate constellation radii from center to furthest star.
This helps determine parameters for circular region background star selection.
"""

import json
import math
from pathlib import Path


def angular_distance(ra1, dec1, ra2, dec2):
    """Calculate angular distance in degrees using haversine formula."""
    ra1_rad = math.radians(ra1 * 15)  # Convert RA hours to degrees then radians
    dec1_rad = math.radians(dec1)
    ra2_rad = math.radians(ra2 * 15)
    dec2_rad = math.radians(dec2)

    dlat = dec2_rad - dec1_rad
    dlon = ra2_rad - ra1_rad

    a = math.sin(dlat/2)**2 + math.cos(dec1_rad) * math.cos(dec2_rad) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))

    return math.degrees(c)


def load_hipparcos_catalog(catalog_path: str):
    """Load Hipparcos catalog and return dict keyed by HIP ID."""
    print(f"📖 Loading Hipparcos catalog from {catalog_path}...")

    hipparcos = {}
    with open(catalog_path, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split('|')
            if len(parts) < 9:
                continue

            try:
                hip_id = parts[1].strip()
                ra_deg = float(parts[3].strip())  # RA in degrees
                dec_deg = float(parts[4].strip())  # Dec in degrees
                magnitude = float(parts[5].strip())

                # Convert RA from degrees to hours
                ra_hours = ra_deg / 15.0

                hipparcos[hip_id] = {
                    'ra': ra_hours,
                    'dec': dec_deg,
                    'magnitude': magnitude
                }
            except (ValueError, IndexError):
                continue

    print(f"✅ Loaded {len(hipparcos)} stars from Hipparcos catalog")
    return hipparcos


def calculate_constellation_radii(constellation_data_path: str, hipparcos_catalog_path: str):
    """Calculate radius for each constellation (center to furthest star)."""

    # Load data
    with open(constellation_data_path, 'r', encoding='utf-8') as f:
        constellations = json.load(f)

    hipparcos = load_hipparcos_catalog(hipparcos_catalog_path)

    print(f"\n📐 Calculating radii for {len(constellations)} constellations...\n")

    results = []

    for abbrev, const_data in sorted(constellations.items()):
        name = const_data['name']
        stars = const_data['stars']

        if not stars:
            continue

        # Get RA/Dec for all constellation stars
        star_coords = []
        for star in stars:
            hip_id = str(star.get('hip', ''))
            if hip_id in hipparcos:
                hip_data = hipparcos[hip_id]
                star_coords.append((hip_data['ra'], hip_data['dec']))

        if len(star_coords) < 2:
            continue

        # Calculate center (mean RA/Dec)
        mean_ra = sum(ra for ra, dec in star_coords) / len(star_coords)
        mean_dec = sum(dec for ra, dec in star_coords) / len(star_coords)

        # Calculate max distance from center to any star
        max_radius = 0.0
        for ra, dec in star_coords:
            dist = angular_distance(mean_ra, mean_dec, ra, dec)
            max_radius = max(max_radius, dist)

        results.append({
            'abbrev': abbrev,
            'name': name,
            'radius_deg': max_radius,
            'num_stars': len(star_coords),
            'center_ra': mean_ra,
            'center_dec': mean_dec
        })

    # Sort by radius
    results.sort(key=lambda x: x['radius_deg'])

    # Print statistics
    print("=" * 80)
    print("CONSTELLATION RADII ANALYSIS")
    print("=" * 80)
    print()

    radii = [r['radius_deg'] for r in results]
    print(f"Total constellations analyzed: {len(results)}")
    print(f"Smallest radius: {min(radii):.2f}°")
    print(f"Largest radius:  {max(radii):.2f}°")
    print(f"Mean radius:     {sum(radii)/len(radii):.2f}°")
    print(f"Median radius:   {sorted(radii)[len(radii)//2]:.2f}°")
    print()

    # Show smallest 10
    print("=" * 80)
    print("SMALLEST 10 CONSTELLATIONS (by radius)")
    print("=" * 80)
    print(f"{'Abbrev':<6} {'Name':<25} {'Radius (°)':<12} {'Stars':<8} {'With 100% Padding (°)'}")
    print("-" * 80)
    for r in results[:10]:
        padded_radius = r['radius_deg'] * 2.0
        print(f"{r['abbrev']:<6} {r['name']:<25} {r['radius_deg']:>10.2f}   {r['num_stars']:>6}   {padded_radius:>18.2f}")
    print()

    # Show largest 10
    print("=" * 80)
    print("LARGEST 10 CONSTELLATIONS (by radius)")
    print("=" * 80)
    print(f"{'Abbrev':<6} {'Name':<25} {'Radius (°)':<12} {'Stars':<8} {'With 100% Padding (°)'}")
    print("-" * 80)
    for r in results[-10:]:
        padded_radius = r['radius_deg'] * 2.0
        print(f"{r['abbrev']:<6} {r['name']:<25} {r['radius_deg']:>10.2f}   {r['num_stars']:>6}   {padded_radius:>18.2f}")
    print()

    print("=" * 80)
    print("NOTE: 'With 100% Padding' means radius * 2 (e.g., padding = 1x the radius)")
    print("=" * 80)

    return results


def main():
    """Main execution."""
    constellation_data_path = "data/constellation_data.json"
    hipparcos_catalog_path = "data/raw/hip_main.dat"

    results = calculate_constellation_radii(constellation_data_path, hipparcos_catalog_path)

    # Save results
    output_path = "data/constellation_radii.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"\n💾 Saved detailed results to: {output_path}")


if __name__ == "__main__":
    main()
