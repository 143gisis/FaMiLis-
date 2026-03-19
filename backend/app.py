"""FaMiLis Emotion Backend (FastAPI + OpenCV)

What it does
- Captures webcam frames (OpenCV)
- Runs an emotion model (YOU plug your model into predict_emotions())
- Converts model output -> valence/arousal -> 9-point hedonic score
- Exposes the latest result at GET /emotion/latest

Run:
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 5000 --reload

Frontend polls:
  http://localhost:5000/emotion/latest

Notes
- This uses OpenCV Haar face detection (simple, no extra files).
- The dlib .dat file is optional and NOT used here.
"""

from __future__ import annotations

import threading
import time
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

try:
    import pymysql
except Exception:  # pragma: no cover - optional runtime dependency
    pymysql = None


# ---------------------------
# Config
# ---------------------------
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

CAMERA_INDEX = 0
PROCESS_FPS = 8  # 5-10 is enough for a capstone
FRAME_SAVE_EVERY_N = 3
FASTAPI_PUBLIC_BASE = os.getenv("FASTAPI_PUBLIC_BASE", "http://localhost:5001")
FRAME_UPLOAD_DIR = Path(__file__).resolve().parent / "uploads" / "frames"
FRAME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

HEDONIC_LABELS = {
    9: "Like Extremely",
    8: "Like Very Much",
    7: "Like Moderately",
    6: "Like Slightly",
    5: "Neither Like nor Dislike",
    4: "Dislike Slightly",
    3: "Dislike Moderately",
    2: "Dislike Very Much",
    1: "Dislike Extremely",
}

# If your model returns emotion probabilities, you can tune these.
# Keys should match predict_emotions() output.
VALENCE_WEIGHTS = {
    "happy": 0.95,
    "surprise": 0.20,
    "neutral": 0.0,
    "sad": -0.80,
    "angry": -0.75,
    "fear": -0.65,
    "disgust": -0.85,
}

AROUSAL_WEIGHTS = {
    "happy": 0.55,
    "surprise": 0.80,
    "neutral": 0.20,
    "sad": 0.30,
    "angry": 0.85,
    "fear": 0.90,
    "disgust": 0.60,
}

NO_FACE_OUTPUT = {
    "happy": 0.0,
    "sad": 0.0,
    "angry": 0.0,
    "fear": 0.0,
    "disgust": 0.0,
    "surprise": 0.0,
    "neutral": 1.0,
}


# ---------------------------
# Helpers
# ---------------------------

def now_ms() -> int:
    return int(time.time() * 1000)


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def normalize_probs(probs: Dict[str, float]) -> Dict[str, float]:
    keys = list(NO_FACE_OUTPUT.keys())
    cleaned = {k: float(probs.get(k, 0.0)) for k in keys}

    s = sum(cleaned.values())
    if s <= 1e-8:
        return dict(NO_FACE_OUTPUT)

    return {k: v / s for k, v in cleaned.items()}


def compute_valence_arousal(probs: Dict[str, float]) -> tuple[float, float]:
    probs = normalize_probs(probs)

    val = 0.0
    aro = 0.0
    for k, p in probs.items():
        val += p * VALENCE_WEIGHTS.get(k, 0.0)
        aro += p * AROUSAL_WEIGHTS.get(k, 0.0)

    return clamp(val, -1.0, 1.0), clamp(aro, 0.0, 1.0)


def valence_to_hedonic(valence: float) -> int:
    # Perfect mapping of valence [-1..1] to hedonic [1..9]
    hed = int(round((valence * 4.0) + 5.0))
    return int(clamp(hed, 1, 9))


# ---------------------------
# Face detection (fast)
# ---------------------------

_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def detect_largest_face(gray: np.ndarray) -> Optional[tuple[int, int, int, int]]:
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return int(x), int(y), int(w), int(h)


# ---------------------------
# MODEL HOOK (REPLACE THIS)
# ---------------------------

def predict_emotions(frame_bgr: np.ndarray) -> Dict[str, float]:
    """Return emotion probabilities.

    Replace this function with your real model inference.

    Expected keys:
      happy, sad, angry, fear, disgust, surprise, neutral

    Current behavior: placeholder heuristic so the backend runs immediately.
    """

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    face = detect_largest_face(gray)
    if face is None:
        return dict(NO_FACE_OUTPUT)

    x, y, w, h = face
    roi = gray[y : y + h, x : x + w]

    mean = float(np.mean(roi)) / 255.0
    std = float(np.std(roi)) / 255.0

    happy = clamp((mean - 0.4) * 1.3, 0.0, 1.0)
    surprise = clamp(std * 1.2, 0.0, 1.0)
    sad = clamp((0.5 - mean) * 1.1, 0.0, 1.0)
    angry = clamp(std * 0.6, 0.0, 1.0)
    fear = clamp(std * 0.4, 0.0, 1.0)
    disgust = clamp((0.45 - mean) * 0.7, 0.0, 1.0)

    raw = {
        "happy": happy,
        "surprise": surprise,
        "sad": sad,
        "angry": angry,
        "fear": fear,
        "disgust": disgust,
    }

    neutral = clamp(1.0 - sum(raw.values()), 0.0, 1.0)
    raw["neutral"] = neutral

    return normalize_probs(raw)


