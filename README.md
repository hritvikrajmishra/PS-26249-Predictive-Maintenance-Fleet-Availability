# Integrated Predictive Maintenance & Fleet Availability Platform

[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Synthetic Data](https://img.shields.io/badge/Data-100%25%20Synthetic-amber.svg)](#synthetic-data-declaration)

A decision-support platform for defense aviation fleet availability that integrates aircraft health-monitoring data, technical records, spares inventory, and maintenance workshop capacity.

> **Problem Statement 26249 (MoD / DSSC):**  
> *"Low aircraft availability due to fragmented and largely reactive maintenance practices across the air fleet."*

---

## Synthetic Data Declaration

> [!IMPORTANT]
> **ALL DATA IN THIS PLATFORM IS ENTIRELY SYNTHETIC.**  
> - Generic aircraft names (e.g. *Generic Twin-Engine Transport*, tail numbers like `AC-017`).
> - No real aircraft types, unit names, real tail numbers, or proprietary operational parameters are used.
> - Intended strictly for maintenance decision-support and fleet availability analytics.

---

## Current Status: Phase 0 (Repository & Environment)

Phase 0 provides the runnable native development skeleton:
- **Backend**: FastAPI with async SQLAlchemy 2 and PostgreSQL health verification.
- **Frontend**: React + Vite + TypeScript + Tailwind CSS placeholder cockpit with API proxy.
- **Database**: Native PostgreSQL 16 connectivity.
- **Task Runner**: Native cross-platform Python CLI (`scripts/tasks.py`) requiring zero container overhead.

---

## Quickstart

### 1. Prerequisites
- Python 3.11+
- Node.js 20+ & npm
- PostgreSQL 16 natively installed and running

For detailed OS-specific setup (Windows, macOS, Linux), refer to [docs/local-setup.md](file:///d:/SIH%202026/PS-26249-Predictive-Maintenance-Fleet-Availability/docs/local-setup.md).

### 2. Database Setup
Execute the local setup script to provision the role and databases:
```bash
# As postgres superuser
psql -U postgres -p 5432 -f database/setup_local.sql
```

### 3. Environment & Dependencies
```bash
# Copy environment configuration
cp .env.example .env

# Setup Python virtual environment
python -m venv .venv
source .venv/bin/activate       # On Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 4. Run Development Servers
```bash
python scripts/tasks.py dev
```
- **Frontend Cockpit**: `http://localhost:5173`
- **Backend API**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`

---

## Cross-Platform Task Runner (`scripts/tasks.py`)

No `make` or platform-specific shell dependencies are required. Use `python scripts/tasks.py <command>`:

| Command | Action |
|---|---|
| `python scripts/tasks.py dev` | Starts uvicorn and Vite dev server concurrently; stops both on `Ctrl+C`. |
| `python scripts/tasks.py test` | Runs backend `pytest` suite and frontend `vitest` suite. |
| `python scripts/tasks.py lint` | Runs `ruff check`, `ruff format --check`, and frontend `eslint`. |
| `python scripts/tasks.py migrate` | Displays migration readiness (Alembic configured in Phase 1). |

---

## Repository Layout

```
├── AGENTS.md                  # Project rules & constraints for AI agents
├── README.md                  # System overview and quickstart
├── pyproject.toml             # Python & linter configuration
├── pytest.ini                 # Pytest configuration
├── requirements.txt           # Production Python dependencies
├── requirements-dev.txt       # Development & testing dependencies
├── .env.example               # Environment variables template
├── database/
│   └── setup_local.sql        # Database and role initialization script
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI entrypoint (/api/v1/health)
│   │   ├── config.py          # Pydantic environment configuration
│   │   ├── core/              # Database engine & sessions
│   │   ├── api/               # HTTP routers (Phase 3+)
│   │   ├── schemas/           # Pydantic models (Phase 3+)
│   │   ├── models/            # SQLAlchemy ORM (Phase 1+)
│   │   ├── services/          # Business logic (Phase 3+)
│   │   ├── engine/            # Predictive maintenance engine (Phase 5+)
│   │   ├── availability/      # Fleet availability engine (Phase 6+)
│   │   └── twin/              # Digital twin engine (Phase 7+)
│   ├── alembic/               # Schema migrations (Phase 1+)
│   └── tests/                 # Backend automated tests
├── frontend/
│   ├── src/                   # React + TypeScript + Tailwind source
│   ├── tests/                 # Vitest component test suite
│   ├── package.json           # Frontend package definitions
│   └── vite.config.ts         # Vite configuration with API proxy
├── ml/                        # Offline training code (Phase 4+)
├── data_gen/                  # Synthetic data simulator (Phase 2+)
├── models/                    # Versioned model artifacts (Phase 4+)
├── data/                      # Generated datasets
├── reports/                   # Model evaluation and data-quality reports
├── scripts/
│   └── tasks.py               # Cross-platform CLI task runner
└── docs/
    ├── plan.md                # Master plan and roadmap
    └── local-setup.md         # Step-by-step native setup guide
```
