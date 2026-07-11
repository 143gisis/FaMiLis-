import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { InfoTip } from "../components/InfoTip";
import { apiFetch, setToken } from "../lib/api";
import { getStoredRole, isAdminRole } from "../RequireAuth";

type Food = {
  id: number;
  name: string;
  category: string;
};
type Participant = {
  id: number;
  testerLabel: string | null;
  age: number | null;
  gender: string | null;
};

function getStoredUserId(): number {
  try {
    const raw = localStorage.getItem("familis.user");
    if (!raw) return 1;
    const parsed = JSON.parse(raw) as { id?: number };
    return Number(parsed?.id ?? 1) || 1;
  } catch {
    return 1;
  }
}

const CONSENT_ITEMS = [
  {
    key: "facialRecording" as const,
    label: "I agree to facial recording and camera capture for analysis",
    helper: "Your webcam feed is captured locally during the session for emotion analysis. No video is stored — only individual frames.",
    required: true,
  },
  {
    key: "dataUsage" as const,
    label: "I agree to the use of session data for research purposes",
    helper: "Anonymized scores may be included in aggregated reports. Frames are deleted after ~30 days.",
    required: true,
  },
  {
    key: "participant" as const,
    label: "I confirm I am a willing participant in this study",
    helper: "Participation is voluntary. You may stop the session at any time.",
    required: true,
  },
  {
    key: "dataStorage" as const,
    label: "I understand data is stored locally on this lab system",
    helper: "All data stays on-premises. This is a lab demo — not a clinical or commercial deployment.",
    required: true,
  },
];

type ConsentState = Record<typeof CONSENT_ITEMS[number]["key"], boolean>;

const DEFAULT_CONSENT: ConsentState = {
  facialRecording: false,
  dataUsage: false,
  participant: false,
  dataStorage: false,
};

type ParticipantPrefill = {
  participantId?: number;
  testerLabel?: string;
  age?: number | null;
  gender?: string | null;
};