# ---------------------------
# Shared state
# ---------------------------

@dataclass
class LatestEmotion:
    timestamp_ms: int
    has_face: bool
    emotions: Dict[str, float]
    valence: float
    arousal: float
    hedonicScore: int
    hedonicLabel: str


_state_lock = threading.Lock()
_latest: Optional[LatestEmotion] = None
_active_session_id: Optional[int] = None


def write_latest(has_face: bool, emotions: Dict[str, float], valence: float, arousal: float):
    global _latest

    hed = valence_to_hedonic(valence)
    item = LatestEmotion(
        timestamp_ms=now_ms(),
        has_face=has_face,
        emotions=normalize_probs(emotions),
        valence=float(valence),
        arousal=float(arousal),
        hedonicScore=int(hed),
        hedonicLabel=HEDONIC_LABELS.get(hed, "Unknown"),
    )

    with _state_lock:
        _latest = item


def _db_conn():
    if pymysql is None:
        return None
    try:
        return pymysql.connect(
            host=os.getenv("MYSQL_HOST", "localhost"),
            user=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            database=os.getenv("MYSQL_DATABASE", "familis_db"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            autocommit=True,
            cursorclass=pymysql.cursors.Cursor,
        )
    except Exception:
        return None


def write_frame_log(
    session_id: int,
    has_face: bool,
    confidence_score: float,
    hedonic_score: float,
    frame_image_url: str,
) -> None:
    conn = _db_conn()
    if conn is None:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO frame_logs
                (session_id, timestamp, face_detected, confidence_score, hedonic_score, frame_image_url)
                VALUES (%s, NOW(), %s, %s, %s, %s)
                """,
                (
                    session_id,
                    1 if has_face else 0,
                    float(clamp(confidence_score, 0.0, 1.0)),
                    float(clamp(hedonic_score, 0.0, 1.0)),
                    frame_image_url,
                ),
            )
    except Exception:
        # Keep capture loop resilient even if DB write fails.
        return
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------
# Capture loop
# ---------------------------

class CaptureWorker:
    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        self._running = False

    def start(self):
        if self._running:
            return
        self._stop_evt.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self._running = True

    def stop(self):
        self._stop_evt.set()
        self._running = False

    def _loop(self):
        cap = cv2.VideoCapture(CAMERA_INDEX)
        if not cap.isOpened():
            write_latest(False, dict(NO_FACE_OUTPUT), 0.0, 0.2)
            return

        frame_delay = 1.0 / max(1, PROCESS_FPS)
        frame_counter = 0

        while not self._stop_evt.is_set():
            ok, frame = cap.read()
            if not ok or frame is None:
                time.sleep(frame_delay)
                continue

            probs = predict_emotions(frame)
            probs = normalize_probs(probs)

            has_face = probs.get("neutral", 1.0) < 0.999
            valence, arousal = compute_valence_arousal(probs)
            write_latest(has_face, probs, valence, arousal)
            frame_counter += 1

            if _active_session_id and (frame_counter % FRAME_SAVE_EVERY_N == 0):
                filename = f"s{_active_session_id}-{now_ms()}.jpg"
                output_path = FRAME_UPLOAD_DIR / filename
                try:
                    cv2.imwrite(str(output_path), frame)
                    public_url = f"{FASTAPI_PUBLIC_BASE}/uploads/frames/{filename}"
                    write_frame_log(
                        session_id=_active_session_id,
                        has_face=has_face,
                        confidence_score=max(probs.values()) if probs else 0.0,
                        hedonic_score=valence_to_hedonic(valence) / 9.0,
                        frame_image_url=public_url,
                    )
                except Exception:
                    pass

            time.sleep(frame_delay)

        cap.release()


_worker = CaptureWorker()


# ---------------------------
# FastAPI
# ---------------------------

app = FastAPI(title="FaMiLis Emotion Backend", version="1.0.0")
app.mount("/uploads", StaticFiles(directory=str(FRAME_UPLOAD_DIR.parent)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Start capturing immediately.
    _worker.start()


@app.get("/health")
def health():
    return {"ok": True, "timestamp_ms": now_ms()}


@app.get("/emotion/latest")
def emotion_latest():
    with _state_lock:
        item = _latest

    if item is None:
        return {
            "timestamp_ms": now_ms(),
            "has_face": False,
            "emotions": dict(NO_FACE_OUTPUT),
            "valence": 0.0,
            "arousal": 0.2,
            "hedonicScore": 5,
            "hedonicLabel": HEDONIC_LABELS[5],
        }

    return {
        "timestamp_ms": item.timestamp_ms,
        "has_face": item.has_face,
        "emotions": item.emotions,
        "valence": item.valence,
        "arousal": item.arousal,
        "hedonicScore": item.hedonicScore,
        "hedonicLabel": item.hedonicLabel,
    }


@app.post("/capture/session/{session_id}")
def capture_set_session(session_id: int):
    global _active_session_id
    if session_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    _active_session_id = session_id
    return {"ok": True, "activeSessionId": _active_session_id}


@app.post("/capture/session/clear")
def capture_clear_session():
    global _active_session_id
    _active_session_id = None
    return {"ok": True, "activeSessionId": None}
