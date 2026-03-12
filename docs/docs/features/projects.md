---
sidebar_position: 1
---

# Project Management

Projects are the core organizational unit in HF Library Manager. Each project represents a 3D printing design with its associated files, metadata, filaments, and tags.

## Creating Projects

- Click **New Project** or press `Cmd/Ctrl + N`
- Optionally select a source folder to import files from
- Or start from a [template](./templates) to pre-fill files, filaments, and print specs
- Files are automatically categorized by type (Design, HueForge, 3MF, Exports, Other)
- The newest file per category is auto-starred as a favorite
- Design images are automatically set as the project thumbnail

## Importing Projects

### From Folders

Drag-and-drop a folder onto the main window to create a project from it. All files in the folder are imported and categorized.

### From .hllmproject Files

Projects can be exported as `.hllmproject` files (zip-based format) and imported on another machine. The format preserves:
- All project files
- Metadata (name, description, print specs)
- Filament assignments
- Tags
- Thumbnail

## Project Metadata

Each project can have:
- **Name** — Project title
- **Description** — Markdown notes with live preview
- **Thumbnail** — Custom image or auto-extracted from 3MF files
- **Print specifications** — Dimensions (width, depth, height in mm) and estimated print time
- **Tags** — Colored labels for categorization
- **Collections** — Group related projects together

## Duplicating Projects

Duplicate a project to create a full copy including all files, metadata, filament assignments, and tags. Useful for creating variants of a design.

## Navigation

- Use **mouse back/forward buttons** or **trackpad swipe gestures** to navigate between projects
- The navigation history works like a browser
