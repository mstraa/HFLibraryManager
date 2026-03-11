# HF Library Manager

A desktop application for managing HueForge and 3D printing projects, files, and filament libraries. Organize your designs with smart filament matching, full-text search, tags, collections, and multi-library support.

Built with **Tauri 2 + React 19 + TypeScript + Rust + SQLite**.

---

## Features

### Project Management

- **Create & import** projects from folders with drag-and-drop — files are categorized automatically (Design, HueForge, 3MF, Exports, Other)
- **Duplicate** entire projects including all files, metadata, filaments, and tags
- **Markdown notes** with live preview for project descriptions
- **Print specifications** — track print dimensions (mm) and estimated print time
- **Custom thumbnails** — set from imported images or auto-extracted from 3MF files
- **Navigation history** — back/forward with mouse buttons and trackpad swipe gestures

### File Management

- **Drag-and-drop import** of files and folders directly into projects
- **File preview** panel for images and text files with syntax display
- **Favorites system** — star important files per project; auto-stars the newest file per category on import
- **Quick open** — open files with default app or specific apps (Bambu Studio, HueForge, Affinity suite)
- **Context menu** — right-click for open, reveal in folder, set as thumbnail, delete
- **File sync** — detect external changes to project files on disk
- **Soft delete** — deleted files go to a trash folder; empty trash from Settings

### Filament System

- **Curated filament library** — global database shared across all libraries with brand, line, material, color, and transmission distance (TD)
- **Ownership tracking** — mark filaments you own for inventory-aware filtering
- **Smart matching** — automatically parse filament data from 3MF metadata and match against your library using fuzzy matching
- **Match statuses** — exact, guessed, confirmed, unmatched — with visual indicators (solid border, dashed, question mark)
- **Manual assignment** — search and assign filaments to projects, or add completely new entries
- **Bulk operations** — rematch all unmatched filaments across projects, reset matches, remove filaments
- **JSON import** — import filament libraries from JSON files

### Search & Filtering

- **Full-text search** powered by SQLite FTS5 across project names and descriptions
- **Tag filters** — include or exclude tags (right-click to exclude)
- **Collection filters** — view projects in a specific collection
- **Filament filters** — filter by specific filaments, include/exclude, "no filament" filter
- **Owned filter** — show only projects using filaments you own; "Strict" mode requires all filaments to be owned
- **Size filters** — filter by print size category
- **Sort** — by name, creation date, or modification date (asc/desc)
- **Clear all** — one-click filter reset

### Tags & Collections

- **Tags** — unlimited custom tags with 10 preset colors; assign multiple per project
- **Collections** — group projects with names and descriptions
- **Bulk assignment** — add tags or collections to multiple selected projects at once
- **Project counts** — see how many projects use each tag/collection
- **Inline creation** — create new tags and collections directly from the project detail view

### Views

- **Grid view** — visual cards with thumbnails, tags, filament colors, file count, size, and modification date
- **Table view** — compact tabular listing with sortable columns
- **Thumbnail modes** — Cover (crop to fit), Contain (full image), Full (scale down)
- **Multi-select** — Cmd/Ctrl+click to select multiple projects for bulk operations
- **Dark mode** — full dark theme support

### Multi-Library Support

