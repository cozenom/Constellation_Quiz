#!/usr/bin/env python3
"""
Star Data Extraction Script for Constellation Quiz
Merges Stellarium and IAU data to create comprehensive star catalog.

Input files:
- name.fab: Maps HIP IDs to Bayer/Flamsteed designations (Stellarium)
- IAU_Star_Catalog.csv: Official IAU star proper names
- constellation_abbreviations.json: 3-letter codes to full names

Output:
- stars.json: Merged star data with Bayer designations and proper names
"""

import csv
import json
from pathlib import Path
from typing import Dict, List

try:
    from skyfield.api import load
    from skyfield.data import hipparcos
    import pandas as pd

    SKYFIELD_AVAILABLE = True
except ImportError:
    SKYFIELD_AVAILABLE = False
    print("⚠️  Warning: Skyfield/pandas not installed. Run: pip install skyfield pandas")


def parse_name_fab(filepath: str) -> Dict[int, List[str]]:
    """
    Parse name.fab file to extract star designations.

    Format in name.fab:
    <hip_id>|<designation>

    Example:
    677|α_And
    841|22_And
    5447|β_And

    Returns:
        Dictionary mapping HIP ID to list of designations
    """
    star_names = {}

    print(f"📖 Reading {filepath}...")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()

                # Skip empty lines and comments
                if not line or line.startswith("#"):
                    continue

                # Parse entries: <id>|<designation>
                parts = line.split("|")
                if len(parts) >= 2:
                    try:
                        # First part is HIP ID (or Gaia ID for some stars)
                        id_str = parts[0].strip()

                        # Only process HIP IDs (numeric, reasonable length)
                        # Skip Gaia IDs (very long numbers)
                        if id_str.isdigit() and len(id_str) <= 6:
                            hip_id = int(id_str)

                            # Second part is designation (e.g., "α_And", "22_And")
                            designation = parts[1].strip()

                            # Replace underscore with space for cleaner display
                            designation = designation.replace("_", " ")

                            if hip_id not in star_names:
                                star_names[hip_id] = []

                            star_names[hip_id].append(designation)

                    except (ValueError, IndexError):
                        # Skip lines that don't match expected format
                        continue

        print(f"✅ Parsed {len(star_names)} stars with designations")
        return star_names

    except FileNotFoundError:
        print(f"❌ Error: File {filepath} not found")
        return {}
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return {}


def parse_iau_csv(filepath: str) -> Dict[int, Dict[str, str]]:
    """
    Parse IAU Star Catalog CSV file.

    Returns:
        Dictionary mapping HIP ID to star info (name, constellation, origin)
    """
    iau_stars = {}

    print(f"📖 Reading {filepath}...")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row in reader:
                hip_str = row.get("HIP", "").strip()

                # Skip rows without HIP ID
                if not hip_str:
                    continue

                try:
                    hip_id = int(hip_str)

                    iau_stars[hip_id] = {
                        "name": row.get("proper names", "").strip(),
                        "constellation": row.get("Constellation", "").strip(),
                        "origin": row.get("Origin", "").strip(),
                        "cultural_group": row.get(
                            "Ethnic-Cultural_Group_or_Language", ""
                        ).strip(),
                        "date_adopted": row.get("Date of Adoption", "").strip(),
                        "bayer_iau": row.get("Bayer ID", "").strip(),  # Cross-check
                    }

                except ValueError:
                    continue

        print(f"✅ Parsed {len(iau_stars)} IAU star names")
        return iau_stars

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


def load_hipparcos_data() -> Dict[int, Dict]:
    """
    Load Hipparcos catalog data using Skyfield.

    Returns:
        Dictionary mapping HIP ID to star physical data (magnitude, distance, etc.)
    """
    if not SKYFIELD_AVAILABLE:
        print("⚠️  Skipping Hipparcos data (Skyfield not available)")
        return {}

    print("📖 Loading Hipparcos catalog (this may take a moment)...")

    try:
        # Load Hipparcos catalog
        with load.open(hipparcos.URL) as f:
            df = hipparcos.load_dataframe(f)

        hip_data = {}

        for hip_id, row in df.iterrows():
            # Extract magnitude (visual magnitude)
            magnitude = row.get("magnitude")

            # Calculate distance from parallax (in light years)
            # parallax is in milliarcseconds (mas)
            # distance (parsecs) = 1000 / parallax (mas)
            # distance (light years) = distance (parsecs) * 3.26156
            distance = None
            parallax = row.get("parallax_mas")  # Fixed: correct field name
            if parallax and not pd.isna(parallax) and parallax > 0:
                distance_parsecs = 1000.0 / parallax
                distance = round(
                    distance_parsecs * 3.26156, 2
                )  # Convert to light years

            # Extract position (RA/Dec)
            ra_hours = row.get("ra_hours")
            dec_degrees = row.get("dec_degrees")

            # Normalize coordinates to 0-1 range for rendering
            # RA: 0-24 hours → 0-1
            # Dec: -90 to +90 degrees → 0-1
            x = None
            y = None
            if ra_hours is not None and not pd.isna(ra_hours):
                x = round(ra_hours / 24.0, 6)
            if dec_degrees is not None and not pd.isna(dec_degrees):
                y = round((dec_degrees + 90.0) / 180.0, 6)

            hip_data[hip_id] = {
                "magnitude": (
                    float(magnitude)
                    if magnitude is not None and not pd.isna(magnitude)
                    else None
                ),
                "distance_ly": distance,
                "ra": (
                    float(ra_hours)
                    if ra_hours is not None and not pd.isna(ra_hours)
                    else None
                ),
                "dec": (
                    float(dec_degrees)
                    if dec_degrees is not None and not pd.isna(dec_degrees)
                    else None
                ),
                "x": x,
                "y": y,
            }

        print(f"✅ Loaded Hipparcos data for {len(hip_data)} stars")

        # Show sample HIP IDs for verification
        sample_hip_ids = sorted(hip_data.keys())[:5]
        print(f"   Sample HIP IDs: {sample_hip_ids}")

        # Check for specific HIP IDs that were previously problematic
        check_ids = [78727, 55203]
        for check_id in check_ids:
            if check_id in hip_data:
                print(f"   ✓ HIP {check_id} found in Hipparcos")
            else:
                print(f"   ✗ HIP {check_id} NOT in Hipparcos catalog")

        return hip_data

    except Exception as e:
        print(f"❌ Error loading Hipparcos catalog: {e}")
        return {}


