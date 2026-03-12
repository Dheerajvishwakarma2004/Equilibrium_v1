#!/bin/bash
# .vscode/terminal-init.sh
# Sourced every time a new integrated terminal opens in VS Code.
# Loads your normal shell config first, then updates the local IP.

# ── Load standard Git Bash / bash config ────────────────────────────────────
[ -f ~/.bash_profile ] && source ~/.bash_profile
[ -f ~/.bashrc ]       && source ~/.bashrc

# ── Resolve workspace root (one level up from this .vscode folder) ───────────
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Run the IP update script ─────────────────────────────────────────────────
if [ -f "$WORKSPACE_ROOT/update-ip.js" ]; then
  node "$WORKSPACE_ROOT/update-ip.js"
fi
