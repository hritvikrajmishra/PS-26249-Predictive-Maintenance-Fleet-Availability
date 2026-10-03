# AGENTS.md

Rules for any AI coding agent working in this repository. Read this file fully at the start of every session.

## 1. Project

**Integrated Predictive Maintenance & Fleet Availability Platform**
Hackathon problem statement 26249: *Air Power - Predictive Maintenance & Fleet Availability*.

Goal: a locally demonstrable decision-support platform that integrates aircraft health data, technical records, spares and maintenance-agency data, predicts faults early, recommends maintenance actions, and quantifies the effect on fleet availability.

Reference documents (read before starting a phase):
- `docs/plan.md` - the master plan. Phases, schema, APIs and demo script are defined there.
- `docs/data-dictionary.md` - table and column definitions (once created).

## 2. Hard constraints (never violate)

1. **All data is synthetic.** Use generic names only (e.g. "Generic Twin-Engine Transport", tail codes like `AC-017`). Never use real aircraft types, real fleet numbers, real unit names, or real failure modes of any specific aircraft.
2. **Maintenance decision support only.** No weapons, targeting, combat operations, mission planning, or offensive functionality.
3. **No secrets in code.** Use environment variables; keep `.env.example` current; never commit `.env`.
4. **The `simulation_truth` table is never a model feature.** It is for evaluation and demo scripting only.
5. **The UI must always show a visible "Synthetic data" label.**

## 3. Tech stack (do not substitute without asking)

| Area | Choice |
|---|---|
| Backend | Python 3.11, FastAPI, Pydantic, SQLAlchemy 2, Alembic |
| Database | PostgreSQL (plain; no TimescaleDB) |
| ML | pandas, numpy, scikit-learn, lightgbm, shap, joblib (lifelines optional). **No deep learning** unless a phase explicitly says so |
| Frontend | React + Vite + TypeScript + Tailwind CSS, ECharts, TanStack Query, React Router |
| Testing | pytest (backend/ml/data_gen), Vitest + React Testing Library (frontend), Playwright (e2e) |
| Tooling | ruff (Python lint/format), ESLint + Prettier (frontend), Docker Compose |

Add a new dependency only if the current phase needs it. State the dependency and the reason in your report.

## 4. Repository layout

```
backend/    FastAPI app: api/ schemas/ models/ services/ engine/ availability/ twin/ core/
ml/         Offline training code (features, models, evaluation, cli)
data_gen/   Synthetic data simulator
models/     Versioned model artifacts (model.joblib + metadata.json)
frontend/   React app
reports/    Generated model-evaluation and data-quality reports
scripts/    Seed, demo and utility scripts
docs/       Plan, data dictionary, demo script, limitations, security checklist
e2e/        Playwright tests
```

Keep layers separate: routers handle HTTP only; business logic lives in `services/`, `engine/`, `availability/`, `twin/`; training code stays in `ml/`, not in `backend/`.

## 5. Working rules (every task)

1. **Inspect first.** Before changing anything, read the repository (structure, existing code, tests, `docs/plan.md`) and summarise what already exists.
2. **Plan, then wait.** Write a short plan (files to create/change, approach, risks). For anything beyond a small change, wait for approval before implementing.
3. **One phase at a time.** Implement only the phase you were given. Do not build future-phase features, stubs, or placeholders for them. If something from a later phase seems needed, report it instead of building it.
4. **Do not break existing behaviour.** Run the existing tests before you start and after you finish. If tests were already failing, say so.
5. **Stay inside scope.** Modify only files that the phase requires. Do not refactor unrelated code, rename public APIs, or change database schema outside the phase's remit. If a contract (API shape, schema) must change, stop and report it.
6. **Verify your work.** Run the relevant tests, lint and build commands, and fix failures before declaring completion. Do not claim something works without running it.
7. **Be honest.** Report failures, weak model results and known gaps plainly. Never hard-code outputs to make a test or demo pass.
8. **Stop when the phase is complete.** Do not continue into the next phase.

## 6. Coding standards

- Python: type hints on public functions, small focused functions, docstrings where intent is non-obvious, ruff-clean.
- TypeScript: strict mode, no `any` without a comment explaining why, typed API client models.
- Database changes only through Alembic migrations (never edit the DB by hand); migrations must be reversible.
- All randomness must be seedable and reproducible (`--seed` or config). Default demo seed: `42`.
- Log with structured logging, not `print`, in backend code.
- Validate all external input (API payloads, uploaded data) with Pydantic.
- Handle loading, empty and error states in every UI data view.
- Commit messages: imperative and specific (e.g. `Add residual-based anomaly detector`).

## 7. ML rules

- Every model needs a **simple baseline** and must be compared against it.
- Splits are **temporal** and grouped by component/aircraft. Never use random row splits on time-series data.
- Features may use only information available at or before the prediction date. Add a test that proves no future leakage.
- Report PR-AUC (not accuracy) for failure prediction; MAE and interval coverage for RUL; detection lead time and false-alarm rate for anomaly detection.
- Save artifacts to `models/<name>/<version>/` with `metadata.json` (features, metrics, data hash, date, library versions).
- Report results honestly, including weaknesses. All metrics are on synthetic data and must be labelled so.

## 8. Commands

Keep these working (create them in Phase 0 if absent):

```
make up        # docker compose up
make down      # docker compose down
make test      # backend + ml + data_gen tests, frontend tests
make lint      # ruff + eslint
make demo      # full reproducible demo (added in the final phase)
```

## 9. Phase order

0 Repo & environment -> 1 Data model -> 2 Synthetic data -> 3 Backend foundation -> 4 ML pipeline -> 5 Predictive maintenance engine -> 6 Fleet availability engine -> 7 Digital twin -> 8 Frontend dashboard -> 9 Integration & polish -> 10 Testing & validation -> 11 Demo & deployment.

Work on one branch per phase (`phase-N-short-name`). A phase is merged only when its Definition of Done in `docs/plan.md` is met.

## 10. Final report format

When a phase is finished, end with a report containing:

1. **Summary** of what was built
2. **Files created / modified** (paths)
3. **Commands run** and their results (tests, lint, build)
4. **Acceptance criteria**: each one marked met / not met
5. **Known gaps, risks or deviations** from the plan
6. **Suggested next step** (do not start it)

Then stop.
