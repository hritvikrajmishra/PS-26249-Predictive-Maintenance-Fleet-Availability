"""Screenshot capture runner orchestrator.

Checks for active server instances, launches single-process demo server if needed,
invokes the Playwright capture suite, and ensures clean resource teardown.
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a network port is currently bound by any process."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.connect((host, port))
            return True
        except (TimeoutError, ConnectionRefusedError, OSError):
            return False


def check_health(base_url: str, timeout: float = 2.0) -> bool:
    """Check whether the API health check endpoint returns 200 OK and database is connected."""
    health_url = f"{base_url.rstrip('/')}/api/v1/health"
    try:
        req = urllib.request.Request(health_url, headers={"User-Agent": "ScreenshotTool/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                body = resp.read().decode("utf-8")
                return '"status":"healthy"' in body or '"database":"connected"' in body
    except Exception:
        return False
    return False


def verify_seeded_data(base_url: str, timeout: float = 3.0) -> bool:
    """Confirm the backend database is populated with seeded demo user credentials."""
    login_url = f"{base_url.rstrip('/')}/api/v1/auth/login"
    try:
        data = json.dumps({"username": "commander", "password": "commander123"}).encode("utf-8")
        req = urllib.request.Request(
            login_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "ScreenshotTool/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        pass
    return False


def get_node_cmd() -> str:
    """Locate the node executable."""
    cmd = shutil.which("node.cmd" if sys.platform == "win32" else "node")
    if not cmd:
        cmd = shutil.which("node")
    if not cmd:
        raise FileNotFoundError("Could not find 'node' executable in PATH. Please install Node.js.")
    return cmd


def run_screenshots(extra_args: list[str] | None = None) -> int:
    """Main orchestration entrypoint for running screenshot capture."""
    extra_args = extra_args or []

    env_url = os.environ.get("SCREENSHOT_BASE_URL")
    server_proc = None
    started_server = False

    target_port = 8000
    if env_url:
        base_url = env_url
        print(f"[Screenshot] Using SCREENSHOT_BASE_URL: {base_url}")
    else:
        # Check default port 8000 or find next free port
        port_candidate = 8000
        while port_candidate <= 8020:
            if is_port_in_use(port_candidate):
                if check_health(f"http://127.0.0.1:{port_candidate}"):
                    target_port = port_candidate
                    print(
                        f"[Screenshot] Existing healthy app detected at http://127.0.0.1:{target_port}. Reusing."
                    )
                    break
                else:
                    print(
                        f"[Screenshot] Port {port_candidate} is in use but not responding to health check. Trying next port..."
                    )
                    port_candidate += 1
            else:
                target_port = port_candidate
                break

        base_url = f"http://127.0.0.1:{target_port}"

    # Determine if server is already running and healthy
    is_healthy = check_health(base_url)

    if not is_healthy:
        print(f"[Screenshot] Starting single-process demo server on port {target_port}...")
        env = os.environ.copy()
        env["PYTHONPATH"] = (
            str(BACKEND_DIR) + os.pathsep + str(ROOT_DIR) + os.pathsep + env.get("PYTHONPATH", "")
        )

        server_args = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(target_port),
        ]

        try:
            server_proc = subprocess.Popen(server_args, cwd=str(BACKEND_DIR), env=env)
            started_server = True
        except Exception as exc:
            print(f"[Screenshot] Failed to start uvicorn process: {exc}")
            return 1

        # Wait for health check to report OK
        print("[Screenshot] Waiting for server health check OK and seeded data...")
        max_attempts = 30
        healthy_ready = False
        for attempt in range(1, max_attempts + 1):
            if server_proc.poll() is not None:
                print(
                    f"[Screenshot] Server process terminated prematurely with exit code {server_proc.poll()}"
                )
                return 1

            if check_health(base_url, timeout=1.0):
                if verify_seeded_data(base_url, timeout=1.5):
                    healthy_ready = True
                    print(
                        f"[Screenshot] Server is healthy and seeded data confirmed at {base_url} (attempt {attempt})."
                    )
                    break
                else:
                    print(
                        f"[Screenshot] Server is up, waiting for database records... ({attempt}/{max_attempts})"
                    )
            time.sleep(1.0)

        if not healthy_ready:
            print(f"[Screenshot] Server failed to become healthy within {max_attempts} seconds.")
            if server_proc and server_proc.poll() is None:
                server_proc.kill()
            return 1
    else:
        print(f"[Screenshot] Reusing already running healthy server at {base_url}.")

    # Execute Playwright capture script via Node
    capture_script = ROOT_DIR / "scripts" / "screenshots" / "capture.js"
    node_cmd = get_node_cmd()

    cmd = [node_cmd, str(capture_script), "--base-url", base_url]
    if extra_args:
        cmd.extend(extra_args)

    print(f"\n[Screenshot] Launching capture engine: {' '.join(cmd)}\n")

    capture_env = os.environ.copy()
    capture_env["NODE_PATH"] = str(FRONTEND_DIR / "node_modules")

    capture_exit_code = 1
    try:
        res = subprocess.run(cmd, cwd=str(ROOT_DIR), env=capture_env)
        capture_exit_code = res.returncode
    except Exception as exc:
        print(f"\n[Screenshot] Error running capture engine: {exc}")
        capture_exit_code = 1
    finally:
        if started_server and server_proc and server_proc.poll() is None:
            print(
                f"\n[Screenshot] Stopping background server process (PID: {server_proc.pid}) started by this tool..."
            )
            try:
                if sys.platform == "win32":
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(server_proc.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
                else:
                    server_proc.terminate()
                server_proc.wait(timeout=5)
                print("[Screenshot] Server stopped successfully.")
            except Exception as e:
                print(f"[Screenshot] Server shutdown warning: {e}")
        elif not started_server:
            print(f"\n[Screenshot] Pre-existing server at {base_url} was left running.")

    return capture_exit_code


if __name__ == "__main__":
    sys.exit(run_screenshots(sys.argv[1:]))
