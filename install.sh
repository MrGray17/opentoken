#!/usr/bin/env bash
set -euo pipefail

# OpenToken installer — downloads plugin into OpenCode plugin directory

PLUGIN_DIR="${HOME}/.config/opencode/plugins/opentoken"
PLUGIN_FILE="${HOME}/.config/opencode/plugins/opentoken.ts"

echo "Installing OpenToken..."

# Clean previous install
if [ -d "$PLUGIN_DIR" ]; then
  echo "Removing previous install at $PLUGIN_DIR"
  rm -rf "$PLUGIN_DIR"
fi
if [ -f "$PLUGIN_FILE" ]; then
  rm -f "$PLUGIN_FILE"
fi

mkdir -p "$PLUGIN_DIR"

# Download latest source
TMPDIR=$(mktemp -d)
curl -fsSL https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz | tar xz -C "$TMPDIR" --strip-components=1

# Copy plugin source into subdirectory
cp -r "$TMPDIR/src/"* "$PLUGIN_DIR/"

# Copy the entry file to the plugins root (OpenCode loads .ts files from root)
cp "$PLUGIN_DIR/index.ts" "$PLUGIN_FILE"

# Update imports in the entry file to point to subdirectory
sed -i 's|from "./|from "./opentoken/|g' "$PLUGIN_FILE"

# Copy the dependency declaration
cp "$TMPDIR/.opencode/package.json" "$PLUGIN_DIR/package.json"

# Cleanup
rm -rf "$TMPDIR"

echo "OpenToken installed to $PLUGIN_DIR"
echo "Entry point: $PLUGIN_FILE"
echo "Restart opencode to activate."
