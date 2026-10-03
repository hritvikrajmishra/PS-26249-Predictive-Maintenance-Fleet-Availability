#!/usr/bin/env python3
"""Cross-platform task runner for Integrated Predictive Maintenance & Fleet Availability Platform.

Supported commands:
    dev      Start backend (uvicorn) and frontend (Vite) concurrently with graceful shutdown.
    test     Run backend pytest suite and frontend vitest suite.
    lint     Run backend ruff checks/formatting and frontend eslint.
    migrate  Run Alembic database migrations.
    seed     Generate synthetic fleet data and populate PostgreSQL database (Phase 2).

Usage:
    python scripts/tasks.py dev
    python scripts/tasks.py test
    python scripts/tasks.py lint
    python scripts/tasks.py migrate
    python scripts/tasks.py seed [--seed 42]
"""

import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def get_npm_cmd() -> str:
    """Find the platform-appropriate npm executable."""
    npm_path = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not npm_path:
        raise FileNotFoundError("Could not find 'npm' executable in PATH. Please install Node.js.")
    return npm_path


def run_dev() -> int:
    """Start uvicorn and Vite dev server concurrently; stop both on Ctrl+C."""
    print("=" * 65)
    print("Starting Integrated Predictive Maintenance Platform (Phase 0 Skeleton)")
    print("=" * 65)
    print("  • Backend:  http://127.0.0.1:8000 (API Docs: http://127.0.0.1:8000/docs)")
    print("  • Frontend: http://localhost:5173")
    print("  • Health:   http://localhost:5173/api/v1/health")
    print("Press Ctrl+C to terminate both servers gracefully.\n")

    npm_cmd = get_npm_cmd()

    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR) + os.pathsep + env.get("PYTHONPATH", "")

    backend_proc = None
    frontend_proc = None

    try:
        # Start backend uvicorn process
        backend_args = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--reload",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ]
        backend_proc = subprocess.Popen(backend_args, cwd=str(BACKEND_DIR), env=env)

        # Start frontend Vite process
        frontend_args = [npm_cmd, "run", "dev"]
        frontend_proc = subprocess.Popen(
            frontend_args, cwd=str(FRONTEND_DIR), env=os.environ.copy()
        )

        # Monitor processes
        while True:
            b_poll = backend_proc.poll()
            f_poll = frontend_proc.poll()
            if b_poll is not None:
                print(f"\n[Backend] Process exited prematurely with code {b_poll}")
                break
            if f_poll is not None:
                print(f"\n[Frontend] Process exited prematurely with code {f_poll}")
                break
            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\n[Shutdown] Ctrl+C received. Gracefully stopping servers...")
    finally:
        for name, proc in [("Backend", backend_proc), ("Frontend", frontend_proc)]:
            if proc and proc.poll() is None:
                print(f"[Shutdown] Terminating {name} (PID: {proc.pid})...")
                try:
                    if sys.platform == "win32":
                        # Terminate process tree on Windows
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False,
                        )
                    else:
                        proc.send_signal(signal.SIGTERM)
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
        print("[Shutdown] All servers stopped successfully.")

    return 0


def run_test() -> int:
    """Run pytest suite and frontend test suite."""
    print("=" * 60)
    print("Running Test Suites")
    print("=" * 60)

    # 1. Backend tests
    print("\n--- [1/2] Running Backend Tests (pytest) ---")
    pytest_res = subprocess.run([sys.executable, "-m", "pytest"], cwd=str(ROOT_DIR))
    if pytest_res.returncode != 0:
        print(f"\n[FAILED] Backend tests failed with exit code {pytest_res.returncode}")
        return pytest_res.returncode

    # 2. Frontend tests
    print("\n--- [2/2] Running Frontend Tests (vitest) ---")
    npm_cmd = get_npm_cmd()
    frontend_res = subprocess.run([npm_cmd, "test"], cwd=str(FRONTEND_DIR))
    if frontend_res.returncode != 0:
        print(f"\n[FAILED] Frontend tests failed with exit code {frontend_res.returncode}")
        return frontend_res.returncode

    print("\n" + "=" * 60)
    print("[SUCCESS] All test suites passed!")
    print("=" * 60)
    return 0


def run_lint() -> int:
    """Run ruff checks, format check, and frontend eslint."""
    print("=" * 60)
    print("Running Code Quality and Linter Checks")
    print("=" * 60)

    # 1. Ruff lint
    print("\n--- [1/3] Running Python Linter (ruff check) ---")
    ruff_check = subprocess.run([sys.executable, "-m", "ruff", "check", "."], cwd=str(ROOT_DIR))
    if ruff_check.returncode != 0:
        return ruff_check.returncode

    # 2. Ruff format check
    print("\n--- [2/3] Checking Python Formatting (ruff format --check) ---")
    ruff_fmt = subprocess.run(
        [sys.executable, "-m", "ruff", "format", "--check", "."], cwd=str(ROOT_DIR)
    )
    if ruff_fmt.returncode != 0:
        return ruff_fmt.returncode

    # 3. Frontend eslint
    print("\n--- [3/3] Running Frontend Linter (eslint) ---")
    npm_cmd = get_npm_cmd()
    eslint_res = subprocess.run([npm_cmd, "run", "lint"], cwd=str(FRONTEND_DIR))
    if eslint_res.returncode != 0:
        return eslint_res.returncode

    print("\n" + "=" * 60)
    print("[SUCCESS] All lint and formatting checks passed!")
    print("=" * 60)
    return 0


def run_migrate(args: list[str] | None = None) -> int:
    """Run Alembic database migrations."""
    print("=" * 60)
    print("Running Database Migrations (Alembic)")
    print("=" * 60)

    alembic_args = [sys.executable, "-m", "alembic"]
    if not args:
        # Default action: upgrade head
        alembic_args.extend(["upgrade", "head"])
    else:
        alembic_args.extend(args)

    print(f"Executing: {' '.join(alembic_args)}\n")
    res = subprocess.run(alembic_args, cwd=str(ROOT_DIR))
    if res.returncode != 0:
        print(f"\n[FAILED] Migration failed with exit code {res.returncode}")
        return res.returncode

    print("\n" + "=" * 60)
    print("[SUCCESS] Database migration completed successfully!")
    print("=" * 60)
    return 0


def run_seed(args: list[str] | None = None) -> int:
    """Run synthetic data generator to seed the database."""
    print("=" * 60)
    print("Seeding Synthetic Fleet Data (data_gen)")
    print("=" * 60)

    gen_args = [sys.executable, "-m", "data_gen", "generate"]
    if args:
        gen_args.extend(args)
    else:
        gen_args.extend(["--seed", "42"])

    res = subprocess.run(gen_args, cwd=str(ROOT_DIR))
    if res.returncode != 0:
        print(f"\n[FAILED] Data seeding failed with exit code {res.returncode}")
        return res.returncode
    return 0


def print_help() -> None:
    print(__doc__)


def main() -> int:
    if len(sys.argv) < 2:
        print_help()
        return 1

    cmd = sys.argv[1].lower()
    extra_args = sys.argv[2:]
    if cmd == "dev":
        return run_dev()
    elif cmd == "test":
        return run_test()
    elif cmd == "lint":
        return run_lint()
    elif cmd == "migrate":
        return run_migrate(extra_args)
    elif cmd == "seed":
        return run_seed(extra_args)
    elif cmd in ("-h", "--help", "help"):
        print_help()
        return 0
    else:
        print(f"Unknown command: '{cmd}'. Supported commands: dev, test, lint, migrate, seed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
