# FaMiLis

FaMiLis (Facial Emotion Learning Intelligence System) is a school capstone project that combines a React frontend with a FastAPI backend for food testing sessions, survey input, and emotion-related processing.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Python + FastAPI + OpenCV
- **Package Managers:** npm and pip

---

## 1) Prerequisites

Install these first:

### For the frontend
- **Node.js** (includes npm)

### For the backend
- **Python 3.10+**
- **pip**

To check if they are installed, open a terminal and run:

```bash
node -v
npm -v
python --version
pip --version
```

---

## 2) Download the project

1. Open the repository page.
2. Click **Code**.
3. Click **Download ZIP**.
4. Extract the ZIP file.

## 3) Project structure

Your folder should look similar to this:

```text
project-folder/
├─ backend/
├─ src/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ README.md
└─ RUN_PROJECT.md
```

---

## 4) Install frontend dependencies

Open a terminal in the **project root** (the folder where `package.json` is located), then run:

```bash
npm install
```

This downloads all frontend dependencies into `node_modules/`.

---

## 5) Run the frontend

Still in the **project root**, run:

```bash
npm run dev
```

Vite will show a local URL, usually:

```text
http://localhost:5173
```

Open that link in your browser.

---

## 6) Install backend dependencies

Open a **new terminal** and go to the backend folder:

```bash
cd backend
```

Install the required Python packages:

```bash
pip install -r requirements.txt
```

---

## 7) Run the backend

Inside the `backend` folder, run:

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

If it starts correctly, the backend will be available at:

```text
http://localhost:5000
```

---

## 8) Run both at the same time

You need **two terminals** open:

### Terminal 1 — Frontend
From the project root:
```bash
npm run dev
```

### Terminal 2 — Backend
From the `backend` folder:
```bash
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

---

## 9) How the system connects

- The **frontend** runs in the browser.
- The **backend** runs locally on port `5000`.
- During recording, the frontend sends data/frames to the backend.
- The backend returns processed output that the frontend can display.

Current local addresses:

- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:5000`

---

## 10) Demo login

Use the demo admin account:

```text
Email: admin@familis.com
Password: admin123
```

---

## 11) Common problems

### `npm install` fails
Try:
```bash
npm cache clean --force
npm install
```

### `uvicorn is not recognized`
Use:
```bash
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

### Camera does not work
- Make sure camera permission is allowed in the browser.
- Close apps that may be using the camera, such as Zoom, Teams, Discord, or the Windows Camera app.
- Restart the frontend and backend.

### Port already in use
Close any old terminal still running the project, then start again.

---

## 12) Recommended startup order

1. Start the backend
2. Start the frontend
3. Open the frontend URL in the browser
4. Log in and test the flow

---

## 13) Usual Commands

### Frontend
```bash
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

