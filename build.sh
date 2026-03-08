#!/bin/bash
set -e

APP_NAME="HF Library Manager"

echo "=== ${APP_NAME} - Build Script ==="
echo ""

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed."; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "Error: Rust/Cargo is not installed."; exit 1; }

# Parse arguments
TARGET=""
PLATFORM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --mac|--macos)        PLATFORM="macos-arm";    shift ;;
    --mac-intel|--intel)  PLATFORM="macos-intel";   shift ;;
    --mac-universal)      PLATFORM="macos-universal"; shift ;;
    --windows|--win)      PLATFORM="windows";       shift ;;
    --linux)              PLATFORM="linux";         shift ;;
    --all)                PLATFORM="all";           shift ;;
    -h|--help)
      echo "Usage: ./build.sh [--mac] [--mac-intel] [--mac-universal] [--windows] [--linux] [--all]"
      echo ""
      echo "  --mac             macOS Apple Silicon (aarch64) [default on ARM Mac]"
      echo "  --mac-intel       macOS Intel (x86_64)"
      echo "  --mac-universal   macOS Universal (both architectures)"
      echo "  --windows         Windows (x86_64), requires cross-compilation toolchain"
      echo "  --linux           Linux (x86_64), requires cross-compilation toolchain"
      echo "  --all             Build for all platforms"
      echo ""
      echo "Cross-compilation prerequisites:"
      echo "  Windows:  rustup target add x86_64-pc-windows-msvc"
      echo "  Linux:    rustup target add x86_64-unknown-linux-gnu"
      echo "  Intel:    rustup target add x86_64-apple-darwin"
      exit 0
      ;;
    *) echo "Unknown option: $1. Use --help for usage."; exit 1 ;;
  esac
done

# Default to native macOS build
if [ -z "$PLATFORM" ]; then
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    PLATFORM="macos-arm"
  else
    PLATFORM="macos-intel"
  fi
  echo "No platform specified, defaulting to native macOS ($ARCH)"
fi

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

# Detect native Rust target
NATIVE_TARGET=""
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  NATIVE_TARGET="aarch64-apple-darwin"
else
  NATIVE_TARGET="x86_64-apple-darwin"
fi

# Build function
build_target() {
  local label=$1
  local target=$2
  local bundle_dir=$3

  echo ""
  echo "--- Building for ${label} ---"

  if [ "$target" = "$NATIVE_TARGET" ]; then
    # Native build — no cross-compilation needed
    npx tauri build --target "$target"
  elif [ -n "$target" ]; then
    # Cross-compilation — ensure target is installed via rustup
    if command -v rustup >/dev/null 2>&1; then
      if ! rustup target list --installed | grep -q "$target"; then
        echo "Installing Rust target: ${target}"
        rustup target add "$target"
      fi
    else
      echo "Note: rustup not found (Rust installed via Homebrew?)."
      echo "      Cross-compilation target '${target}' must be set up manually."
      echo "      Install rustup: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
      exit 1
    fi
    npx tauri build --target "$target"
  else
    npx tauri build
  fi

  echo "  Output: src-tauri/target/${bundle_dir}"
}

echo "[3/3] Building Tauri app (release mode)..."

case $PLATFORM in
  macos-arm)
    build_target "macOS (Apple Silicon)" "aarch64-apple-darwin" "aarch64-apple-darwin/release/bundle/"
    ;;
  macos-intel)
    build_target "macOS (Intel)" "x86_64-apple-darwin" "x86_64-apple-darwin/release/bundle/"
    ;;
  macos-universal)
    build_target "macOS (Universal)" "universal-apple-darwin" "universal-apple-darwin/release/bundle/"
    ;;
  windows)
    build_target "Windows (x86_64)" "x86_64-pc-windows-msvc" "x86_64-pc-windows-msvc/release/bundle/"
    ;;
  linux)
    build_target "Linux (x86_64)" "x86_64-unknown-linux-gnu" "x86_64-unknown-linux-gnu/release/bundle/"
    ;;
  all)
    build_target "macOS (Apple Silicon)" "aarch64-apple-darwin" "aarch64-apple-darwin/release/bundle/"
    build_target "macOS (Intel)" "x86_64-apple-darwin" "x86_64-apple-darwin/release/bundle/"
    build_target "Windows (x86_64)" "x86_64-pc-windows-msvc" "x86_64-pc-windows-msvc/release/bundle/"
    build_target "Linux (x86_64)" "x86_64-unknown-linux-gnu" "x86_64-unknown-linux-gnu/release/bundle/"
    ;;
esac

echo ""
echo "=== Build complete ==="
