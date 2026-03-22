# FaMiLis - Project Overview

FaMiLis is a food testing prototype that combines session-based camera capture, a 9-point hedonic survey, and analytics for product evaluation.

The frontend system currently has a frontend, a Node/Express API with MySQL database of a server.

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
- Emotion/Capture service (backend): FastAPI + OpenCV + PyMySQL
- Database: MySQL schema in `server_database/schema.sql`

## Project Structure

```text
src/                  React frontend
server/               Express API + uploads
backend/              FastAPI capture/emotion service
server_database/      MySQL schema
docs/                 project and design docs
```

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

Health check (optional):

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

### 4. Optional: Run FastAPI for the backend. Make sure the python is 3.10-3.11.

```bash
cd backend

pip install -r backend\requirements.txt

python backend\emotion_service.py
```

## Typical User Flow

1. Login.
2. Dashboard: add/select food (optionally upload image).
3. Setup: select food, identify participant, confirm consent, start session.
4. Session page: record and stop session.
5. Survey: submit all five 1-9 ratings and optional remarks.
6. Session Detail / Dashboard Analytics: review outcomes and trends.
