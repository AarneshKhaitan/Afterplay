#!/usr/bin/env bash
# Afterplay — one-shot setup for Linux and macOS.
#
#   ./setup.sh              create venv, install, verify, print usage
#   ./setup.sh --test       also run the full test suite (~35s, needs ffmpeg)
#   ./setup.sh --dev        install dev extras (pytest, ruff)
#
# Idempotent: safe to re-run. Never touches your global Python.
set -euo pipefail

VENV=".venv"
PY_MIN="3.10"
DO_TEST=0
DO_DEV=0
for arg in "$@"; do
  case "$arg" in
    --test) DO_TEST=1; DO_DEV=1 ;;
    --dev)  DO_DEV=1 ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"
case "$OS" in
  Linux)  PKG_HINT="sudo apt-get install -y ffmpeg   # or: dnf/pacman install ffmpeg" ;;
  Darwin) PKG_HINT="brew install ffmpeg" ;;
  *)      PKG_HINT="install ffmpeg for your platform" ;;
esac

bold "Afterplay setup  ($OS)"

# ── 1. Python ────────────────────────────────────────────────────────────────
PYTHON=""
for cand in python3.13 python3.12 python3.11 python3.10 python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c "import sys; raise SystemExit(0 if sys.version_info[:2] >= (3,10) else 1)" 2>/dev/null; then
      PYTHON="$cand"; break
    fi
  fi
done
[ -n "$PYTHON" ] || die "need Python >= $PY_MIN (found none). Install it and re-run."
ok "python: $("$PYTHON" --version 2>&1) at $(command -v "$PYTHON")"

# ── 2. venv ──────────────────────────────────────────────────────────────────
if [ ! -d "$VENV" ]; then
  "$PYTHON" -m venv "$VENV" || die "venv creation failed (on Debian: apt-get install python3-venv)"
  ok "created $VENV"
else
  ok "reusing existing $VENV"
fi
VPY="$VENV/bin/python"
[ -x "$VPY" ] || die "$VPY missing — delete $VENV and re-run"

# ── 3. dependencies ──────────────────────────────────────────────────────────
"$VPY" -m pip install --quiet --upgrade pip >/dev/null
bold "Installing dependencies (this is the slow part)"
"$VPY" -m pip install --quiet -r requirements.txt || die "dependency install failed"
ok "installed: yt-dlp, opencv, numpy, imageio-ffmpeg"
if [ "$DO_DEV" = "1" ]; then
  "$VPY" -m pip install --quiet pytest ruff >/dev/null && ok "installed dev extras"
fi
"$VPY" -m pip install --quiet -e . >/dev/null 2>&1 && ok "installed afterplay (editable)" \
  || warn "editable install skipped; use 'python -m afterplay.cli' instead of 'afterplay'"

# ── 4. ffmpeg ────────────────────────────────────────────────────────────────
# A system ffmpeg is preferred (hardware encoders); the imageio-ffmpeg wheel is the
# always-available fallback and is what the package uses if PATH has nothing.
if command -v ffmpeg >/dev/null 2>&1; then
  ok "system ffmpeg: $(ffmpeg -version 2>/dev/null | head -1 | cut -c1-60)"
else
  warn "no system ffmpeg on PATH; using the bundled imageio-ffmpeg build"
  warn "for hardware encoding (NVENC/QSV/VideoToolbox) install it: $PKG_HINT"
fi

# ── 5. verify ────────────────────────────────────────────────────────────────
bold "Verifying environment"
"$VPY" -m afterplay.cli doctor || die "doctor failed — see output above"

if [ "$DO_TEST" = "1" ]; then
  bold "Running the test suite"
  "$VPY" -m pytest tests/ -q || die "tests failed"
fi

# ── 6. usage ─────────────────────────────────────────────────────────────────
cat <<'USAGE'

────────────────────────────────────────────────────────────────────────────
Ready. Activate the environment:

    source .venv/bin/activate

DECIDE ONLY (no video bytes fetched, < 10s):

    afterplay plan "https://youtu.be/VIDEO_ID" --clips 5
    afterplay plan "https://youtu.be/VIDEO_ID" --clips 5 --json    # machine-readable

FULL RUN (extract → reframe → caption → QC → deliver):

    afterplay run "https://youtu.be/VIDEO_ID" --clips 5 --platforms shorts

    # multi-platform fan-out, parallel workers, per-creator memory
    afterplay run "URL" --clips 6 --platforms shorts,reels,tiktok --workers 6 --creator ksi

    # a file you own (preferred: faster and no platform ToS question)
    afterplay run --local ./episode.mp4 --vtt ./episode.en.vtt --clips 5

    # headless / queue use
    afterplay run "URL" --json --webhook https://your.app/afterplay-callback

LLM policy (moment ranking + vision QC on real frames):

    export ANTHROPIC_API_KEY=sk-...
    afterplay run "URL" --clips 5 --llm

OPTIONAL EXTRAS:

    python -c "from afterplay.vision import fetch_model; fetch_model()"   # face model
    pip install faster-whisper   && export AFTERPLAY_WHISPER_SIZE=base    # ASR
    pip install "mcp[cli]"       && python -m afterplay.mcp_server        # MCP server

INSPECT:

    afterplay doctor              # environment + detected encoder
    afterplay memory ksi          # what the agent has learned about this creator

Outputs land in ~/.afterplay/work/<job_id>/ with a manifest.json describing every
clip, its QC findings and any repairs applied.

Docs: README.md · craft rules the agent follows: afterplay/skills/*.md
────────────────────────────────────────────────────────────────────────────
USAGE
