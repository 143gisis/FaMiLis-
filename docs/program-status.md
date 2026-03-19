# FaMiLis — Program State (Capstone Alignment)

This document summarizes the **current state of the FaMiLis prototype** and how it aligns with the capstone requirements described in `docs/references/capstone.pdf`.

## What the capstone requires (from `capstone.pdf`)

### Core objectives
- **Capture facial expressions during product testing** via webcam/device.
- **Classify emotions** using a **pre-trained FER model** (no training new models in-scope).
- **Combine FER + survey results** in a **central database**.
- **Generate reports/visualizations** (graphs, basic stats, timelines) for R&D decision-making.
- **Prototype scope**: small-scale trials (e.g., **10–15 participants**, **2–3 products**).
- **Basic emotion set (scope)**: **happiness, surprise, disgust, neutrality, sadness** (paper scope); broader sets may exist in implementation but should map back to product evaluation.
- **Privacy/ethics**: requires **informed consent** and Data Privacy Act / ethics compliance.

### Proposed architecture (paper)
- **Frontend**: React
- **Backend & processing**: FastAPI + OpenCV (+ a pre-trained FER library/model, e.g., DeepFace)
- **Database**: MySQL
- **Visualization**: Chart.js (dashboard)

## Current implementation (what exists in this repo)

### Frontend (React + Vite + TS + Tailwind)
- **Entry routes**: `src/App.tsx`
  - `/` login
  - `/dashboard` food management + analytics
  - `/setup` camera setup/start session
  - `/session` recording UI
  - `/survey` hedonic survey input
  - `/session-detail` results view (frames/logs/survey)

### API server (Node/Express + MySQL)
- **Server**: `server/server.js`
- **Database schema**: `server_database/schema.sql`
- **Key responsibilities implemented**
  - Foods CRUD: `GET/POST/DELETE /api/foods`
  - Sessions: `POST /api/sessions/start`, `POST /api/sessions/:id/stop`, detail fetch endpoints
  - Survey: `POST /api/sessions/:id/survey` (stores 1–9 ratings + demographics + remarks)
  - Analytics: `GET /api/foods/:foodId/analytics` (mean rating, distribution buckets, radar values, timeline buckets, breakdowns)

### Emotion service (FastAPI + OpenCV) — present but separate
- **Service**: `backend/app.py`
- **What it currently does**
  - Opens webcam via OpenCV
  - Runs a **placeholder** `predict_emotions()` heuristic (not DeepFace yet)
  - Computes valence/arousal → maps to a **9-point hedonic** score
  - Exposes `GET /emotion/latest` for polling

> Note: the README says the emotion service runs on **port 5001**, but `backend/app.py`’s example command uses **port 5000**. If you run both Express (default 5000) and FastAPI on the same port, one will fail—pick different ports.

## Requirement ↔ Status mapping (quick checklist)

- **React UI exists**: ✅ (`src/`)
- **MySQL central DB exists**: ✅ (`server_database/schema.sql`)
- **Survey capture (hedonic + attributes)**: ✅ (`POST /api/sessions/:id/survey`)
- **Session flow (start/stop + persistence)**: ✅ (sessions tables + endpoints)
- **FER capture via webcam**: ✅ (webcam capture exists in `backend/app.py`)
- **FER uses pre-trained model (DeepFace or equivalent)**: ⚠️ *Not yet* (current `predict_emotions()` is placeholder)
- **Merge FER + survey in one database**: ⚠️ *Partial*
  - DB has `frame_logs` ready for frame-level metrics, but writing to it depends on the recording pipeline.
- **Dashboards/reports (graphs/timelines/stats)**: ✅ in-app analytics view (currently rendered with custom UI; Chart.js dependency exists)
- **Small-scale prototype scope**: ✅ structurally supported (foods/sessions/surveys), but depends on actual study execution
- **Consent/privacy workflow**: ⚠️ *Not implemented in UI yet* (no explicit consent capture screen/record)
  - The UI **does** include a consent checklist in `src/pages/Setup.tsx`, but it is not currently stored in the database as an auditable record.

## How to run (developer “how-to”)

### 1) Install frontend deps
From repo root:

```bash
npm install
```

### 2) Set up MySQL schema
From repo root (requires MySQL CLI):

```bash
mysql -u root -p < server_database/schema.sql
```

### 3) Configure environment
Create `.env` in the repo root (example):

```env
DATABASE_URL=mysql://root:password@localhost:3306/familis_db
PORT=5000
```

### 4) Start the API server (Express)

```bash
npm run server
```

Verify:
- `GET http://localhost:5000/api/health`

### 5) Start the frontend (Vite)

```bash
npm run dev
```

Open:
- `http://localhost:5173`

### 6) (Optional) Start the emotion service (FastAPI)
Run it on a port that does **not** conflict with Express, e.g. 5001:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 5001 --reload
```

Verify:
- `GET http://localhost:5001/health`
- `GET http://localhost:5001/emotion/latest`

## How to use the app (end-user “how-to”)

### Login
- The API supports `POST /api/login` against the `users` table.
- If you have no users yet, seed one (see `README.md`).

### Create a product and run a test
- **Dashboard → Add New Food**
- **Camera Recording** (routes you into the setup/session flow)
- **Stop Recording → Survey** (enter 1–9 ratings and optional remarks)
- **Back to Dashboard → Statistics & Analytics** (view aggregated results)

## Notes for capstone alignment (what to implement next)

If you want changes to strictly match the PDF’s scope/requirements, the next highest-impact work is:
- Replace the emotion placeholder in `backend/app.py` with a **pre-trained FER** implementation (e.g., DeepFace) and ensure output emotions map to the paper’s scoped set.
- Store frame-level results into `frame_logs` with a reliable **timestamp sync** to the session.
- Add a simple **consent screen** (and DB record) before starting camera capture.

