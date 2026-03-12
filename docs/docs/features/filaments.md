---
sidebar_position: 3
---

# Filament System

HF Library Manager includes a curated filament library with smart matching capabilities for tracking which filaments are used in each project.

## Curated Library

A global filament database shared across all libraries containing:
- **Brand** — Manufacturer name (e.g., Bambu Lab, Polymaker)
- **Line** — Product line (e.g., PLA Basic, PolyTerra)
- **Material** — Filament type (e.g., PLA, PETG, ABS)
- **Color** — Color name and hex value
- **Transmission Distance (TD)** — For HueForge compatibility

The library comes pre-loaded with a default set of filaments and can be expanded by importing JSON files from [HueForge](https://shop.thehueforge.com/) or [3D Filament Profiles](https://3dfilamentprofiles.com/).

## Ownership Tracking

Mark filaments you own in the library. This enables:
- **Owned filter** — Show only projects using filaments you have
- **Strict mode** — Require all filaments in a project to be owned
- Visual indicators in the filament list

## Smart Matching

When you import 3MF files, HF Library Manager automatically:
1. Parses filament metadata from the 3MF archive
2. Fuzzy-matches against the curated library using brand, line, and color name
3. Assigns a match status:

| Status | Indicator | Meaning |
|--------|-----------|---------|
| Exact | Solid border | Perfect match found |
| Guessed | Dashed border | Best guess, needs confirmation |
| Confirmed | Solid border | User confirmed a guess |
| Unmatched | Question mark | No match found |

## Manual Assignment

- Search the filament library to manually assign filaments to a project
- Add completely new filament entries if not in the library
- Remove or reassign filament matches

## Bulk Operations

- **Rematch all** — Re-run matching for all unmatched filaments across projects. Useful after adding new filaments to the library
- **Reset matches** — Clear all matches and start fresh
- **Import filaments** — Load filament data from JSON files exported from [HueForge](https://shop.thehueforge.com/) or [3D Filament Profiles](https://3dfilamentprofiles.com/)
- **Reset to defaults** — Restore the built-in filament library
