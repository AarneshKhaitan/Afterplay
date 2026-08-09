"""Fail fast, and legibly, when the suite is run outside the project environment.

A reviewer ran `python -m pytest tests\\test_pipeline.py` with bare system Python and got
8 failures and 5 errors, all `ModuleNotFoundError: No module named 'cv2'`, spread across
render/crop/QC paths. The reasonable conclusion from that output is "the render pipeline
is broken"; the actual cause is that `requirements.txt` was never installed.

Thirteen scattered failures should be one sentence naming the fix. Everything checked here
is a hard, declared dependency in `requirements.txt` — optional ones (faster-whisper,
anthropic, mcp) must NOT be listed, because their absence is a supported state that the
suite deliberately covers via each degradation path.
"""
from __future__ import annotations

import sys

import pytest

# (import name, requirements.txt entry) — import name and package name differ for cv2.
REQUIRED = [
    ("cv2", "opencv-python>=4.9"),
    ("numpy", "numpy>=1.26"),
    ("imageio_ffmpeg", "imageio-ffmpeg>=0.5"),
    ("yt_dlp", "yt-dlp>=2025.1.1"),
    ("openai", "openai>=1.50"),
]


def pytest_configure(config):
    import importlib.util

    missing = [(mod, req) for mod, req in REQUIRED
               if importlib.util.find_spec(mod) is None]
    if not missing:
        return

    names = ", ".join(req for _, req in missing)
    raise pytest.UsageError(
        f"\n\nMissing required dependencies: {names}\n\n"
        f"  Interpreter: {sys.executable}\n\n"
        "This is an environment problem, not a code failure. From "
        "services/video-clipper:\n\n"
        "  Windows:  python -m venv .venv && "
        ".\\.venv\\Scripts\\python -m pip install -r requirements.txt\n"
        "  Linux/macOS:  ./setup.sh --test\n\n"
        "Then run pytest with that interpreter (.venv/Scripts/python -m pytest tests).\n"
    )
