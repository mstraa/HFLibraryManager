---
sidebar_position: 4
---

# Architecture

## Overview

HF Library Manager follows a two-process architecture with a Rust backend and a React frontend communicating through Tauri's IPC bridge.

```
┌──────────────────────────────────┐
│         React Frontend           │
│  (TypeScript, Tailwind CSS)      │
│                                  │
│  App.tsx → Components → api.ts   │
│                  │               │
│            invoke(command)        │
└──────────────┬───────────────────┘
               │  Tauri IPC
┌──────────────┴───────────────────┐
│          Rust Backend            │
│                                  │
│  commands.rs  →  db.rs           │
│  thumbnails.rs   config.rs       │
│       │              │           │
│    SQLite        File System     │
└──────────────────────────────────┘
```

## Frontend

### Structure

```
src/
├── App.tsx                    Main app with routing, drag-drop overlay
├── components/
│   ├── ProjectDetail.tsx      Project view with files & metadata
│   ├── FileList.tsx           File list with drag, preview, favorites
│   ├── Sidebar.tsx            Filter sidebar with collapsible sections
│   ├── FilamentManager.tsx    Filament library editor
│   ├── ProjectCard.tsx        Grid view card (memoized)
│   ├── ProjectTable.tsx       Table view rows
│   ├── SearchBar.tsx          Search, sort, and view toggle
│   ├── BulkActions.tsx        Multi-select operations toolbar
│   ├── Settings.tsx           Library management and storage
│   └── ...                    Modal, ConfirmDialog, badges, etc.
├── hooks/
│   ├── useKeyboard.ts         Global keyboard shortcuts
│   ├── useFileDrop.ts         Tauri drag-drop event handling
│   ├── useSwipeNavigation.ts  Trackpad gesture navigation
│   └── useTheme.ts            Dark mode management
└── lib/
    ├── api.ts                 Tauri IPC command wrappers
    ├── types.ts               TypeScript interfaces
    └── formatting.ts          Shared formatting utilities
```

### Key Patterns

- **Single-page app** — No router, navigation managed via state and history stack
- **Memoization** — `useMemo` and `useCallback` for expensive computations
- **Lazy loading** — `React.lazy` for heavy components (react-markdown)
- **Refs for stable closures** — Avoid stale state in event listeners
- **Drag threshold** — 5px mouse movement to distinguish click from drag

## Backend

### Structure

```
src-tauri/src/
├── commands.rs     40+ Tauri IPC command handlers
├── db.rs           SQLite schema, migrations, filament matching
├── models.rs       Data models and structs
├── config.rs       Multi-library configuration
├── thumbnails.rs   3MF thumbnail extraction
└── lib.rs          Plugin registration and app setup
```

### Database

SQLite with WAL mode, foreign keys, and FTS5 full-text search.

**Core tables:**
- `projects` — Project metadata
- `files` — Project files with favorites and notes
- `tags`, `project_tags` — Tag system
- `collections`, `project_collections` — Collection system
- `project_filaments` — Filament assignments per project

**Shared database (attached):**
- `curated_filaments` — Global filament library

**Performance:**
- WAL mode for concurrent reads
- 10+ indexes on common query patterns
- Transaction wrapping for bulk operations
- Pre-computed lowercase fields for filament matching
- Bounded edit distance with early exit for fuzzy matching

### Security

- Path traversal validation on all file operations
- FTS5 query sanitization
- Command injection prevention on Windows
- TOCTOU race condition mitigation in file imports

## Tauri Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-drag` | OS-level drag from webview to external apps |
| `tauri-plugin-dialog` | Native file/folder picker dialogs |
| `tauri-plugin-fs` | File system access |
| `tauri-plugin-window-state` | Persist window size and position |
| `tauri-plugin-process` | Process management |