def merge_star_data(
    stellarium_names: Dict[int, List[str]],
    iau_stars: Dict[int, Dict[str, str]],
    constellation_names: Dict[str, str],
    hipparcos_data: Dict[int, Dict] = None,
) -> Dict[str, Dict]:
    """
    Merge Stellarium Bayer designations with IAU proper names.

    Returns:
        Dictionary mapping HIP ID to star data:
        {
            "hip_id": {
                "bayer": "α Ori",
                "name": "Betelgeuse",
                "constellation": "Ori",
                "constellation_full": "Orion",
                "origin": "Etymology description..."
            }
        }
    """
    # Complete Greek alphabet used in Bayer designations
    greek_letters = [
        "α",
        "β",
        "γ",
        "δ",
        "ε",
        "ζ",
        "η",
        "θ",
        "ι",
        "κ",
        "λ",
        "μ",
        "ν",
        "ξ",
        "ο",
        "π",
        "ρ",
        "σ",
        "τ",
        "υ",
        "φ",
        "χ",
        "ψ",
        "ω",
    ]

    merged_stars = {}

    # First, extract Bayer designations from Stellarium
    for hip_id, designations in stellarium_names.items():
        bayer = None
        constellation = None

        for designation in designations:
            # Check if designation contains a Greek letter
            if any(greek in designation for greek in greek_letters):
                bayer = designation
                # Extract constellation abbreviation (last 3 chars, e.g., "α Ori" -> "Ori")
                parts = designation.split()
                if len(parts) >= 2:
                    constellation = parts[-1]
                break

        # Only keep stars with Bayer designations
        if bayer:
            merged_stars[str(hip_id)] = {
                "bayer": bayer,
                "name": None,
                "constellation": constellation,
                "constellation_full": (
                    constellation_names.get(constellation, constellation)
                    if constellation
                    else None
                ),
                "cultural_group": None,
                "date_adopted": None,
                "origin": None,
                "magnitude": None,
                "distance_ly": None,
                "ra": None,
                "dec": None,
                "x": None,
                "y": None,
            }

    # Now merge IAU data
    for hip_id, iau_data in iau_stars.items():
        hip_str = str(hip_id)

        # If star already exists (has Bayer designation)
        if hip_str in merged_stars:
            merged_stars[hip_str]["name"] = iau_data["name"]
            merged_stars[hip_str]["origin"] = iau_data["origin"]
            merged_stars[hip_str]["cultural_group"] = iau_data.get("cultural_group")
            merged_stars[hip_str]["date_adopted"] = iau_data.get("date_adopted")

            # Use IAU constellation if ours is missing
            if not merged_stars[hip_str]["constellation"] and iau_data["constellation"]:
                const_abbr = iau_data["constellation"]
                merged_stars[hip_str]["constellation"] = const_abbr
                merged_stars[hip_str]["constellation_full"] = constellation_names.get(
                    const_abbr, const_abbr
                )

        # If star only exists in IAU (no Bayer designation)
        else:
            const_abbr = iau_data["constellation"]
            merged_stars[hip_str] = {
                "bayer": None,
                "name": iau_data["name"],
                "constellation": const_abbr,
                "constellation_full": constellation_names.get(const_abbr, const_abbr),
                "cultural_group": iau_data.get("cultural_group"),
                "date_adopted": iau_data.get("date_adopted"),
                "origin": iau_data["origin"],
                "magnitude": None,
                "distance_ly": None,
                "ra": None,
                "dec": None,
                "x": None,
                "y": None,
            }

    # Merge Hipparcos physical data
    if hipparcos_data:
        for hip_id, hip_phys in hipparcos_data.items():
            hip_str = str(hip_id)
            if hip_str in merged_stars:
                merged_stars[hip_str]["magnitude"] = hip_phys.get("magnitude")
                merged_stars[hip_str]["distance_ly"] = hip_phys.get("distance_ly")
                merged_stars[hip_str]["ra"] = hip_phys.get("ra")
                merged_stars[hip_str]["dec"] = hip_phys.get("dec")
                merged_stars[hip_str]["x"] = hip_phys.get("x")
                merged_stars[hip_str]["y"] = hip_phys.get("y")

        # Filter out stars missing coordinates (can't be rendered)
        stars_before = len(merged_stars)
        filtered_stars = {}
        removed_stars = []

        for hip_str, star_data in merged_stars.items():
            if star_data.get("x") is not None and star_data.get("y") is not None:
                filtered_stars[hip_str] = star_data
            else:
                bayer = star_data.get("bayer", "?")
                name = star_data.get("name", "?")
                removed_stars.append(f"HIP {hip_str} ({bayer}, {name})")

        if removed_stars:
            print(f"\n🔍 Filtered out {len(removed_stars)} stars without coordinates:")
            for removed in removed_stars:
                print(f"   - {removed}")
            print(f"   Reason: Multiple star systems not measurable by Hipparcos")

        merged_stars = filtered_stars

    return merged_stars


