import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:5000";

type TabKey = "frame" | "system" | "survey";
type SessionStatus = "pending" | "active" | "completed" | "cancelled";

type Food = {
  id: number;
  name: string;
  category: string;
};

type FrameLog = {
  timestamp: string | null;
  faceDetected: boolean | null;
  confidenceScore: number | null; // 0..1
  hedonicScore: number | null; // 0..1
};

type SystemLog = {
  logType: "error" | "warning" | "info";
  message: string;
  createdAt: string | null;
};

type SurveyResults = {
  age: number | null;
  gender: string | null;
  colorRating: number | null; // 1..9
  flavorAromaRating: number | null; // 1..9
  saltSweetRating: number | null; // 1..9
  textureRating: number | null; // 1..9
  finalOverallRating: number | null; // 1..9
  remarks: string | null;
};

type SessionDetailPayload = {
  session: {
    id: number;
    userId: number;
    foodId: number;
    status: SessionStatus;
    startTime: string | null;
    endTime: string | null;
  };
  food: Food | null;
  metrics: {
    totalFrames: number;
    meanConfidence: number | null; // 0..1
    meanHedonic: number | null; // 0..1
  };
  frameLogs: FrameLog[];
  systemLogs: SystemLog[];
  surveyResults: SurveyResults | null;
};

function clampPct(n: number) {
  return Math.max(0, Math.min(100, n));
}

