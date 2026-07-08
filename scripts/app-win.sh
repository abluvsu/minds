#!/usr/bin/env bash
# app-win.sh — one-shot Windows desktop build from LOCAL uncommitted source.
#
# Runs the full known-good sequence, fail-fast:
#   1. frontend production build   (tsc main + vite renderer)
#   2. electron-builder --dir      (unpacked app → frontend/release/win-unpacked)
#   3. (re)install the local cowork-server uv tool the packaged app launches
#
# Exists because build / package / server-install are separate manual steps
# and skipping one ships a stale renderer in the packaged app.
#
# Usage (Git Bash):
#   scripts/app-win.sh                 # full sequence
#   scripts/app-win.sh --relaunch      # …then launch the packaged exe
#   scripts/app-win.sh --skip-server   # steps 1–2 only (leave the running
#                                      # server alone, e.g. another workstream
#                                      # depends on it)
# Or via make: `make app-win` / `make app-win RELAUNCH=1`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"
API="$ROOT/backend/core_api"
EXE="$FRONTEND/release/win-unpacked/MindsHub Cowork.exe"

RELAUNCH=0
SKIP_SERVER=0
for arg in "$@"; do
  case "$arg" in
    --relaunch)    RELAUNCH=1 ;;
    --skip-server) SKIP_SERVER=1 ;;
    *) echo "app-win.sh: unknown argument: $arg" >&2
       echo "usage: scripts/app-win.sh [--relaunch] [--skip-server]" >&2
       exit 2 ;;
  esac
done

echo "==> [1/3] frontend build (tsc main + vite renderer)"
(cd "$FRONTEND" && npm run build)

echo "==> [2/3] package unpacked Windows app (electron-builder --dir)"
# -c.npmRebuild=false is REQUIRED on this machine: the node-pty native
# rebuild fails without Visual Studio; prebuilds ship in the package.
# NOTE: a winCodeSign symlink error may appear in the output — it is
# non-fatal for --dir builds; the exe check below is the real gate.
export CSC_IDENTITY_AUTO_DISCOVERY=false
if ! (cd "$FRONTEND" && timeout 600 npx electron-builder --dir -c.npmRebuild=false); then
  echo "FAIL: electron-builder timed out or failed (10-min limit)" >&2
  exit 1
fi

if [ ! -f "$EXE" ]; then
  echo "FAIL: packaged exe not found: $EXE" >&2
  exit 1
fi

if [ "$SKIP_SERVER" -eq 1 ]; then
  echo "==> [3/3] SKIPPED (--skip-server): cowork-server not reinstalled"
else
  echo "==> [3/3] (re)install local cowork-server (uv tool install)"
  # uv tool install fails with access-denied while a cowork-server python
  # process is running — stop any such process first.
  powershell.exe -NoProfile -NonInteractive -Command - <<'PSEOF'
$procs = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'python%'" |
  Where-Object { $_.CommandLine -match 'cowork-server' })
if ($procs.Count -eq 0) {
  Write-Host "  no running cowork-server python process"
} else {
  foreach ($p in $procs) {
    Write-Host ("  stopping cowork-server python (PID " + $p.ProcessId + ")")
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
PSEOF
  (cd "$API" && UV_PYTHON_PREFERENCE=only-managed uv tool install "$(pwd)" \
    --force --reinstall --python '>=3.12,<3.14')
  STAMP_DIR="$HOME/.cowork"
  mkdir -p "$STAMP_DIR"
  cat > "$STAMP_DIR/server-build-stamp.json" <<STAMPEOF
{"hash": "$(git rev-parse --short HEAD)", "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "channel": "dev"}
STAMPEOF
  echo "  build stamp written: $STAMP_DIR/server-build-stamp.json"
fi

if [ "$RELAUNCH" -eq 1 ]; then
  echo "==> relaunching packaged app"
  cmd //c start "" "$(cygpath -w "$EXE")"
fi

echo "✓ Packaged app: $EXE"