- **Multiple libraries** — maintain separate project databases for different use cases
- **Switch libraries** — instantly swap between libraries with full data isolation
- **Library management** — add, rename, remove libraries from Settings
- **Independent storage** — each library has its own database and file structure

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + N` | Create new project |
| `Cmd/Ctrl + F` | Focus search |
| `Cmd/Ctrl + A` | Select all projects |
| `Escape` | Clear selection / close dialog |
| Mouse back/forward | Navigate history |
| Trackpad swipe | Navigate back/forward |

### Additional Features

- **3MF thumbnail extraction** — auto-extracts preview images from Bambu Studio 3MF files (ZIP archive parsing with path traversal protection)
- **Auto-starring** — on folder import, newest file per category is automatically favorited
- **Auto-thumbnail** — design images are automatically set as project cover
- **Storage management** — view storage usage for projects and trash, empty trash to reclaim space
- **Welcome screen** — first-launch setup wizard to choose library location
- **Error boundaries** — graceful error recovery with collapsible debug details
- **Accessibility** — aria-labels on toolbar buttons

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| [React 19](https://react.dev/) | UI framework with hooks |
| [TypeScript 5.8](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first styling with dark mode |
| [Vite 7](https://vite.dev/) | Build tool and dev server |
| [React Markdown](https://github.com/remarkjs/react-markdown) | Markdown rendering with GFM support |

### Backend

| Technology | Purpose |
|-----------|---------|
| [Tauri 2](https://v2.tauri.app/) | Native desktop framework |
| [Rust](https://www.rust-lang.org/) | Backend with 40+ IPC commands |
| [SQLite](https://www.sqlite.org/) (rusqlite) | Database with WAL mode, FTS5, foreign keys |
| [image](https://crates.io/crates/image) | Thumbnail generation and processing |
| [zip](https://crates.io/crates/zip) | 3MF archive reading |
| [chrono](https://crates.io/crates/chrono) | Timestamp handling |
| [uuid](https://crates.io/crates/uuid) | v4 ID generation |
| [dirs](https://crates.io/crates/dirs) | Cross-platform directory resolution |

### Tauri Plugins

- `tauri-plugin-dialog` — native file/folder picker dialogs
- `tauri-plugin-fs` — file system access
- `tauri-plugin-opener` — open files and URLs with default apps
- `tauri-plugin-window-state` — persist window size and position

---

## Architecture

```
src/                                    Frontend (React/TypeScript)
├── components/
│   ├── ProjectDetail.tsx               Project view with files & metadata
│   ├── FileList.tsx                    File management with preview panel
│   ├── Sidebar.tsx                     Filter sidebar with collapsible sections
│   ├── FilamentManager.tsx             Full filament library editor
│   ├── ProjectCard.tsx                 Grid view card (memoized)
│   ├── ProjectTable.tsx                Table view rows
│   ├── SearchBar.tsx                   Search, sort, and view toggle
│   ├── BulkActions.tsx                 Multi-select operations toolbar
│   ├── Settings.tsx                    Library management and storage
│   ├── Modal.tsx                       Reusable modal wrapper
│   ├── ConfirmDialog.tsx               Confirmation dialog
│   ├── FilamentBadge.tsx               Shared filament color indicator
│   ├── TagBadges.tsx                   Shared tag pill display
│   └── ...
├── hooks/
│   ├── useKeyboard.ts                  Global keyboard shortcuts
│   ├── useFileDrop.ts                  Drag-and-drop handling
│   ├── useSwipeNavigation.ts           Trackpad gesture navigation
│   ├── useTheme.ts                     Dark mode management
│   └── useThumbnailMode.ts             Thumbnail display preference
├── lib/
│   ├── api.ts                          Tauri IPC command wrappers
│   ├── types.ts                        TypeScript interfaces
│   └── formatting.ts                   Shared formatting utilities

src-tauri/                              Backend (Rust)
├── src/
│   ├── commands.rs                     40+ Tauri command handlers
│   ├── db.rs                           SQLite schema, migrations, filament matching
│   ├── config.rs                       Multi-library configuration
│   ├── thumbnails.rs                   3MF thumbnail extraction
│   └── lib.rs                          Plugin registration and app setup
├── Cargo.toml
└── tauri.conf.json
```

### Database

**Core tables**: `projects`, `files`, `tags`, `project_tags`, `collections`, `project_collections`, `project_filaments`

**Shared database** (attached): `curated_filaments` — filament library shared across all libraries

**Search**: FTS5 virtual table (`projects_fts`) for full-text search on project names and descriptions

**Performance**: WAL mode, foreign keys, 10 indexes on common query patterns

### Storage Layout

```
~/HFLibraryManager/                     Default library location
├── db.sqlite                           Project database
├── projects/
│   └── {uuid}/
│       ├── files/                      Project files
│       └── thumbnails/                 Auto-generated thumbnails
└── deleted/                            Soft-deleted trash

Platform config directory:
├── config.json                         Library list and preferences
└── filaments.sqlite                    Shared filament database
```

Config directory location:
- **macOS**: `~/Library/Application Support/HFLibraryManager/`
- **Windows**: `%APPDATA%\HFLibraryManager\`
- **Linux**: `~/.config/HFLibraryManager/`

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) 1.70+
- [Node.js](https://nodejs.org/) 18+
- Platform dependencies for Tauri:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2
  - **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Development

```bash
npm install
npm run tauri dev
```

### Building

```bash
npm run tauri build
```

Produces platform-specific installers:
- **macOS**: `.dmg`
- **Windows**: `.msi` + `.exe`
- **Linux**: `.deb` + `.AppImage`

---

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`) builds for all platforms on tag push:

| Target | Runner | Artifacts |
|--------|--------|-----------|
| macOS ARM64 (Apple Silicon) | `macos-latest` | `.dmg` |
| macOS x64 (Intel) | `macos-latest` | `.dmg` |
| macOS Universal | `macos-latest` | `.dmg` (fat binary) |
| Windows x64 | `windows-latest` | `.msi`, `.exe` |
| Linux x64 | `ubuntu-22.04` | `.deb`, `.AppImage` |

### Creating a release

```bash
git tag v0.1.0
git push --tags
```

This triggers the workflow and creates a **draft GitHub Release** with all platform binaries attached.

### macOS code signing (optional)

Set these secrets in your GitHub repository settings for signed macOS builds:

`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

Without these, builds still work but macOS will show an "unidentified developer" warning on first launch.

---

## License

MIT
