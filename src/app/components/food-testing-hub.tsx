import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Circle, Square } from "lucide-react";
import { useApp } from "../store/AppContext";

const EMOTION_API_BASE = "http://localhost:5000";

export function FoodTestingHub() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();

  const activeFoods = useMemo(
    () => state.foods.filter((f) => f.status === "Active"),
    [state.foods]
  );

  const selectedFood = useMemo(
    () => activeFoods.find((f) => f.id === state.selectedFoodId) || activeFoods[0],
    [activeFoods, state.selectedFoodId]
  );

  const [isRecording, setIsRecording] = useState(false);
  const [showConsent, setShowConsent] = useState(true);
  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);

  const pollRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState("");

  const mm = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
  const ss = String(secondsElapsed % 60).padStart(2, "0");

  const startCamera = async () => {
    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      setCameraActive(false);
      setCameraError("Camera preview could not start. Check browser permission and close other apps using the camera.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
      stopTimer();
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!selectedFood && activeFoods.length > 0) {
      dispatch({ type: "SET_SELECTED_FOOD", payload: { id: activeFoods[0].id } });
    }
  }, [selectedFood, activeFoods, dispatch]);

  const handleConsentSubmit = async () => {
    if (consentGiven === true) {
      setShowConsent(false);
      await startCamera();
    } else if (consentGiven === false) {
      navigate("/admin");
    }
  };

  const startTimer = () => {
    stopTimer();
    setSecondsElapsed(0);
    timerRef.current = window.setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
  };

  const pollBackendOnce = async () => {
    try {
      const res = await fetch(`${EMOTION_API_BASE}/emotion/latest`);
      if (!res.ok) throw new Error("Bad response");
      const data = await res.json();

      const output = {
        timestamp_ms: Number(data.timestamp_ms) || Date.now(),
        has_face: Boolean(data.has_face),
        valence: Number(data.valence) || 0,
        arousal: Number(data.arousal) || 0,
        hedonicScore: Number(data.hedonicScore) || 5,
        hedonicLabel: String(data.hedonicLabel || "Neither Like nor Dislike"),
      };

      dispatch({ type: "SET_MODEL_OUTPUT", payload: output });
    } catch {
      // Keep silent for now. We’re preserving sync logic for the next UI pass.
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      pollBackendOnce();
    }, 500);
  };

  const handleStartRecording = async () => {
    if (!cameraActive) return;
    if (!selectedFood) {
      alert("Please add at least one Active food before testing.");
      return;
    }

    setIsRecording(true);
    startTimer();
    await pollBackendOnce();
    startPolling();
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    stopPolling();
    stopTimer();
    stopCamera();
    navigate("/admin/survey");
  };

  const onFoodChange = (id: string) => {
    dispatch({ type: "SET_SELECTED_FOOD", payload: { id } });
  };

  return (
    <div className="px-6 lg:px-10 py-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="max-w-[1120px] mx-auto">
        <div className="bg-white px-8 py-6 rounded-[12px] mb-4 flex items-center justify-between shadow-[0px_2px_6px_rgba(0,0,0,0.04)]">
          <h1 className="text-[24px] lg:text-[30px] font-bold text-black">Food Testing Hub</h1>
          <button
            onClick={() => {
              stopPolling();
              stopTimer();
              stopCamera();
              navigate("/admin");
            }}
            className="bg-red-600 text-white px-4 lg:px-5 py-2 rounded-[8px] text-[12px] lg:text-[13px] font-extrabold flex items-center gap-2 hover:bg-red-700 transition-colors shadow-[0px_2px_6px_rgba(0,0,0,0.12)]"
            style={{ fontFamily: "'Roboto', sans-serif" }}
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_0.75fr] gap-4 mb-4">
          <div className="bg-white rounded-[12px] border border-[#d7d7d7] px-5 py-4 shadow-[0px_2px_6px_rgba(0,0,0,0.03)]">
            <h2 className="text-[15px] font-semibold text-black mb-3">Select Food for Testing</h2>

            {activeFoods.length === 0 ? (
              <p className="text-black/60 text-[14px]">No active foods. Add a food and set it to Active first.</p>
            ) : (
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <select
                  value={selectedFood?.id || ""}
                  onChange={(e) => onFoodChange(e.target.value)}
                  disabled={isRecording}
                  className="w-full max-w-[520px] px-4 py-2.5 border border-[#cfcfcf] rounded-[8px] text-[14px] focus:outline-none focus:border-red-400 bg-white"
                >
                  {activeFoods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}{f.variant ? ` - ${f.variant}` : ""}
                    </option>
                  ))}
                </select>

                {selectedFood ? (
                  <div className="text-[12px] lg:text-[13px] text-black/70 leading-[1.5]">
                    <div>
                      <b>Category:</b> {selectedFood.category}
                    </div>
                    <div>
                      <b>Duration:</b> {selectedFood.durationMinutes} min (placeholder)
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="bg-white rounded-[12px] border border-[#d7d7d7] px-5 py-4 shadow-[0px_2px_6px_rgba(0,0,0,0.03)]">
            <h2 className="text-[15px] font-semibold text-black mb-2">Session</h2>
            <div className="border border-black/10 rounded-[10px] px-5 py-3 bg-[#fcfcfd]">
              <p className="text-black/55 text-[12px] mb-1">Timer</p>
              <p className="text-[34px] lg:text-[38px] leading-none font-extrabold text-black tracking-tight">{mm}:{ss}</p>
              <p className="text-[11px] text-black/35 mt-1">Starts when you press Start Recording</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[12px] border border-[#d7d7d7] p-5 lg:p-6 shadow-[0px_2px_6px_rgba(0,0,0,0.03)]">
          <h2 className="text-[22px] font-semibold text-black mb-4">Camera Preview</h2>

          <div className="bg-[#d9d9d9] rounded-[10px] w-full h-[430px] lg:h-[470px] relative overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraActive ? "block" : "hidden"}`}
            />

            {!cameraActive && (
              <div className="text-center px-6">
                <p className="text-[18px] text-black/55 mb-2">Camera feed will appear here</p>
                <p className="text-[14px] text-black/35">Make sure your camera is connected</p>
                {cameraError ? <p className="text-[13px] text-red-600 mt-4 max-w-[560px]">{cameraError}</p> : null}
              </div>
            )}

            {isRecording && (
              <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full shadow-[0px_2px_6px_rgba(0,0,0,0.16)]">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="text-[13px] font-bold">Recording...</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center mt-4">
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              disabled={!cameraActive || activeFoods.length === 0}
              className={`flex items-center gap-2 px-10 py-3 rounded-[8px] text-[18px] font-extrabold border border-black transition-colors ${
                cameraActive && activeFoods.length > 0
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              <Circle size={18} fill="currentColor" />
              Start Recording
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="bg-red-600 text-white flex items-center gap-2 px-10 py-3 rounded-[8px] text-[18px] font-extrabold border border-black hover:bg-red-700 transition-colors"
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              <Square size={18} fill="currentColor" />
              Stop Recording
            </button>
          )}
        </div>
      </div>

      {showConsent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" style={{ top: 0 }}>
          <div className="bg-white rounded-[10px] border border-black shadow-[0px_4px_4px_0px_rgba(0,0,0,0.4)] w-[900px] max-h-[90vh] overflow-y-auto p-10">
            <h2 className="text-[36px] font-extrabold text-black text-center mb-8">CONSENT FORM</h2>
            <div className="text-[20px] text-black mb-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              <p className="mb-6">
                By completing this consent form, I acknowledge and agree to the following conditions:
              </p>
              <ol className="list-decimal pl-8 space-y-4">
                <li>
                  The CAPSTONE 2502-IT Group may use my personal data solely for the purpose of information gathering to aid in the completion of their case study project.
                </li>
                <li>
                  The information I provide may be accessed by members of CAPSTONE 2502-IT Group at any point during the process of completing the case study.
                </li>
                <li>
                  Improper use or unauthorized disclosure of the information provided in this Google Form, whether online, offline, or in printed form, especially by CAPSTONE 2502-IT Group, will be subject to appropriate legal action under the Data Privacy Act of 2012 and the DLSU-M Student Handbook (2021-2025).
                </li>
                <li>
                  I understand and am assured that the CAPSTONE 2502-IT Group will take all necessary precautions to safeguard my personal information in compliance with the relevant data protection laws.
                </li>
              </ol>
            </div>

            <div className="mb-8">
              <p className="text-[20px] font-bold text-black mb-4">
                <span className="text-red-600">*</span> Please tick one of the boxes:
              </p>
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="consent"
                    checked={consentGiven === true}
                    onChange={() => setConsentGiven(true)}
                    className="mt-1 w-5 h-5 accent-red-600"
                  />
                  <span className="text-[18px] font-bold text-black">
                    Yes, I am giving consent to the research team to include my processed data in the CCDB.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="consent"
                    checked={consentGiven === false}
                    onChange={() => setConsentGiven(false)}
                    className="mt-1 w-5 h-5 accent-red-600"
                  />
                  <span className="text-[18px] font-bold text-black">No, I do not consent.</span>
                </label>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleConsentSubmit}
                disabled={consentGiven === null}
                className={`px-16 py-4 rounded-[10px] text-[24px] font-extrabold border border-black transition-colors ${
                  consentGiven !== null
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
                style={{ fontFamily: "'Roboto', sans-serif" }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
