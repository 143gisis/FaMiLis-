Here’s a **clean, simplified, GitHub-ready version** of your documentation:

---

# FaMiLis — Project Overview

FaMiLis is a prototype system for evaluating food products by combining **facial emotion recognition (FER)** and **user survey data**.

It follows the requirements defined in the capstone document and supports small-scale product testing.

---

## 🎯 Core Features

* 📷 **Facial Expression Capture**

  * Uses webcam via OpenCV
* 😊 **Emotion Detection**

  * Currently uses a placeholder (to be replaced with a pre-trained FE	R model)
* 📝 **Survey Input**

  * 9-point hedonic scale + optional feedback
* 🗄️ **Central Database**

  * Stores sessions, survey results, and (planned) emotion logs
* 📊 **Analytics Dashboard**

  * Displays averages, distributions, and trends

---

## 🏗️ Tech Stack

* **Frontend:** React + Vite + TypeScript + Tailwind
* **Backend:** Node.js (Express)
* **Emotion Service:** FastAPI + OpenCV
* **Database:** MySQL

---

## 📁 Project Structure

```
src/                  # React frontend
server/               # Express API
backend/              # FastAPI emotion service
server_database/      # MySQL schema
```

---

## ✅ Current Status

| Feature                         | Status              |
| ------------------------------- | ------------------- |
| React UI                        | ✅ Done              |
| API + MySQL                     | ✅ Done              |
| Session flow (start/stop)       | ✅ Done              |
| Survey capture                  | ✅ Done              |
| Webcam capture                  | ✅ Done              |
| Emotion recognition (FER model) | ⚠️ Placeholder only |
| Emotion + survey integration    | ⚠️ Partial          |
| Analytics dashboard             | ✅ Done              |
| Consent recording               | ⚠️ Not stored in DB |

---

## ⚙️ Setup Guide

### 1. Install dependencies

```bash
npm install
```

### 2. Setup database

```bash
mysql -u root -p < server_database/schema.sql
```

### 3. Configure environment

Create a `.env` file:

```env
DATABASE_URL=mysql://root:password@localhost:3306/familis_db
PORT=5000
```

---

### 4. Run backend (Express)

```bash
npm run server
```

Check:

```
http://localhost:5000/api/health
```

---

### 5. Run frontend

```bash
npm run dev
```

Open:

```
http://localhost:5173
```

---

### 6. Run emotion service (optional)

```bash
cd backend

python -m venv .venv
.\.venv\Scripts\activate

pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

---

## 🚀 How to Use

1. **Login**
2. Go to **Dashboard → Add Food**
3. Start a session via **Camera Recording**
4. Stop recording → complete **Survey**
5. View results in **Analytics Dashboard**

---

## 🔧 Next Steps (For Capstone Completion)

* Integrate a **pre-trained FER model** (e.g., DeepFace)
* Save **frame-level emotion data** to the database
* Add **consent recording** (store in DB)
* Align detected emotions with required categories:

  * happiness, surprise, disgust, neutrality, sadness

---

## 📌 Notes

* Designed for **small-scale testing** (10–15 participants)
* Supports **2–3 product evaluations**
* Focused on **R&D insights through emotion + feedback data**

---

If you want, I can also:

* Make a **README badge version** (with shields)
* Add **API endpoint docs**
* Or format this for **panel defense presentation** 👍
