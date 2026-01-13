#!/usr/bin/env python3
"""
Constellation Data Extraction Script for Constellation Quiz
Extracts constellation line connections from Stellarium data.

Input files:
- constellationship.fab: Constellation line connections (HIP star IDs)
- constellation_abbreviations.json: 3-letter codes to full names

Output:
- constellations.json: Constellation data with line connections as HIP ID pairs
"""

import json
from typing import Dict, List


def parse_constellationship_fab(filepath: str) -> Dict[str, List[List[int]]]:
    """
    Parse constellationship.fab file to extract constellation line connections.

    Format in file:
    <constellation_abbrev> <num_lines> <hip1> <hip2> <hip2> <hip3> ...

    Each pair of consecutive HIP IDs represents a line segment.

    Returns:
        Dictionary mapping constellation abbrev to list of line pairs
        e.g., {"Ori": [[27989, 24436], [24436, 25336], ...]}
    """
    constellations = {}
    print(f"📖 Reading {filepath}...")

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            parts = line.split()
            if len(parts) < 3:
                continue

            # Only parse lines that match constellation format: 3-letter abbrev followed by number
            # Example: "Ori 27 ..." or "CMa 12 ..." or "UMa 26 ..."
            if not (len(parts[0]) == 3 and parts[0][0].isupper() and parts[1].isdigit()):
                continue

            constellation_abbrev = parts[0]
            hip_ids = [int(hip) for hip in parts[2:]]

            # Create line pairs: each consecutive pair is a line segment
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


def merge_constellation_data(
    line_data: Dict[str, List[List[int]]], names: Dict[str, str]
) -> Dict[str, Dict]:
    """Merge constellation line data with names."""
    return {
        abbrev: {"name": names.get(abbrev, abbrev), "lines": lines}
        for abbrev, lines in line_data.items()
    }


def generate_constellation_json(output_filepath: str, constellation_data: Dict[str, Dict]) -> None:
    """Generate JSON file with constellation data."""
    print(f"\n💾 Generating {output_filepath}...")

    with open(output_filepath, "w", encoding="utf-8") as f:
        json.dump(constellation_data, f, indent=2, ensure_ascii=False)

    total_lines = sum(len(data["lines"]) for data in constellation_data.values())
    print(f"✅ Successfully generated {output_filepath}")
    print(f"   Total constellations: {len(constellation_data)}")
    print(f"   Total line segments: {total_lines}")


def main():
    """Main execution function."""
    print("=" * 70)
    print("CONSTELLATION QUIZ - CONSTELLATION DATA EXTRACTION")
    print("=" * 70)
    print()

    # Parse constellation line data
    line_data = parse_constellationship_fab("data/raw/constellationship.fab")

    # Load constellation names
    constellation_names = load_constellation_names("data/raw/constellation_abbreviations.json")

    # Merge data
    print("\n🔗 Merging constellation data...")
    constellation_data = merge_constellation_data(line_data, constellation_names)

    # Generate JSON
    generate_constellation_json("data/constellations.json", constellation_data)

    print("\n" + "=" * 70)
    print("✨ CONSTELLATION DATA EXTRACTION COMPLETE!")
    print("=" * 70)


if __name__ == "__main__":
    main()
