---
sidebar_position: 7
---

# Multi-Library Support

Maintain separate project databases for different use cases — one for personal projects, another for client work, etc.

## Managing Libraries

From **Settings**, you can:
- **Add** a new library with a custom location
- **Rename** existing libraries
- **Remove** a library (database and files remain on disk)
- **Switch** between libraries instantly

## Data Isolation

Each library has:
- Its own SQLite database
- Its own file storage directory
- Independent projects, tags, and collections

The **curated filament library** is shared across all libraries — changes to filaments are visible everywhere.

## Storage Layout

```
~/HFLibraryManager/               Default library location
├── db.sqlite                      Project database
├── projects/
│   └── {uuid}/
│       ├── files/                 Project files
│       └── thumbnails/            Auto-generated thumbnails
└── deleted/                       Soft-deleted trash
```

### Config Directory

Platform-specific location for app configuration:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/HFLibraryManager/` |
| Windows | `%APPDATA%\HFLibraryManager\` |
| Linux | `~/.config/HFLibraryManager/` |

Contains:
- `config.json` — Library list and preferences
- `filaments.sqlite` — Shared filament database
