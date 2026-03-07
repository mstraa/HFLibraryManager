#!/bin/bash
set -e

echo "=== 3D Print Manager - Build Script ==="
echo ""

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed."; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "Error: Rust/Cargo is not installed."; exit 1; }

# Install npm deps if needed
if [ ! -d "node_modules" ]; then
  echo "[1/3] Installing npm dependencies..."
  npm install
else
  echo "[1/3] npm dependencies already installed."
fi

# Type-check frontend
echo "[2/3] Type-checking frontend..."
npx tsc --noEmit

# Build the Tauri app (this builds frontend + Rust + bundles the .app)
echo "[3/3] Building Tauri app (release mode)..."
npx tauri build

echo ""
echo "=== Build complete ==="
echo "App bundle: src-tauri/target/release/bundle/macos/3D Print Manager.app"
echo "DMG:        src-tauri/target/release/bundle/dmg/"
