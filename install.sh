#!/usr/bin/env bash
set -euo pipefail

# OpenToken installer — downloads plugin into OpenCode plugin directory
# VERSION: Update this when releasing a new version
OPENTOKEN_VERSION="${OPENTOKEN_VERSION:-1.1.0}"

PLUGIN_DIR="${HOME}/.config/opencode/plugins/opentoken"
PLUGIN_FILE="${HOME}/.config/opencode/plugins/opentoken.ts"
TUI_FILE="${HOME}/.config/opencode/plugins/opentoken-tui.tsx"
TUI_CONFIG="${HOME}/.config/opencode/tui.json"

echo "Installing OpenToken v${OPENTOKEN_VERSION}..."

# Clean previous install
if [ -d "$PLUGIN_DIR" ]; then
  echo "Removing previous install at $PLUGIN_DIR"
  rm -rf "$PLUGIN_DIR"
fi
if [ -f "$PLUGIN_FILE" ]; then
  rm -f "$PLUGIN_FILE"
fi
if [ -f "$TUI_FILE" ]; then
  rm -f "$TUI_FILE"
fi

mkdir -p "$PLUGIN_DIR"

# Download from tagged release (not main branch) for reproducible installs
TMPDIR=$(mktemp -d)
DOWNLOAD_URL="https://github.com/MrGray17/opentoken/archive/refs/tags/v${OPENTOKEN_VERSION}.tar.gz"

echo "Downloading from ${DOWNLOAD_URL}..."
if ! curl -fsSL "$DOWNLOAD_URL" | tar xz -C "$TMPDIR" --strip-components=1 2>/dev/null; then
  echo "ERROR: Failed to download OpenToken v${OPENTOKEN_VERSION}"
  echo "Check that the version tag exists: https://github.com/MrGray17/opentoken/releases"
  echo "Or set a different version: OPENTOKEN_VERSION=1.0.0 bash install.sh"
  rm -rf "$TMPDIR"
  exit 1
fi

# Copy plugin source into subdirectory
cp -r "$TMPDIR/src/"* "$PLUGIN_DIR/"

# Copy the server entry file to the plugins root (OpenCode loads .ts files from root)
cp "$PLUGIN_DIR/index.ts" "$PLUGIN_FILE"

# Update imports: first normalize any double-prefixes, then apply correct prefix
sed -i 's|from "./opentoken/opentoken/|from "./opentoken/|g' "$PLUGIN_FILE"
sed -i 's|from "./|from "./opentoken/|g' "$PLUGIN_FILE"

# Copy the TUI entry file
cp "$PLUGIN_DIR/tui.tsx" "$TUI_FILE"
sed -i 's|from "./opentoken/opentoken/|from "./opentoken/|g' "$TUI_FILE"
sed -i 's|from "./|from "./opentoken/|g' "$TUI_FILE"

# Copy the dependency declaration (inline, not from repo)
# Includes TUI deps for status bar plugin
cat > "$PLUGIN_DIR/package.json" << 'EOF'
{
  "deps": {
    "@opencode-ai/plugin": "^1.15.5",
    "@opentui/solid": "^0.2.14",
    "@opentui/core": "^0.2.14",
    "solid-js": "^1.9.13"
  }
}
EOF

# Install dependencies
echo "Installing dependencies..."
cd "$PLUGIN_DIR"
if command -v bun &>/dev/null; then
  bun install --production 2>/dev/null || echo "WARNING: bun install failed"
elif command -v npm &>/dev/null; then
  npm install --production 2>/dev/null || echo "WARNING: npm install failed"
else
  echo "WARNING: neither bun nor npm found — deps not installed"
fi
cd - > /dev/null

# Configure TUI plugin in tui.json
if [ -f "$TUI_CONFIG" ]; then
  # Add opentoken-tui to existing tui.json if not already present
  if ! grep -q "opentoken-tui" "$TUI_CONFIG"; then
    # Use node/bun to safely modify JSON
    if command -v bun &> /dev/null; then
      bun -e "
        const config = JSON.parse(require('fs').readFileSync('$TUI_CONFIG', 'utf8'));
        if (!config.plugin) config.plugin = [];
        if (!config.plugin.includes('./plugins/opentoken-tui.tsx')) {
          config.plugin.push('./plugins/opentoken-tui.tsx');
        }
        require('fs').writeFileSync('$TUI_CONFIG', JSON.stringify(config, null, 2));
      "
    elif command -v node &> /dev/null; then
      node -e "
        const config = JSON.parse(require('fs').readFileSync('$TUI_CONFIG', 'utf8'));
        if (!config.plugin) config.plugin = [];
        if (!config.plugin.includes('./plugins/opentoken-tui.tsx')) {
          config.plugin.push('./plugins/opentoken-tui.tsx');
        }
        require('fs').writeFileSync('$TUI_CONFIG', JSON.stringify(config, null, 2));
      "
    fi
  fi
else
  # Create new tui.json
  cat > "$TUI_CONFIG" << 'EOF'
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["./plugins/opentoken-tui.tsx"]
}
EOF
fi

# Cleanup
rm -rf "$TMPDIR"

echo "OpenToken v${OPENTOKEN_VERSION} installed to $PLUGIN_DIR"
echo "Server entry point: $PLUGIN_FILE"
echo "TUI entry point: $TUI_FILE"
echo "Restart opencode to activate."
