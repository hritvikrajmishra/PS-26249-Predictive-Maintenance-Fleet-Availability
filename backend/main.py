"""Shim to expose FastAPI app as backend.main:app or app.main:app."""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

for p in (str(ROOT_DIR), str(BACKEND_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from app.main import app  # noqa: F401
