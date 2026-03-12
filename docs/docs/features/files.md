---
sidebar_position: 2
---

# File Management

Each project contains files organized by category with support for previewing, favoriting, and dragging to external apps.

## File Categories

Files are automatically categorized based on their extension:

| Category | Color | Extensions |
|----------|-------|-----------|
| Design / Images | Blue | png, jpg, svg, af, afdesign, psd, ai, etc. |
| HueForge | Orange | hfp, hfm |
| HueForge Export | Yellow | stl, txt |
| 3MF / Print | Green | 3mf |
| Other | Gray | Everything else |

## Importing Files

- **Drag-and-drop** files directly onto a project
- **Import button** to select files via the native file picker
- Files are copied into the project's storage directory

You can also import an entire project (with files, filaments, tags, and more) from a `.hllmproject` archive — see [Export & Import](./export-import).

## Views

Toggle between **List view** and **Grid view**:

- **List view** — Compact rows with filename, size, date, and quick actions
- **Grid view** — Thumbnail cards with visual previews

## Favorites

Star important files to pin them in a favorites strip at the top of the file list:
- Favorites are colored by file category
- Sorted with print files (3MF) first
- Click a favorite chip to preview it
- Drag a favorite chip to external apps

## Preview Panel

Click a previewable file (images or text files) to open the preview panel:
- Images display with full resolution
- Text files show syntax-highlighted content with a copy button
- The panel takes half the file list width

## Drag to External Apps

Drag any file from the file list or favorites strip directly into external applications like Bambu Studio, HueForge, or Affinity Designer. A 5-pixel movement threshold distinguishes clicks from drags.

## Context Menu

Right-click any file for:
- **Open in [App]** — Open with the associated app (Bambu Studio for 3MF, HueForge for HFP, Affinity for AF files)
- **Show in Folder** — Reveal in Finder/Explorer
- **Add/Edit notes** — Attach notes to individual files
- **Set as thumbnail** — Use an image as the project thumbnail
- **Delete** — Soft-delete to trash

## File Sync

Click **Refresh** to scan the project folder for files that were added or removed externally. The sync detects changes on disk and updates the database accordingly.
