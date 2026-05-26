#!/usr/bin/env bash
set -euo pipefail

# ── Config ──────────────────────────────────────────────
OPENTOKEN_VERSION="${OPENTOKEN_VERSION:-1.2.0}"
PLUGIN_DIR="${HOME}/.config/opencode/plugins/opentoken"
PLUGIN_FILE="${HOME}/.config/opencode/plugins/opentoken.ts"
TUI_CONFIG="${HOME}/.config/opencode/tui.json"
TAG_URL="https://github.com/MrGray17/opentoken/archive/refs/tags/v${OPENTOKEN_VERSION}.tar.gz"
MAIN_URL="https://github.com/MrGray17/opentoken/archive/refs/heads/main.tar.gz"
EXPECTED_SHA256=""

# ── Help ────────────────────────────────────────────────
usage() {
  cat <<EOF
OpenToken installer v${OPENTOKEN_VERSION}

USAGE:
  bash install.sh [OPTIONS]

OPTIONS:
  -y, --yes              Skip confirmation prompt
  -u, --uninstall        Remove OpenToken from OpenCode
      --sha256 <hash>    Verify download SHA256 checksum
  -h, --help             Show this help message

ENVIRONMENT:
  OPENTOKEN_VERSION  Tag version to download (default: ${OPENTOKEN_VERSION})
                     Set to "main" to install from HEAD instead of a tag.

EXAMPLES:
  bash install.sh                    # Install with confirmation
  bash install.sh -y                 # Install silently
  bash install.sh --uninstall        # Remove OpenToken
  OPENTOKEN_VERSION=main bash install.sh  # Install from main branch
EOF
  exit 0
}

# ── Uninstall ───────────────────────────────────────────
uninstall() {
  echo "Removing OpenToken..."

  local removed=false

  if [ -d "$PLUGIN_DIR" ]; then
    rm -rf "$PLUGIN_DIR"
    echo "  Removed $PLUGIN_DIR"
    removed=true
  fi

  if [ -f "$PLUGIN_FILE" ]; then
    rm -f "$PLUGIN_FILE"
    echo "  Removed $PLUGIN_FILE"
    removed=true
  fi

  if [ -f "$TUI_CONFIG" ]; then
    local tmp
    tmp=$(mktemp)
    if command -v bun &>/dev/null; then
      bun -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$TUI_CONFIG', 'utf8'));
        if (cfg.plugin) {
          cfg.plugin = cfg.plugin.filter(p => !p.includes('opentoken'));
        }
        fs.writeFileSync('$TUI_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
      " 2>/dev/null && echo "  Removed opentoken from $TUI_CONFIG" && removed=true
    elif command -v node &>/dev/null; then
      node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$TUI_CONFIG', 'utf8'));
        if (cfg.plugin) {
          cfg.plugin = cfg.plugin.filter(p => !p.includes('opentoken'));
        }
        fs.writeFileSync('$TUI_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
      " 2>/dev/null && echo "  Removed opentoken from $TUI_CONFIG" && removed=true
    fi
    rm -f "$tmp"
  fi

  if [ "$removed" = false ]; then
    echo "  Nothing to remove — OpenToken is not installed."
  else
    echo "Done. Restart opencode to deactivate."
  fi
  exit 0
}

# ── Parse args ──────────────────────────────────────────
SKIP_CONFIRM=false
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    -u|--uninstall) uninstall ;;
    -y|--yes) SKIP_CONFIRM=true ;;
    --sha256)
      shift
      if [ $# -eq 0 ]; then
        echo "ERROR: --sha256 requires a hash argument"
        exit 1
      fi
      EXPECTED_SHA256="$1"
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run 'bash install.sh --help' for usage."
      exit 1
      ;;
  esac
  shift
done

# ── Confirmation ───────────────────────────────────────
if [ -d "$PLUGIN_DIR" ] || [ -f "$PLUGIN_FILE" ]; then
  if [ "$SKIP_CONFIRM" = false ]; then
    echo "OpenToken is already installed. Overwrite? [y/N] "
    read -r confirm </dev/tty
    case "$confirm" in
      y|Y|yes|YES) ;;
      *) echo "Aborted."; exit 0 ;;
    esac
  fi
fi

echo "Installing OpenToken v${OPENTOKEN_VERSION}..."

