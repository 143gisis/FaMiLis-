# FaMiLis - Project Overview

FaMiLis is a food testing prototype that combines session-based camera capture, a 9-point hedonic survey, and analytics for product evaluation.

The system currently has a React frontend, a Node/Express API with MySQL, and an optional FastAPI capture service for frame-level FER logging.

## Core Features

- Food management with add/delete flow and optional image upload per product.
- Participant registry (label/ID, optional age and gender) reused across sessions.
- Session lifecycle: start, stop, status update, and delete.
- Survey submission on a strict 1-9 hedonic scale (5 required attributes + remarks).
- Session detail view with frame logs, frame image preview, survey summary, and status controls.
- Analytics dashboard with:
  - Frame confidence and hedonic distribution
  - Attribute radar chart
  - Timeline trend
  - Demographic slices (age, gender)
  - Data-quality guards when sessions/frame logs/surveys are missing

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS + Chart.js
- Main API: Node.js + Express + MySQL (`mysql2`)
- Uploads: Multer (food image uploads)
- Emotion/Capture service (optional): FastAPI + OpenCV + PyMySQL
- Database: MySQL schema in `server_database/schema.sql`

## Project Structure

```text
src/                  React frontend
server/               Express API + uploads
backend/              FastAPI capture/emotion service
server_database/      MySQL schema
docs/                 project and design docs
```

## Recent Updates Reflected In This Version

- Added participant table and participant-aware session flow.
- Added food image upload endpoint and static serving via `/uploads`.
- Added session status patch endpoint and session delete endpoint.
- Revised survey to fully use 1-9 ratings and removed per-survey demographics input (now sourced from participant/session context).
- Added frame image URL support in `frame_logs` and session detail UI previews.
- Added analytics completeness checks (`sessionCount`, `frameLogCount`, `surveyCount`) and graph gating when data is incomplete.
- Updated dashboard/session/setup/survey headings and session detail analytics visualizations.

## Database Notes

Current schema includes:

- `participants` table (label, age, gender)
- `food_products.image_url`
- `sessions.participant_id`
- `frame_logs.frame_image_url`
- survey ratings constrained to 1-9

Apply schema:

```bash
mysql -u root -p < server_database/schema.sql
```

## Setup Guide

### 1. Install frontend/API dependencies

```bash
npm install
```

### 2. Start Express API (port 5000)

```bash
npm run server
```

Health check:

```text
http://localhost:5000/api/health
```

### 3. Start frontend (port 5173)

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

### 4. Optional: run FastAPI capture service (recommended on port 5001)

```bash
cd backend

python -m venv .venv
\.venv\Scripts\activate

pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 5001 --reload
```

Optional environment variables for FastAPI DB/frame logging:

```env
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=familis_db
MYSQL_PORT=3306
FASTAPI_PUBLIC_BASE=http://localhost:5001
```

## Typical User Flow

1. Login.
2. Dashboard: add/select food (optionally upload image).
3. Setup: select food, identify participant, confirm consent, start session.
4. Session page: record and stop session.
5. Survey: submit all five 1-9 ratings and optional remarks.
6. Session Detail / Dashboard Analytics: review outcomes and trends.

## Current Limitations

- FastAPI emotion model remains placeholder logic unless you replace `predict_emotions()` in `backend/app.py`.
- Automatic frontend-to-FastAPI session binding for frame capture should be verified in your deployment flow.
- Consent checkboxes are enforced in UI but not currently persisted as dedicated DB consent records.

## Next Improvements

- Plug in a production FER model.
- Ensure end-to-end frame logging trigger between active session and FastAPI capture endpoints.
- Add persisted consent audit fields.
- Add auth hardening (password hashing/token flow).