# FaMiLis - Project Overview

FaMiLis is a food testing prototype that combines session-based camera capture, a 9-point hedonic survey, and graphical analytics for product evaluation. JWT auth uses roles `admin`, `staff`, and `tester`.

## Core Features

- Food management with add/edit/delete and optional image upload per product.
- Participant registry UI (list + detail with session history); label/ID, optional age and gender.
- Session lifecycle: start, stop, status update, delete; admin can invalidate a session (retention fields).
- Tester (booth) consent gate before live capture; survey on a strict 1-9 scale (5 attributes + remarks).
- Session detail: frame logs, list/folder gallery by time buckets, edit/delete frames, survey summary, status controls.
- CSV/XLSX export for food analytics and session detail (admin/staff).
- Admin user management at `/admin/users` (create/edit, role, password, deactivate).
- Analytics dashboard with confidence/hedonic charts, attribute radar, timeline, session-over-session trend, demographics, and empty-data guards.

## Tech Stack

- Frontend: React + Vite + TypeScript + Tailwind CSS + Chart.js + `xlsx`
- Main API: Node.js + Express + MySQL (`mysql2`), Multer, JWT, bcrypt
- Optional emotion service: Python + Flask + OpenCV (`backend/`, `npm run emotion-service`)
- Database: MySQL schema in `server_database/schema.sql`
- Optional: `demo_kit/` presenter docs and sample users

## Project Structure

```text
backend/              Optional Flask emotion/capture service
server/               Express API, init, uploads
server_database/      MySQL schema (+ optional sample SQL)
demo_kit/             Optional demo scripts / extra users
src/                  React frontend
```

## Database Notes

Schema highlights: `users` (role, `is_active`), `participants`, `food_products.image_url`, `sessions` (`participant_id`, `invalidated_at`, `retention_status`), `frame_logs.frame_image_url`, survey ratings 1-9.

On API start, `server/init.js` applies `schema.sql`, light migrations, and seeds default users. You can also apply the schema manually:

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

Set DB and JWT in `.env` (dev fallbacks apply if unset):

```bash
DATABASE_URL=mysql://root:@localhost:3306/familis_db
JWT_SECRET=change-me-in-production
JWT_TTL=8h
```

Seeded accounts (bcrypt): `admin@familis.com` / `admin123` (admin), `tester@familis.com` / `tester123` (tester). Staff is a supported role; optional extra accounts live in `demo_kit/optional_demo_users.sql`.

Optional live FER: `npm run emotion-service` (set `EMOTION_SERVICE_URL` on the API if not default).

### 3. Start frontend (port 5173)

```bash
npm run dev
```

Open `http://localhost:5173`.

## Typical User Flow

**Admin / Staff:** Login → Dashboard (foods, analytics, export) → Setup → Session → Survey → Session Detail. Admins also manage Users and Participants.

**Tester:** Login → Consent → Session → Survey (no dashboard/setup/detail).