# ── Clean previous install ─────────────────────────────
if [ -d "$PLUGIN_DIR" ]; then
  echo "  Removing previous install at $PLUGIN_DIR"
  rm -rf "$PLUGIN_DIR"
fi
if [ -f "$PLUGIN_FILE" ]; then
  rm -f "$PLUGIN_FILE"
fi

mkdir -p "$PLUGIN_DIR"

# ── Download ───────────────────────────────────────────
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

download_and_verify() {
  local url=$1
  local source_label=$2
  local expected_sha=$3
  local archive="$TMPDIR/archive.tar.gz"

  echo "  Downloading from ${source_label}..."
  if ! curl -fsSL "$url" -o "$archive"; then
    return 1
  fi

  local actual_sha
  actual_sha=$(sha256sum "$archive" | cut -d' ' -f1)
  echo "  SHA256: $actual_sha"

  if [ -n "$expected_sha" ]; then
    if [ "$actual_sha" != "$expected_sha" ]; then
      echo "ERROR: SHA256 mismatch!"
      echo "  Expected: $expected_sha"
      echo "  Actual:   $actual_sha"
      echo "  The download may be corrupt or tampered with."
      exit 1
    fi
    echo "  Checksum verified ✓"
  fi

  tar xzf "$archive" -C "$TMPDIR" --strip-components=1 2>/dev/null
}

# Try tag, error if not found
if ! download_and_verify "$TAG_URL" "tag v${OPENTOKEN_VERSION}" "$EXPECTED_SHA256"; then
  echo "ERROR: Tag v${OPENTOKEN_VERSION} not found (404)."
  echo "Specify a valid tag via OPENTOKEN_VERSION=<tag> or check:"
  echo "  https://github.com/MrGray17/opentoken/releases"
  exit 1
fi

# ── Copy sources ───────────────────────────────────────
cp -r "$TMPDIR/src/"* "$PLUGIN_DIR/"

# Server entry point
cp "$PLUGIN_DIR/index.ts" "$PLUGIN_FILE"
sed -i 's|from "./opentoken/opentoken/|from "./opentoken/|g' "$PLUGIN_FILE"
sed -i 's|from "./|from "./opentoken/|g' "$PLUGIN_FILE"

# ── Dependency manifest (informational) ─────────────────
cat > "$PLUGIN_DIR/package.json" << 'EOF'
{
  "deps": {
    "@opencode-ai/plugin": "^1.15.5",
    "@opentui/solid": "0.2.14",
    "solid-js": "1.9.13"
  }
}
EOF

# ── Install dependencies ───────────────────────────────
echo "  Installing dependencies..."
cd "$PLUGIN_DIR"
if command -v bun &>/dev/null; then
  bun install --production 2>/dev/null || echo "  WARNING: bun install failed"
elif command -v npm &>/dev/null; then
  npm install --production 2>/dev/null || echo "  WARNING: npm install failed"
else
  echo "  WARNING: neither bun nor npm found — deps not installed"
fi
cd - > /dev/null

# ── TUI plugin registration ────────────────────────────
if [ -f "$TUI_CONFIG" ]; then
  if ! grep -q "mrgray17/opentoken" "$TUI_CONFIG"; then
    if command -v bun &>/dev/null; then
      bun -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$TUI_CONFIG', 'utf8'));
        if (!cfg.plugin) cfg.plugin = [];
        if (!cfg.plugin.includes('@mrgray17/opentoken@latest')) {
          cfg.plugin.push('@mrgray17/opentoken@latest');
        }
        fs.writeFileSync('$TUI_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
      "
    elif command -v node &>/dev/null; then
      node -e "
        const fs = require('fs');
        const cfg = JSON.parse(fs.readFileSync('$TUI_CONFIG', 'utf8'));
        if (!cfg.plugin) cfg.plugin = [];
        if (!cfg.plugin.includes('@mrgray17/opentoken@latest')) {
          cfg.plugin.push('@mrgray17/opentoken@latest');
        }
        fs.writeFileSync('$TUI_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
      "
    fi
  fi
else
  cat > "$TUI_CONFIG" << 'EOF'
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@mrgray17/opentoken@latest"]
}
EOF
fi

echo "OpenToken v${OPENTOKEN_VERSION} installed to $PLUGIN_DIR"
echo "Server entry point: $PLUGIN_FILE"
echo "Restart opencode to activate."
