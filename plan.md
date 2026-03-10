# HF Library Manager — Project Plan

## Tech Stack: Tauri v2 + React + TypeScript

**Why Tauri v2:**
- Native macOS app, lightweight (~10MB vs Electron's ~200MB)
- Rust backend for fast file operations, thumbnail generation, SQLite
- React frontend for rapid UI development (grid views, markdown, filters)
- Handles hundreds of projects with virtual scrolling
- Native file dialogs, drag & drop support

---

## Data Model

```
Project
├── id, name, description (markdown), thumbnail
├── created_at, updated_at
├── tags[] (many-to-many)
├── collections[] (many-to-many)
└── assets[]
    ├── AffinityAsset (revisions[])
    ├── HueForgeAsset (revisions[])
    └── BambuLabAsset (revisions[])

Revision
├── id, version_number, file_path, notes
├── created_at
└── auto_thumbnail / manual_thumbnail

Collection
├── id, name, description, cover_image
└── projects[] (many-to-many)

Tag
├── id, name, color
└── projects[] (many-to-many)
```

**Storage:** SQLite (via `rusqlite`) for metadata, managed folder for files:

```
~/HFLibraryManager/
├── db.sqlite
├── projects/
│   └── {project-id}/
│       ├── affinity/
│       │   ├── v1/design.afphoto
│       │   └── v2/design.afphoto
│       ├── hueforge/
│       │   ├── v1/model.hfp
│       │   └── v2/model.hfp
│       ├── bambulab/
│       │   └── v1/print.3mf
│       └── thumbnails/
└── thumbnails/  (collection covers, etc.)
```

---

## App Structure — 4 Main Views

### 1. Library View (home)

- Thumbnail grid with project cards (name, thumbnail, tags)
- Search bar — full-text search on name, description, tags
- Filter sidebar — by tag, collection, file types present, date range
- Sort — by name, date created, date modified
- Virtual scrolling for performance with hundreds of items

### 2. Project Detail View

- **Header**: name, thumbnail (click to change), tags
- **Markdown editor** (split pane: edit / preview) for notes/description
- **Asset sections** (Affinity, HueForge, BambuLab):
  - Revision timeline (v1 -> v2 -> v3) with dates and notes
  - Drag & drop to add new revision
  - Click to open file in native app
  - Per-revision thumbnail (auto-generated or manual)
- **Collections** this project belongs to

### 3. Collections View

- Grid of collections with cover images
- Click into a collection -> filtered library view
- Drag & drop projects into collections

### 4. Tags Manager

- Create/edit/delete tags with color picker
- See usage count per tag

---

## Implementation Phases

### Phase 1 — Scaffold & Core Data

- Tauri v2 project setup with React + TypeScript
- SQLite database schema + Rust migrations
- Rust commands: CRUD for projects, tags, collections
- Managed file storage (copy/import with folder structure)

### Phase 2 — Library View

- Thumbnail grid with virtual scrolling
- Search (full-text via SQLite FTS5)
- Filter sidebar (tags, collections, file types)
- Sort controls
- Project creation flow

### Phase 3 — Project Detail

- Markdown editor with preview (using `react-markdown` or similar)
- Asset sections with revision timeline
- File import via drag & drop + file dialog
- Open file in native app (Affinity, BambuLab Studio)
- Manual thumbnail upload per project/revision

### Phase 4 — Thumbnail Generation

- Auto-extract thumbnails from `.3mf` files (they are ZIP archives containing a thumbnail PNG)
- For Affinity/HueForge: use file icon or let user set manually
- Thumbnail caching in Rust for fast grid rendering

### Phase 5 — Collections & Tags

- Collections CRUD with cover images
- Drag & drop project assignment
- Tag manager with color picker
- Tag assignment on projects

### Phase 6 — Polish

- macOS native feel (window management, menu bar, keyboard shortcuts)
- Dark/light mode following system
- Bulk operations (multi-select, bulk tag, bulk add to collection)
- Data backup/export

---

## Key Dependencies

| Layer    | Library                    | Purpose                    |
| -------- | -------------------------- | -------------------------- |
| Backend  | `tauri v2`                 | App framework              |
| Backend  | `rusqlite`                 | SQLite with FTS5           |
| Backend  | `zip` (Rust)               | Extract 3mf thumbnails     |
| Backend  | `image` (Rust)             | Thumbnail processing       |
| Frontend | `react` + `typescript`     | UI framework               |
| Frontend | `react-router`             | Navigation                 |
| Frontend | `@tanstack/react-virtual`  | Virtual scrolling          |
| Frontend | `react-markdown` + `codemirror` | Markdown edit/preview |
| Frontend | `react-dropzone`           | File drag & drop           |
| Frontend | `tailwindcss`              | Styling                    |

---

## Risks & Mitigations

| Risk                                          | Mitigation                                                    |
| --------------------------------------------- | ------------------------------------------------------------- |
| Affinity files have no easy thumbnail extraction | Fall back to file icon + manual thumbnail upload            |
| HueForge file format is proprietary           | Manual thumbnail or screenshot import                         |
| Performance with hundreds of thumbnails        | Virtual scrolling + Rust-side thumbnail cache at fixed sizes  |
| SQLite FTS on markdown content                 | FTS5 index on project name + description + tags               |
