#!/usr/bin/env bash
set -euo pipefail

# OpenToken installer — downloads plugin into OpenCode plugin directory

PLUGIN_DIR="${HOME}/.config/opencode/plugins/opentoken"

echo "Installing OpenToken..."

# Clean previous install
if [ -d "$PLUGIN_DIR" ]; then
  echo "Removing previous install at $PLUGIN_DIR"
  rm -rf "$PLUGIN_DIR"
fi

mkdir -p "$PLUGIN_DIR"

# Download latest source
curl -fsSL https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz | tar xz --strip-components=1 -C "$PLUGIN_DIR"

echo "OpenToken installed to $PLUGIN_DIR"
echo "Restart opencode to activate."