def generate_star_json(
    output_filepath: str, star_data: Dict[str, Dict], pretty: bool = True
) -> None:
    """
    Generate JSON file with merged star data.

    Args:
        output_filepath: Path to output JSON file
        star_data: Dictionary mapping HIP ID to star info dict
        pretty: Whether to pretty-print JSON (default: True)
    """
    print(f"\n💾 Generating {output_filepath}...")

    try:
        with open(output_filepath, "w", encoding="utf-8") as f:
            if pretty:
                json.dump(star_data, f, indent=2, ensure_ascii=False)
            else:
                json.dump(star_data, f, ensure_ascii=False)

        print(f"✅ Successfully generated {output_filepath}")
        print(f"   Total stars: {len(star_data)}")

        # Statistics
        with_bayer = sum(1 for data in star_data.values() if data.get("bayer"))
        with_names = sum(1 for data in star_data.values() if data.get("name"))
        with_both = sum(
            1 for data in star_data.values() if data.get("bayer") and data.get("name")
        )

        print(f"   Stars with Bayer designations: {with_bayer}")
        print(f"   Stars with proper names: {with_names}")
        print(f"   Stars with both: {with_both}")

    except Exception as e:
        print(f"❌ Error writing {output_filepath}: {e}")


def print_sample_data(star_data: Dict[str, Dict], sample_size: int = 10) -> None:
    """Print sample of merged star data for verification."""
    print(f"\n📊 Sample data (first {sample_size} stars):")
    print("-" * 70)

    count = 0
    for hip_id, data in sorted(star_data.items(), key=lambda x: int(x[0])):
        if count < sample_size:
            bayer = data.get("bayer") or "-"
            name = data.get("name") or "-"
            const = data.get("constellation") or "?"
            print(f"  HIP {hip_id:6s}: {bayer:15s} | {name:20s} | {const}")
            count += 1
        else:
            break


def main():
    """Main execution function."""
    print("=" * 70)
    print("CONSTELLATION QUIZ - STAR DATA EXTRACTION & MERGE")
    print("=" * 70)
    print()

    # File paths - relative to project root
    name_fab_path = "data/raw/name.fab"
    iau_csv_path = "data/raw/IAU_Star_Catalog.csv"
    const_names_path = "data/raw/constellation_abbreviations.json"
    output_path = "data/stars.json"

    # Check if required files exist
    if not Path(name_fab_path).exists():
        print(f"❌ Error: {name_fab_path} not found")
        return

    # Load Stellarium Bayer designations
    star_names = parse_name_fab(name_fab_path)
    if not star_names:
        print("❌ No star data extracted. Aborting.")
        return

    # Load IAU star names
    iau_stars = {}
    if Path(iau_csv_path).exists():
        iau_stars = parse_iau_csv(iau_csv_path)
    else:
        print(f"⚠️  Warning: {iau_csv_path} not found, skipping IAU names")

    # Load constellation names
    constellation_names = {}
    if Path(const_names_path).exists():
        constellation_names = load_constellation_names(const_names_path)
    else:
        print(
            f"⚠️  Warning: {const_names_path} not found, skipping full constellation names"
        )

    # Load Hipparcos physical data
    print()
    hipparcos_data = load_hipparcos_data()

    # Merge all data
    print("\n🔗 Merging Stellarium + IAU + Hipparcos data...")
    star_data = merge_star_data(
        star_names, iau_stars, constellation_names, hipparcos_data
    )

    # Print sample
    print_sample_data(star_data)

    # Generate JSON
    generate_star_json(output_path, star_data)

    print("\n" + "=" * 70)
    print("✨ STAR DATA MERGE COMPLETE!")
    print("=" * 70)
    print(f"\n📄 Output file: {output_path}")
    print("   Merged: Stellarium Bayer + IAU names + Hipparcos physical data")
    print("   Ready to use for constellation quiz application")


if __name__ == "__main__":
    main()
