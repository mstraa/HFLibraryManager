---
sidebar_position: 1
slug: /intro
---

# Introduction

**HF Library Manager** is a desktop application for organizing and managing 3D printing projects, files, and filament libraries. Built with Tauri v2, React, TypeScript, and Rust.

## What it does

- **Organize projects** — Create projects from folders, drag-and-drop files, auto-categorize by type (Design, HueForge, 3MF, Exports)
- **Manage filaments** — Curated filament library with fuzzy matching against 3MF metadata
- **Search and filter** — Full-text search, tags, collections, filament filters, size filters, ownership tracking
- **Multi-library support** — Maintain separate project databases for different use cases
- **Drag to slicer** — Drag files directly from the app into Bambu Studio or other external apps

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.8, Tailwind CSS 4, Vite 7 |
| Backend | Rust, Tauri 2, SQLite (rusqlite) |
| Desktop | tauri-plugin-drag, tauri-plugin-dialog, tauri-plugin-window-state |
| Format | `.hllmproject` (zip-based project import/export) |

## Supported File Types

| Category | Extensions |
|----------|-----------|
| Design / Images | png, jpg, jpeg, webp, gif, bmp, svg, af, afdesign, afphoto, afpub, psd, ai, xcf, kra |
| HueForge | hfp, hfm |
| HueForge Export | stl, txt |
| 3MF / Print | 3mf |
| Other | Any other file type |
