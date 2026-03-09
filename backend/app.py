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
from dataclasses import dataclass
from typing import Dict, Optional

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


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

            time.sleep(frame_delay)

        cap.release()


_worker = CaptureWorker()


# ---------------------------
# FastAPI
# ---------------------------

app = FastAPI(title="FaMiLis Emotion Backend", version="1.0.0")

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
