# CLAUDE.md

## Project Overview

**HF Library Manager** (3D Print Manager) is a desktop application for organizing and managing 3D printing projects. Built with Tauri v2 (Rust backend + React/TypeScript frontend).

Users can create projects, import files (STL, 3MF, HueForge, images, etc.), manage filament libraries with automatic color matching, tag and organize projects into collections, and drag files directly into slicer apps like Bambu Studio.

## Tech Stack

- **Backend**: Rust with Tauri v2, SQLite via rusqlite
- **Frontend**: React 19 + TypeScript, Tailwind CSS v4, Vite
- **Key plugins**: tauri-plugin-drag (CrabNebula), tauri-plugin-dialog, tauri-plugin-fs, tauri-plugin-window-state
- **File format**: `.hllmproject` for project import/export (zip-based)

## Project Structure

- `src-tauri/src/commands.rs` — All Tauri IPC commands
- `src-tauri/src/db.rs` — Database schema, migrations, filament matching
- `src-tauri/src/models.rs` — Rust data models and structs
- `src-tauri/src/lib.rs` — Plugin registration and app setup
- `src/App.tsx` — Main app component with routing and drag-drop overlay
- `src/components/` — React components (ProjectDetail, FileList, Sidebar, etc.)
- `src/hooks/useFileDrop.ts` — File drop handler using Tauri drag-drop events
- `src/lib/api.ts` — Frontend API wrappers for Tauri invoke calls
- `src/lib/types.ts` — TypeScript type definitions

## Code Quality Rules

- Always write clean, readable code following existing patterns and conventions.
- Prefer simple solutions over clever abstractions. Keep changes minimal and focused.
- Use existing project import styles and organization consistently.

## Pre-Release Checklist

Before creating any release, always run the following checks and fix any issues found:

1. **Code optimization** — Consolidate redundant queries, reduce allocations, batch operations.
2. **Performance optimization** — Profile hot paths, use transactions for bulk DB ops, memoize expensive computations, lazy-load heavy components.
3. **Security check** — Validate all user inputs, sanitize paths (prevent traversal), prevent injection (SQL, command, FTS5), check for TOCTOU races.
4. **Dead code check** — Remove unused functions, orphaned files, unused dependencies, and unreachable code paths.

## Commit Discipline

- Create a separate commit for each feature, bugfix, or task. Do not bundle unrelated changes.
- Use conventional commit prefixes: `feat:`, `fix:`, `perf:`, `chore:`, `refactor:`, `docs:`.
- Keep commit messages concise with a clear description of what changed and why.
