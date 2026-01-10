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
from pathlib import Path
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

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()

                # Skip empty lines and comments
                if not line or line.startswith("#"):
                    continue

                # Parse line: <abbrev> <num_segments> <hip1> <hip2> <hip2> <hip3> ...
                parts = line.split()

                if len(parts) < 3:
                    continue

                constellation_abbrev = parts[0]
                num_segments = int(parts[1])

                # Extract HIP IDs (starting from index 2)
                hip_ids = [int(hip) for hip in parts[2:]]

                # Create line pairs: each consecutive pair is a line segment
                lines = []
                for i in range(0, len(hip_ids), 2):
                    if i + 1 < len(hip_ids):
                        lines.append([hip_ids[i], hip_ids[i + 1]])

                constellations[constellation_abbrev] = lines

        print(f"✅ Parsed {len(constellations)} constellations")
        return constellations

    except FileNotFoundError:
        print(f"❌ Error: File {filepath} not found")
        return {}
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return {}


def load_constellation_names(filepath: str) -> Dict[str, str]:
    """
    Load constellation abbreviation to full name mappings.

    Returns:
        Dictionary mapping 3-letter code to full name (e.g., "Ori" -> "Orion")
    """
    print(f"📖 Reading {filepath}...")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            const_names = json.load(f)

        print(f"✅ Loaded {len(const_names)} constellation names")
        return const_names

    except FileNotFoundError:
        print(f"❌ Error: File {filepath} not found")
        return {}
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return {}


def merge_constellation_data(
    line_data: Dict[str, List[List[int]]], names: Dict[str, str]
) -> Dict[str, Dict]:
    """
    Merge constellation line data with names.

    Returns:
        Dictionary mapping constellation abbrev to full data:
        {
            "Ori": {
                "name": "Orion",
                "lines": [[27989, 24436], [24436, 25336], ...]
            }
        }
    """
    merged = {}

    for abbrev, lines in line_data.items():
        merged[abbrev] = {
            "name": names.get(abbrev, abbrev),  # Use abbrev as fallback
            "lines": lines,
        }

    return merged


def generate_constellation_json(
    output_filepath: str, constellation_data: Dict[str, Dict], pretty: bool = True
) -> None:
    """
    Generate JSON file with constellation data.

    Args:
        output_filepath: Path to output JSON file
        constellation_data: Dictionary of constellation data
        pretty: Whether to pretty-print JSON (default: True)
    """
    print(f"\n💾 Generating {output_filepath}...")

    try:
        with open(output_filepath, "w", encoding="utf-8") as f:
            if pretty:
                json.dump(constellation_data, f, indent=2, ensure_ascii=False)
            else:
                json.dump(constellation_data, f, ensure_ascii=False)

        print(f"✅ Successfully generated {output_filepath}")
        print(f"   Total constellations: {len(constellation_data)}")

        # Statistics
        total_lines = sum(len(data["lines"]) for data in constellation_data.values())
        print(f"   Total line segments: {total_lines}")

    except Exception as e:
        print(f"❌ Error writing {output_filepath}: {e}")


def print_sample_data(constellation_data: Dict[str, Dict], sample_size: int = 5) -> None:
    """Print sample of constellation data for verification."""
    print(f"\n📊 Sample data (first {sample_size} constellations):")
    print("-" * 70)

    count = 0
    for abbrev, data in sorted(constellation_data.items()):
        if count < sample_size:
            name = data.get("name", "?")
            num_lines = len(data.get("lines", []))
            print(f"  {abbrev:3s}: {name:20s} | {num_lines:3d} line segments")
            count += 1
        else:
            break


def main():
    """Main execution function."""
    print("=" * 70)
    print("CONSTELLATION QUIZ - CONSTELLATION DATA EXTRACTION")
    print("=" * 70)
    print()

    # File paths - relative to project root
    constellationship_path = "data/raw/constellationship.fab"
    const_names_path = "data/raw/constellation_abbreviations.json"
    output_path = "data/constellations.json"

    # Check if required files exist
    if not Path(constellationship_path).exists():
        print(f"❌ Error: {constellationship_path} not found")
        return

    # Parse constellation line data
    line_data = parse_constellationship_fab(constellationship_path)
    if not line_data:
        print("❌ No constellation data extracted. Aborting.")
        return

    # Load constellation names
    constellation_names = {}
    if Path(const_names_path).exists():
        constellation_names = load_constellation_names(const_names_path)
    else:
        print(f"⚠️  Warning: {const_names_path} not found, using abbreviations as names")

    # Merge data
    print("\n🔗 Merging constellation data...")
    constellation_data = merge_constellation_data(line_data, constellation_names)

    # Print sample
    print_sample_data(constellation_data)

    # Generate JSON
    generate_constellation_json(output_path, constellation_data)

    print("\n" + "=" * 70)
    print("✨ CONSTELLATION DATA EXTRACTION COMPLETE!")
    print("=" * 70)
    print(f"\n📄 Output file: {output_path}")
    print("   Constellation line connections as HIP ID pairs")
    print("   Ready to join with stars.json for rendering")


if __name__ == "__main__":
    main()