export default function Setup() {
  const navigate = useNavigate();
  const location = useLocation();
  const preselectedFoodId = (location.state as { foodId?: number } | null)?.foodId;
  const foodPreselectAppliedRef = useRef(false);
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);

  // Participant detail's "Start new session" CTA hands off via location.state so
  // staff don't have to retype demographics; those fields are then locked read-only.
  const participantPrefill = useMemo(() => {
    const state = location.state as ParticipantPrefill | null;
    if (!state?.testerLabel) return null;
    return state;
  }, [location.state]);
  const isParticipantLocked = participantPrefill != null;

  const [selectedFoodId, setSelectedFoodId] = useState<number | "">("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantLabel, setParticipantLabel] = useState(participantPrefill?.testerLabel ?? "");
  const [participantAge, setParticipantAge] = useState(
    participantPrefill?.age != null ? String(participantPrefill.age) : ""
  );
  const [participantGender, setParticipantGender] = useState(participantPrefill?.gender ?? "");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_CONSENT);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  const [handoffEmail, setHandoffEmail] = useState("");
  const [handoffPassword, setHandoffPassword] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffing, setHandoffing] = useState(false);

  const isAdmin = isAdminRole(getStoredRole());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await apiFetch(`/api/foods`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load foods.");
        const list = (json.foods ?? []) as any[];
        setFoods(
          list.map((f) => ({
            id: Number(f.id),
            name: String(f.name),
            category: String(f.category),
          }))
        );
      } catch (err: any) {
        setFoodsError(err?.message || "Failed to load foods.");
      } finally {
        setFoodsLoading(false);
      }
    }
    void loadFoods();
  }, []);

  useEffect(() => {
    if (foodsLoading || foods.length === 0) return;
    if (foodPreselectAppliedRef.current) return;
    if (preselectedFoodId == null || !Number.isFinite(preselectedFoodId)) return;
    const exists = foods.some((f) => f.id === preselectedFoodId);
    if (!exists) return;
    setSelectedFoodId((current) => {
      if (current !== "") return current;
      foodPreselectAppliedRef.current = true;
      return preselectedFoodId;
    });
  }, [foodsLoading, foods, preselectedFoodId]);

  useEffect(() => {
    async function loadParticipants() {
      try {
        const res = await apiFetch(`/api/participants`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) return;
        const list = (json.participants ?? []) as any[];
        setParticipants(
          list.map((p) => ({
            id: Number(p.id),
            testerLabel: p.testerLabel == null ? null : String(p.testerLabel),
            age: p.age == null ? null : Number(p.age),
            gender: p.gender == null ? null : String(p.gender),
          }))
        );
      } catch {
        // Non-blocking for setup flow.
      }
    }
    void loadParticipants();
  }, []);

  // Gate camera: only activate when all consent boxes are checked
  const allConsentChecked = Object.values(consent).every(Boolean);

  useEffect(() => {
    if (!allConsentChecked) {
      // Stop any existing stream if user un-checks a box
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraError(null);
      return;
    }

    let cancelled = false;
    setCameraError(null);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        if (!cancelled) {
          setCameraError(err?.message || "Camera permission denied or not available.");
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [allConsentChecked]);

  const selectedFood = useMemo(
    () => foods.find((f) => f.id === selectedFoodId) ?? null,
    [foods, selectedFoodId]
  );
  const selectedParticipant = useMemo(() => {
    const label = participantLabel.trim().toLowerCase();
    if (!label) return null;
    return (
      participants.find((p) => (p.testerLabel ?? "").trim().toLowerCase() === label) ?? null
    );
  }, [participantLabel, participants]);

  useEffect(() => {
    if (!selectedParticipant) return;
    setParticipantAge(
      selectedParticipant.age == null ? "" : String(selectedParticipant.age)
    );
    setParticipantGender(selectedParticipant.gender ?? "");
  }, [selectedParticipant]);

  const consentCount = Object.values(consent).filter(Boolean).length;
  const consentTotal = CONSENT_ITEMS.length;

  const canStart =
    !!selectedFoodId &&
    allConsentChecked &&
    !!participantLabel.trim() &&
    !foodsLoading &&
    !starting;

  const canHandoff = canStart && !!handoffEmail.trim() && !!handoffPassword && !handoffing;

  const handleStart = async () => {
    if (!canStart) return;
    setStartError(null);
    setParticipantError(null);
    setStarting(true);
    try {
      const participantRes = await apiFetch(`/api/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testerLabel: participantLabel.trim(),
          age: participantAge.trim() === "" ? null : Number(participantAge),
          gender: participantGender || null,
        }),
      });
      const participantJson = await participantRes.json().catch(() => null);
      if (!participantRes.ok || !participantJson?.ok || !participantJson?.participant?.id) {
        throw new Error(participantJson?.error || "Failed to register participant.");
      }
      const createdParticipantId = Number(participantJson.participant.id);

      const res = await apiFetch(`/api/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getStoredUserId(),
          foodId: selectedFoodId as number,
          participantId: createdParticipantId,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to start session.");
      }

      const started = json.session as {
        id: number;
        userId: number;
        participantId: number | null;
        foodId: number;
        status: "pending" | "active" | "completed" | "cancelled";
        startTime: string;
      };

      localStorage.setItem(
        "familis.currentSession",
        JSON.stringify({
          id: started.id,
          userId: started.userId,
          participantId: started.participantId,
          foodId: started.foodId,
          status: started.status,
          startTime: started.startTime,
        })
      );

      setSessionStarted(true);
      // Small delay so the toast is visible briefly before navigating
      setTimeout(() => {
        navigate("/session", { state: { session: started, food: selectedFood } });
      }, 700);
    } catch (err: any) {
      const message = err?.message || "Failed to start session.";
      if (message.toLowerCase().includes("participant")) setParticipantError(message);
      setStartError(message);
      setStarting(false);
    }
  };

  const handleHandoff = async () => {
    if (!canHandoff) return;
    setHandoffError(null);
    setParticipantError(null);
    setHandoffing(true);
    try {
      // Validate tester credentials first — before touching anything — so a typo
      // does not leave the admin logged out with a half-started session.
      const loginRes = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: handoffEmail.trim(), password: handoffPassword }),
      });
      const loginJson = await loginRes.json().catch(() => null);
      if (!loginRes.ok || !loginJson?.ok) {
        setHandoffError(loginJson?.error || "Wrong participant credentials.");
        return;
      }

      // Credentials are valid — now start the session.
      const participantRes = await apiFetch(`/api/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testerLabel: participantLabel.trim(),
          age: participantAge.trim() === "" ? null : Number(participantAge),
          gender: participantGender || null,
        }),
      });
      const participantJson = await participantRes.json().catch(() => null);
      if (!participantRes.ok || !participantJson?.ok || !participantJson?.participant?.id) {
        setHandoffError(participantJson?.error || "Failed to register participant.");
        return;
      }

      const sessRes = await apiFetch(`/api/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getStoredUserId(),
          foodId: selectedFoodId as number,
          participantId: Number(participantJson.participant.id),
        }),
      });
      const sessJson = await sessRes.json().catch(() => null);
      if (!sessRes.ok || !sessJson?.ok) {
        setHandoffError(sessJson?.error || "Failed to start session.");
        return;
      }

      const started = sessJson.session as {
        id: number; userId: number; participantId: number | null;
        foodId: number; status: string; startTime: string;
      };
      localStorage.setItem("familis.currentSession", JSON.stringify({
        id: started.id, userId: started.userId,
        participantId: started.participantId, foodId: started.foodId,
        status: started.status, startTime: started.startTime,
      }));

      // Swap auth: clear admin user/token, store tester credentials.
      try { localStorage.removeItem("familis.user"); } catch { /* ignore */ }
      try { localStorage.setItem("familis.user", JSON.stringify(loginJson.user)); } catch { /* ignore */ }
      setToken(loginJson.token);

      navigate("/consent");
    } catch (err: any) {
      setHandoffError(err?.message || "Handoff failed.");
    } finally {
      setHandoffing(false);
    }
  };

  return (
    <PageHeader
      variant="collapsed"
      backLabel="Back to Dashboard"
      backTo="/dashboard"
    >
      {sessionStarted && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <span aria-hidden="true">✓</span>
          Session started
        </div>
      )}

      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <PageTitle
            title="Camera Setup"
            subtitle="Configure your food testing session"
            hideBack
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-5">
              {/* Food selector */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <label className="block text-sm text-gray-700 mb-2 font-semibold">
                  Select Food <span className="text-[#e8174a]">*</span>
                </label>
                <select
                  value={selectedFoodId}
                  onChange={(e) => setSelectedFoodId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                  disabled={foodsLoading || !!foodsError}
                >
                  <option value="">{foodsLoading ? "Loading foods..." : "Choose a food..."}</option>
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name} — {food.category}
                    </option>
                  ))}
                </select>
                {foodsError ? (
                  <p className="text-xs text-red-600 mt-2">{foodsError}</p>
                ) : null}
              </div>

              {/* Participant */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="inline-flex items-center gap-1.5">
                    <label className="text-sm text-gray-700 font-semibold">
                      Participant Label / ID <span className="text-[#e8174a]">*</span>
                    </label>
                    <InfoTip term="participantLabel" align="left" />
                  </div>
                  {isParticipantLocked ? (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fde8ed] text-[#c9143f]">
                      From participant profile
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  list="participant-labels"
                  value={participantLabel}
                  onChange={(e) => setParticipantLabel(e.target.value)}
                  placeholder="e.g. T-01"
                  disabled={isParticipantLocked}
                  className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white disabled:bg-gray-50 disabled:text-gray-600"
                />
                <datalist id="participant-labels">
                  {participants
                    .filter((p) => p.testerLabel)
                    .map((p) => (
                      <option key={p.id} value={p.testerLabel as string} />
                    ))}
                </datalist>
                <p className="text-[11px] text-gray-500 mt-2">
                  {isParticipantLocked
                    ? "Demographics are locked to keep this participant's history consistent."
                    : "Enter an existing label to reuse a participant, or a new one to create it. Matching participants auto-fill age/gender."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <input
                    type="number"
                    value={participantAge}
                    onChange={(e) => setParticipantAge(e.target.value)}
                    placeholder="Age (optional)"
                    min={0}
                    max={120}
                    disabled={isParticipantLocked}
                    className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white disabled:bg-gray-50 disabled:text-gray-600"
                  />
                  <select
                    value={participantGender}
                    onChange={(e) => setParticipantGender(e.target.value)}
                    disabled={isParticipantLocked}
                    className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white disabled:bg-gray-50 disabled:text-gray-600"
                  >
                    <option value="">Gender (optional)</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {participantError ? <p className="text-xs text-red-600 mt-2">{participantError}</p> : null}
              </div>

              {/* Consent panel */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm text-gray-900 font-bold">Participant Consent</h3>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    allConsentChecked
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {consentCount} of {consentTotal}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mb-4">
                  All items must be acknowledged before the session can begin.
                </p>

                <div className="mb-4 p-3 bg-[#fde8ed] rounded-lg border border-[#e8174a]/20">
                  <p className="text-[11px] font-semibold text-[#c9143f] mb-1">Data &amp; Privacy — Lab Demo</p>
                  <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc list-inside">
                    <li>Frames are stored locally; no cloud upload.</li>
                    <li>Scores are anonymized before reporting.</li>
                    <li>Frame images are deleted after ~30 days.</li>
                    <li>This is a prototype system, not a clinical tool.</li>
                  </ul>
                </div>

                <div className="space-y-1">
                  {CONSENT_ITEMS.map((item) => (
                    <ConsentRow
                      key={item.key}
                      checked={consent[item.key]}
                      onChange={(checked) =>
                        setConsent((p) => ({ ...p, [item.key]: checked }))
                      }
                      label={item.label}
                      helper={item.helper}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-5">
              {/* Booth handoff — admin/staff only */}
              {isAdmin && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-sm text-gray-700 font-semibold mb-0.5 inline-flex items-center gap-1.5">
                    Booth Handoff
                    <InfoTip term="boothHandoff" align="left" />
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    Enter participant login to start the session and switch accounts automatically.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="email"
                      value={handoffEmail}
                      onChange={(e) => setHandoffEmail(e.target.value)}
                      placeholder="tester@familis.com"
                      autoComplete="off"
                      className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                    />
                    <input
                      type="password"
                      value={handoffPassword}
                      onChange={(e) => setHandoffPassword(e.target.value)}
                      placeholder="Participant password"
                      autoComplete="new-password"
                      className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleHandoff}
                    disabled={!canHandoff}
                    className={`mt-3 w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${
                      canHandoff
                        ? "bg-gray-800 hover:bg-gray-900 text-white shadow-sm"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {handoffing ? "Starting…" : "Start Session & Hand Off"}
                  </button>
                  {handoffError ? (
                    <p className="text-xs text-red-600 mt-2">{handoffError}</p>
                  ) : null}
                  {!handoffEmail.trim() && !handoffPassword && (
                    <p className="text-[11px] text-gray-400 mt-2">
                      Leave blank to use the Start Session by the admins below.
                    </p>
                  )}
                </div>
              )}

              {/* Camera preview */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm text-gray-700 mb-3 font-semibold">Camera Preview</h3>

                <div className={`aspect-video bg-gray-100 rounded-lg overflow-hidden border flex items-center justify-center transition-colors ${
                  allConsentChecked ? "border-gray-200" : "border-dashed border-gray-300"
                }`}>
                  {!allConsentChecked ? (
                    <div className="text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-600 font-semibold">Camera locked</p>
                      <p className="text-xs text-gray-400 mt-1">Complete consent to enable preview</p>
                    </div>
                  ) : cameraError ? (
                    <div className="text-center px-6">
                      <p className="text-sm text-gray-600 font-semibold">Camera unavailable</p>
                      <p className="text-xs text-gray-500 mt-1">{cameraError}</p>
                    </div>
                  ) : (
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                  )}
                </div>

                <p className="text-[11px] text-gray-500 mt-2">
                  {allConsentChecked
                    ? "Make sure your face is visible and lighting is even."
                    : "Camera activates once all consent items are checked."}
                </p>
              </div>

              {/* Start CTA */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className={`w-full py-3.5 rounded-lg text-sm font-bold transition-colors ${
                    canStart
                      ? "bg-[#e8174a] hover:bg-[#c9143f] text-white shadow-sm"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {starting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Starting…
                    </span>
                  ) : (
                    "Start the Session"
                  )}
                </button>

                {!canStart && (
                  <p className="text-[11px] text-gray-500 text-center">
                    {!allConsentChecked
                      ? `${consentCount} of ${consentTotal} consent items checked`
                      : !selectedFoodId
                        ? "Select a food product to continue"
                        : !participantLabel.trim()
                          ? "Enter a participant label to continue"
                          : "Complete all required fields"}
                  </p>
                )}

                {startError ? (
                  <p className="text-xs text-red-600 text-center">{startError}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </PageHeader>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        checked ? "bg-[#fde8ed]" : "hover:bg-gray-50"
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
            checked
              ? "bg-[#e8174a] border-[#e8174a]"
              : "bg-white border-gray-300"
          }`}
          aria-hidden="true"
        >
          {checked && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <span className={`text-sm font-medium block ${checked ? "text-gray-900" : "text-gray-700"}`}>
          {label}
        </span>
        {helper && (
          <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">{helper}</span>
        )}
      </div>
    </label>
  );
}
