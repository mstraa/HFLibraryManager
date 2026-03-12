---
sidebar_position: 2
---

# Getting Started

## Prerequisites

- [Rust](https://rustup.rs/) 1.70+
- [Node.js](https://nodejs.org/) 18+
- Platform dependencies for Tauri:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2
  - **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

## Installation

### From Releases

Download the latest release for your platform from the [GitHub Releases](https://github.com/mstraa/HFLibraryManager/releases) page:

- **macOS**: `.dmg` installer
- **Windows**: `.msi` or `.exe` installer
- **Linux**: `.deb` package or `.AppImage`

### From Source

```bash
# Clone the repository
git clone https://github.com/mstraa/HFLibraryManager.git
cd HFLibraryManager

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## First Launch

On first launch, HF Library Manager will show a **Welcome screen** where you choose a location for your project library. This is where all your project files and databases will be stored.

The default location is:
- **macOS**: `~/HFLibraryManager/`
- **Windows**: `~\HFLibraryManager\`
- **Linux**: `~/HFLibraryManager/`

You can change this later or add multiple libraries from the Settings page.

## Creating Your First Project

1. Click **New Project** (or `Cmd/Ctrl + N`)
2. Enter a project name and optionally select a folder to import files from
3. Your project is created with files auto-categorized by type
4. Add tags, notes, filament info, and print specs as needed