function formatStatus(status: SessionStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status: SessionStatus) {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-700";
    case "active":
      return "bg-green-50 text-green-700";
    case "completed":
      return "bg-gray-100 text-gray-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function SessionDetail() {
  const navigate = useNavigate();
  const location = useLocation();

  const storedCurrent = useMemo(() => {
    try {
      const raw = localStorage.getItem("familis.currentSession");
      if (!raw) return null;
      return JSON.parse(raw) as { id?: number; startTime?: string; endTime?: string; foodId?: number };
    } catch {
      return null;
    }
  }, []);

  const sessionId = useMemo<number | null>(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("sessionId");
    if (q && Number.isFinite(Number(q))) return Number(q);

    const stateId = (location.state as any)?.sessionId ?? (location.state as any)?.id;
    if (stateId != null && Number.isFinite(Number(stateId))) return Number(stateId);

    if (storedCurrent?.id != null && Number.isFinite(Number(storedCurrent.id))) return Number(storedCurrent.id);
    return null;
  }, [location.search, location.state, storedCurrent?.id]);

  const [tab, setTab] = useState<TabKey>("frame");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionDetailPayload | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setData(null);
      setError("No session selected.");
      return;
    }

    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/details`, {
          signal: ac.signal,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load session details.");
        }
        setData(json as SessionDetailPayload);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load session details.");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ac.abort();
  }, [sessionId]);

  const content = data;
  const status = content?.session.status ?? "completed";

  const meanConfidencePct =
    content?.metrics.meanConfidence == null ? null : Math.round(content.metrics.meanConfidence * 100);
  const meanHedonicOutOf10 =
    content?.metrics.meanHedonic == null ? null : content.metrics.meanHedonic * 10;

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm transition-colors"
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </button>

          {loading && !content ? (
            <div className="text-center text-gray-600 text-sm">Loading session details…</div>
          ) : error && !content ? (
            <div className="text-center text-red-600 text-sm">{error}</div>
          ) : null}

          {content ? (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-[20px] font-bold text-gray-900">
                      S-{content.session.id}
                    </h1>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${statusClasses(
                        status
                      )}`}
                    >
                      {formatStatus(status)}
                    </span>
                  </div>
                  <p className="text-[14px] text-gray-600 mt-1">
                    {content.food ? `${content.food.name} - ${content.food.category}` : "Session"}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-1">
                    {formatDateTime(content.session.startTime)} - {formatDateTime(content.session.endTime)}
                  </p>
                </div>
              </div>

              {error ? (
                <div className="mb-4 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-md">
                  {error}
                </div>
              ) : null}

              {/* Metric cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <MetricCard
                  icon="📷"
                  iconBg="bg-blue-50 text-blue-600"
                  title="Total Frames Analyzed"
                  value={`${content.metrics.totalFrames}`}
                />
                <MetricCard
                  icon="📈"
                  iconBg="bg-green-50 text-green-600"
                  title="Avg Confidence Score"
                  value={meanConfidencePct == null ? "-" : `${meanConfidencePct}%`}
                />
                <MetricCard
                  icon="🍦"
                  iconBg="bg-red-50 text-[#e8174a]"
                  title="Avg Hedonic Score"
                  value={meanHedonicOutOf10 == null ? "-" : `${meanHedonicOutOf10.toFixed(1)}`}
                />
              </div>

              {/* Tabs */}
              <div className="flex rounded-md overflow-hidden border border-gray-200 bg-white mb-5">
                <TabButton active={tab === "frame"} onClick={() => setTab("frame")}>
                  Frame Logs
                </TabButton>
                <TabButton active={tab === "system"} onClick={() => setTab("system")}>
                  System Logs
                </TabButton>
                <TabButton active={tab === "survey"} onClick={() => setTab("survey")}>
                  Survey Results
                </TabButton>
              </div>

              {/* Tab content */}
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                {tab === "frame" ? (
                  <div>
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">Frame Logs</h2>
                    <p className="text-[12px] text-gray-500 mb-4">
                      Captured frames with face detection and emotion analysis
                    </p>
                    {content.frameLogs.length === 0 ? (
                      <div className="text-[12px] text-gray-500">No frame logs available.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-[720px] w-full text-left">
                          <thead>
                            <tr className="text-[12px] text-gray-500 bg-gray-50">
                              <th className="px-3 py-3 font-semibold">Timestamp</th>
                              <th className="px-3 py-3 font-semibold">Face Detected</th>
                              <th className="px-3 py-3 font-semibold">Confidence Score</th>
                              <th className="px-3 py-3 font-semibold">Hedonic Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {content.frameLogs.map((f, idx) => {
                              const confPct = f.confidenceScore == null ? 0 : clampPct(f.confidenceScore * 100);
                              const hedonic = f.hedonicScore == null ? null : Math.round(f.hedonicScore * 10);
                              return (
                                <tr key={`${f.timestamp ?? "t"}-${idx}`} className="border-t border-gray-100">
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {formatDateTime(f.timestamp)}
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {f.faceDetected === true ? (
                                      <span className="text-green-700 font-semibold">✓ Yes</span>
                                    ) : f.faceDetected === false ? (
                                      <span className="text-red-600 font-semibold">✗ No</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    <div className="w-full">
                                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#e8174a]"
                                          style={{ width: `${confPct}%` }}
                                          aria-label={`Confidence ${Math.round(confPct)}%`}
                                        />
                                      </div>
                                      <div className="mt-1 text-right text-[12px] text-gray-500">
                                        {f.confidenceScore == null ? "0%" : `${Math.round(f.confidenceScore * 100)}%`}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {hedonic == null ? (
                                      <span className="text-gray-400">0 / 10</span>
                                    ) : (
                                      <span className="font-semibold">
                                        {hedonic} / 10
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : tab === "system" ? (
                  <div>
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">System Logs</h2>
                    <p className="text-[12px] text-gray-500 mb-4">System-generated logs and events</p>

                    {content.systemLogs.length === 0 ? (
                      <div className="text-[12px] text-gray-500">No system logs available.</div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
                        {content.systemLogs.map((l, idx) => (
                          <div key={`${l.createdAt ?? "t"}-${idx}`} className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 px-3 py-1 rounded-md text-[11px] font-bold ${
                                l.logType === "warning"
                                  ? "bg-yellow-50 text-yellow-700"
                                  : l.logType === "error"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {l.logType.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] text-gray-800 font-semibold">{l.message}</p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {formatDateTime(l.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">Survey Results</h2>
                    <p className="text-[12px] text-gray-500 mb-4">
                      Participant profile, ratings breakdown, and remarks
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <InfoCard label="Participant Age" value={content.surveyResults?.age ?? null} />
                      <InfoCard
                        label="Gender"
                        value={
                          content.surveyResults?.gender
                            ? content.surveyResults.gender.charAt(0).toUpperCase() +
                              content.surveyResults.gender.slice(1)
                            : null
                        }
                      />
                    </div>

                    {content.surveyResults ? (
                      <>
                        <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 mb-5">
                          <h3 className="text-[13px] font-bold text-gray-900 mb-3">Ratings Breakdown</h3>

                          <RatingRow
                            label="Color"
                            rating={content.surveyResults.colorRating}
                          />
                          <RatingRow
                            label="Flavor/Aroma"
                            rating={content.surveyResults.flavorAromaRating}
                          />
                          <RatingRow
                            label="Salt/Sweet Balance"
                            rating={content.surveyResults.saltSweetRating}
                          />
                          <RatingRow
                            label="Texture"
                            rating={content.surveyResults.textureRating}
                          />

                          <div className="mt-4 pt-3 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[12px] text-gray-700 font-semibold">Overall Rating</p>
                              <p className="text-[12px] text-gray-700 font-semibold">
                                {formatRatingOutOf10(content.surveyResults.finalOverallRating)}
                                {" / 10"}
                              </p>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#e8174a]"
                                style={{
                                  width: `${clampPct(
                                    (ratingToOutOf10(content.surveyResults.finalOverallRating) / 10) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-100 p-4">
                          <h3 className="text-[13px] font-bold text-gray-900 mb-2">Remarks</h3>
                          <p className="text-[12px] text-gray-500">
                            {content.surveyResults.remarks ??
                              "No remarks provided for this session."}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] text-gray-500">
                        No survey results available for this session yet.
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="text-center text-gray-600 text-sm">No session data.</div>
          )}
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  iconBg,
  title,
  value,
}: {
  icon: string;
  iconBg: string;
  title: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-gray-500 font-semibold">{title}</p>
        <p className="text-[26px] leading-none text-gray-900 font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${
        active ? "bg-[#e8174a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <p className="text-[12px] text-gray-500 font-semibold">{label}</p>
      <p className="text-[16px] text-gray-900 font-bold mt-1">{value == null ? "-" : value}</p>
    </div>
  );
}

function ratingToOutOf10(rating1to9: number | null) {
  if (rating1to9 == null) return 0;
  return (rating1to9 / 9) * 10;
}

function formatRatingOutOf10(rating1to9: number | null) {
  return Math.round(ratingToOutOf10(rating1to9));
}

function RatingRow({ label, rating }: { label: string; rating: number | null }) {
  const outOf10 = ratingToOutOf10(rating);
  const pct = clampPct((outOf10 / 10) * 100);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-gray-700 font-semibold">{label}</p>
        <p className="text-[12px] text-gray-600 font-semibold">
          {formatRatingOutOf10(rating)} / 10
        </p>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-[#e8174a]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}