import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

const API_BASE = "http://localhost:5000";
// Use backend so session_id in this page matches DB rows.
const USE_DB = true;

type Food = {
  id: number;
  name: string;
  category: string;
};

type SessionRow = {
  id: number;
  userId: number;
  foodId: number;
  status: "pending" | "active" | "completed" | "cancelled";
  startTime: string | null;
  endTime: string | null;
};

type StoredSession = {
  id: number;
  userId: number;
  foodId: number;
  status: SessionRow["status"];
  startTime: string;
};

function formatMmSs(totalSeconds: number) {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function Session() {
  const navigate = useNavigate();
  const location = useLocation();

  const storedCurrent = useMemo((): StoredSession | null => {
    try {
      const raw = localStorage.getItem("familis.currentSession");
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }, []);

  const initialSession = (location.state as any)?.session as SessionRow | undefined;
  const initialFood = (location.state as any)?.food as Food | undefined;

  const initialSessionId = initialSession?.id ?? storedCurrent?.id ?? null;
  const sessionId = initialSessionId;
  const [session, setSession] = useState<SessionRow | null>(initialSession ?? null);
  const [food, setFood] = useState<Food | null>(initialFood ?? null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState((initialSession?.status ?? "active") === "active");

  const startEpochMs = useMemo(() => {
    if (!session?.startTime) return null;
    const t = new Date(session.startTime).getTime();
    return Number.isNaN(t) ? null : t;
  }, [session?.startTime]);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (startEpochMs == null) return;
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startEpochMs) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startEpochMs]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setCameraError(
        err?.message ||
          "Camera permission denied or not available. Please allow access and try again."
      );
    }
  };

  useEffect(() => {
    if (!USE_DB) return;
    if (sessionId == null) return;
    setLoading(true);
    setLoadError(null);

    async function loadSession() {
      try {
        const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load session.");
        setSession(json.session as SessionRow);
        setFood((prev) => prev ?? (json.food as Food | null));
        setIsRecording((json.session?.status ?? "active") === "active");
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load session.");
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, [sessionId]);

  useEffect(() => {
    // Start camera immediately when this page loads (the "consent" happened in Setup).
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const handleStopClick = () => {
    if (!sessionId) return;
    setStopError(null);
    setConfirmOpen(true);
  };

  const handleConfirmStop = async () => {
    if (!sessionId) return;
    setStopPending(true);
    setConfirmOpen(false);
    setStopError(null);

    try {
      stopCamera();
      setIsRecording(false);

      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/stop`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to stop the session in the database.");
      }

      // Move to survey after user confirmation.
      navigate("/survey", { state: { sessionId } });
    } catch (err: any) {
      setStopError(err?.message || "Unable to stop the session.");
      setConfirmOpen(true);
    } finally {
      setStopPending(false);
    }
  };

  const handleCancelStop = () => {
    setConfirmOpen(false);
  };

  const handleBackToDashboard = () => {
    stopCamera();
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="flex items-center gap-3"
            aria-label="Back to dashboard"
          >
            <img src={logo} alt="FaMiLis logo" className="w-[44px] h-[44px] object-contain" />
            <span className="text-white text-[22px] font-bold tracking-wide">FaMiLis</span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button
            type="button"
            onClick={handleBackToDashboard}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm transition-colors"
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </button>

          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-gray-900">Camera Recording</h1>
            <p className="text-[12px] text-gray-500 mt-1">
              {food ? `${food.name} • ${food.category}` : "Session"}
            </p>
          </div>

          {loading ? (
            <div className="text-center text-gray-600 text-sm">Loading session…</div>
          ) : loadError ? (
            <div className="text-center text-red-600 text-sm">
              {loadError}{" "}
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="text-red-700 underline ml-2"
              >
                Go back
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Session timer */}
              <div className="space-y-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-[12px] text-gray-500 font-semibold">Session</p>
                  <p className="text-[34px] leading-none font-extrabold text-gray-900 mt-2">
                    {formatMmSs(elapsedSeconds)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Starts when you press Start the Session
                  </p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-[12px] text-gray-700 font-semibold mb-2">Status</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        isRecording ? "bg-red-600" : "bg-gray-400"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-[12px] text-gray-600">
                      {isRecording ? "Recording" : "Recording stopped"}
                    </span>
                  </div>
                  {session?.id ? (
                    <p className="text-[11px] text-gray-500 mt-2">Session ID: S-{session.id}</p>
                  ) : null}
                </div>
              </div>

              {/* Right: Camera preview + stop */}
              <div className="space-y-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm text-gray-700 font-semibold mb-3">Camera Preview</h3>

                  <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative">
                    {cameraError ? (
                      <div className="text-center px-6 h-full flex items-center justify-center">
                        <div>
                          <p className="text-sm text-gray-700 font-semibold">Camera unavailable</p>
                          <p className="text-xs text-gray-500 mt-1">{cameraError}</p>
                        </div>
                      </div>
                    ) : (
                      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    )}

                    {isRecording ? (
                      <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-sm">
                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                        <span className="text-[13px] font-bold">Recording...</span>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-[11px] text-gray-500 mt-2">
                    Keep the camera steady during testing.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStopClick}
                  disabled={!isRecording || stopPending}
                  className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                    isRecording
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {stopPending ? "Stopping..." : "Stop Recording"}
                </button>
                {stopError ? <p className="text-xs text-red-600 text-center">{stopError}</p> : null}
              </div>
            </div>
          )}
        </div>
      </main>

      {confirmOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-gray-200">
            <h2 className="text-gray-900 font-bold text-lg">Are you sure?</h2>
            <p className="text-gray-600 text-sm mt-2">
              Stopping the session will take you to the survey page.
            </p>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={handleCancelStop}
                disabled={stopPending}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStop}
                disabled={stopPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {stopPending ? "Stopping..." : "Yes, stop"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}