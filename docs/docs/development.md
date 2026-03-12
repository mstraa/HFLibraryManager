---
sidebar_position: 5
---

# Development

## Setup

```bash
# Clone
git clone https://github.com/mstraa/HFLibraryManager.git
cd HFLibraryManager

# Install frontend dependencies
npm install

# Run development server (starts both Vite and Tauri)
npm run tauri dev
```

## Building

```bash
# Production build
npm run tauri build
```

Produces platform-specific installers:
- **macOS**: `.dmg`
- **Windows**: `.msi` + `.exe`
- **Linux**: `.deb` + `.AppImage`

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`) builds for all platforms on tag push:

| Target | Runner | Artifacts |
|--------|--------|-----------|
| macOS ARM64 | `macos-latest` | `.dmg` |
| macOS x64 | `macos-latest` | `.dmg` |
| macOS Universal | `macos-latest` | `.dmg` (fat binary) |
| Windows x64 | `windows-latest` | `.msi`, `.exe` |
| Linux x64 | `ubuntu-22.04` | `.deb`, `.AppImage` |

### Creating a Release

```bash
git tag v0.x.x
git push --tags
```

This triggers the workflow and creates a draft GitHub Release with all platform binaries attached.

### macOS Code Signing

For signed macOS builds, set these secrets in your GitHub repository:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

Without these, builds work but macOS shows an "unidentified developer" warning.

## Project Structure

```
HFLibraryManager/
├── src/                    React frontend
├── src-tauri/              Rust backend
├── docs/                   Documentation site (Docusaurus)
├── public/                 Static assets
├── index.html              Vite entry point
├── package.json            Frontend dependencies
├── vite.config.ts          Vite configuration
├── tsconfig.json           TypeScript configuration
└── CLAUDE.md               AI assistant instructions
```
