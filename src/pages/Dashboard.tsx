import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";
import { PageHeader } from "../components/PageHeader";
import { confidenceToTier } from "../lib/confidence";
import { RATING_LABELS, hedonicColor } from "../lib/ratingLabels";
import { ATTRIBUTE_COLORS, getDemoColor } from "../lib/attributeColors";
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Line, Radar } from "react-chartjs-2";

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

type TabKey = "food" | "stats";
type SessionStatus = "pending" | "active" | "completed" | "cancelled";

type Session = {
  id: number;
  userId: number;
  startTime: string | null;
  endTime: string | null;
  status: SessionStatus;
  frames: number;
  meanConfidence: number | null; // 0-1
};

type Food = {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  createdAt: string | null;
  sessionsTotal: number;
  sessionsActive: number;
  avgDurationMin: number | null;
};

type Analytics = {
  meanConfidence: number;
  meanHedonic: number;
  distribution: { label: string; value: number; color: string }[];
  radar: { label: string; score: number }[];
  timeline: { label: string; score: number; sub: string }[];
  byAge: { label: string; score: number }[];
  byGender: { label: string; score: number }[];
  sampleSize: number;
  sessionCount: number;
  frameLogCount: number;
  surveyCount: number;
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

const API_BASE = "http://localhost:5000";
const toApiUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("food");
  const [foods, setFoods] = useState<Food[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({
    name: "",
    category: "",
  });
  const [newFoodImageFile, setNewFoodImageFile] = useState<File | null>(null);
  const [sessionsByFoodId, setSessionsByFoodId] = useState<Record<number, Session[]>>({});
  const [analyticsByFoodId, setAnalyticsByFoodId] = useState<Record<number, Analytics>>({});
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState<Record<number, boolean>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState<Record<number, boolean>>({});
  const [statsError, setStatsError] = useState<string | null>(null);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
  const [deletingFoodId, setDeletingFoodId] = useState<number | null>(null);
  const [deleteFoodError, setDeleteFoodError] = useState<string | null>(null);
  const foodsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    foodsAbortRef.current?.abort();
    const ac = new AbortController();
    foodsAbortRef.current = ac;

    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await fetch(`${API_BASE}/api/foods`, { signal: ac.signal });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load foods.");
        }
        const list: Food[] = json.foods ?? [];
        setFoods(list);
        setExpandedFoodId((prev) => {
          if (prev && list.some((f) => f.id === prev)) return prev;
          return null;
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setFoodsError(err?.message || "Failed to load foods.");
      } finally {
        setFoodsLoading(false);
      }
    }

    void loadFoods();
    return () => ac.abort();
  }, []);

  const totalFoods = foods.length;
  const activeFoods = foods.filter((f) => f.sessionsActive > 0).length;
  const categories = new Set(foods.map((f) => f.category)).size;

  const selectedFood = useMemo(() => {
    const candidate = foods.find((f) => f.id === expandedFoodId) ?? foods[0];
    return candidate ?? null;
  }, [foods, expandedFoodId]);

  useEffect(() => {
    if (tab !== "stats") return;
    if (!selectedFood) return;
    const foodId = selectedFood.id;
    if (analyticsByFoodId[foodId]) return;
    if (analyticsLoading[foodId]) return;

    async function loadAnalytics() {
      setStatsError(null);
      setAnalyticsLoading((p) => ({ ...p, [foodId]: true }));
      try {
        const res = await fetch(`${API_BASE}/api/foods/${foodId}/analytics`);
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load analytics.");
        }
        setAnalyticsByFoodId((p) => ({ ...p, [foodId]: json.analytics as Analytics }));
      } catch (err: any) {
        setStatsError(err?.message || "Failed to load analytics.");
      } finally {
        setAnalyticsLoading((p) => ({ ...p, [foodId]: false }));
      }
    }

    void loadAnalytics();
  }, [tab, selectedFood, analyticsByFoodId, analyticsLoading]);

  const stats = useMemo(() => {
    if (!selectedFood) {
      return {
        meanConfidence: 0,
        meanHedonic: 0,
        distribution: [
          { label: "Positive (7-9)", value: 0, color: "#22c55e" },
          { label: "Neutral (5-6)", value: 0, color: "#eab308" },
          { label: "Negative (1-4)", value: 0, color: "#ef4444" },
        ],
        radar: [
          { label: "Color", score: 0 },
          { label: "Flavor/Aroma", score: 0 },
          { label: "Salt/Sweet", score: 0 },
          { label: "Texture", score: 0 },
          { label: "Overall", score: 0 },
        ],
        timeline: [
          { label: "First taste", score: 0, sub: "Early" },
          { label: "Mid", score: 0, sub: "Middle" },
          { label: "Aftertaste", score: 0, sub: "Late" },
        ],
        byAge: [],
        byGender: [],
        sampleSize: 0,
        sessionCount: 0,
        frameLogCount: 0,
        surveyCount: 0,
      };
    }
    return (
      analyticsByFoodId[selectedFood.id] ?? {
        meanConfidence: 0,
        meanHedonic: 0,
        distribution: [
          { label: "Positive (7-9)", value: 0, color: "#22c55e" },
          { label: "Neutral (5-6)", value: 0, color: "#eab308" },
          { label: "Negative (1-4)", value: 0, color: "#ef4444" },
        ],
        radar: [
          { label: "Color", score: 0 },
          { label: "Flavor/Aroma", score: 0 },
          { label: "Salt/Sweet", score: 0 },
          { label: "Texture", score: 0 },
          { label: "Overall", score: 0 },
        ],
        timeline: [
          { label: "First taste", score: 0, sub: "Early" },
          { label: "Mid", score: 0, sub: "Middle" },
          { label: "Aftertaste", score: 0, sub: "Late" },
        ],
        byAge: [],
        byGender: [],
        sampleSize: 0,
        sessionCount: 0,
        frameLogCount: 0,
        surveyCount: 0,
      }
    );
  }, [selectedFood, analyticsByFoodId]);

  const analyticsIssues = useMemo(() => {
    const issues: string[] = [];
    const sessionCount = Number(stats.sessionCount ?? 0);
    const frameLogCount = Number(stats.frameLogCount ?? 0);
    const surveyCount = Number(stats.surveyCount ?? 0);
    if (!selectedFood) {
      issues.push("Select a food product to view analytics.");
      return issues;
    }
    if (sessionCount <= 0) {
      issues.push("No sessions yet for this food product.");
    }
    if (frameLogCount <= 0) {
      issues.push("No frame logs found. FER charts may be empty.");
    }
    if (surveyCount <= 0) {
      issues.push("No survey submissions yet. Survey-based charts may be empty.");
    }
    return issues;
  }, [selectedFood, stats.frameLogCount, stats.sessionCount, stats.surveyCount]);

  // Hide analytics visuals when critical data is missing
  const hideAnalyticsGraphs = useMemo(() => {
    if (!selectedFood) return true;
    const sessionCount = Number(stats.sessionCount ?? 0);
    const frameLogCount = Number(stats.frameLogCount ?? 0);
    const surveyCount = Number(stats.surveyCount ?? 0);
    return sessionCount <= 0 || frameLogCount <= 0 || surveyCount <= 0;
  }, [selectedFood, stats.sessionCount, stats.frameLogCount, stats.surveyCount]);

  // Exclude "Overall" from the radar chart — keep only the 4 attribute axes.
  const radarAttributes = useMemo(
    () => stats.radar.filter((r) => r.label !== "Overall"),
    [stats.radar]
  );

  const radarChartData = useMemo(() => {
    const labels = radarAttributes.map((r) => r.label);
    const values = radarAttributes.map((r) => (Number.isFinite(r.score) ? r.score : 0));
    return {
      labels,
      datasets: [
        {
          label: "Survey attributes",
          data: values,
          fill: true,
          backgroundColor: "rgba(232, 23, 74, 0.18)",
          borderColor: "rgb(232, 23, 74)",
          pointBackgroundColor: "rgb(232, 23, 74)",
          pointBorderColor: "#fff",
          pointHoverBackgroundColor: "#fff",
          pointHoverBorderColor: "rgb(232, 23, 74)",
          borderWidth: 2,
        },
      ],
    };
  }, [radarAttributes]);

  const radarChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.label}: ${Number(ctx.raw ?? 0).toFixed(1)} / 9`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 9,
          ticks: {
            stepSize: 1,
            showLabelBackdrop: false,
            color: "#9ca3af",
            font: { size: 10 },
          },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          angleLines: { color: "rgba(156, 163, 175, 0.25)" },
          pointLabels: {
            color: "#6b7280",
            font: { size: 11, weight: 600 as any },
          },
        },
      },
    } as const;
  }, []);

  const lineChartData = useMemo(() => {
    const labels = stats.timeline.map((t) => {
      const raw = t.label.toLowerCase();
      if (raw.includes("first")) return "1st Taste (Initial)";
      if (raw.includes("mid")) return "Chewing/Tasting (Mid)";
      if (raw.includes("after")) return "Aftertaste (End)";
      return t.label;
    });

    const scores = stats.timeline.map((t) => (Number.isFinite(t.score) ? t.score : 0));

    return {
      labels,
      datasets: [
        {
          label: "FER hedonic (avg)",
          data: scores,
          // Per-segment color based on the average of the two endpoint scores
          segment: {
            borderColor: (ctx: any) => {
              const avg = (ctx.p0.parsed.y + ctx.p1.parsed.y) / 2;
              return hedonicColor(avg);
            },
          },
          pointBackgroundColor: scores.map((s) => hedonicColor(s)),
          pointBorderColor: "#fff",
          pointRadius: 7,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.35,
          fill: false,
          // borderColor is overridden per-segment; this is a fallback
          borderColor: "transparent",
          backgroundColor: "transparent",
        },
      ],
    };
  }, [stats.timeline]);

  const lineChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${Number(ctx.raw ?? 0).toFixed(1)} / 9`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#6b7280", font: { size: 11 } },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
        y: {
          min: 0,
          max: 9,
          ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
      },
    } as const;
  }, []);

  const ensureSessionsLoaded = async (foodId: number) => {
    if (sessionsByFoodId[foodId]) return;
    if (sessionsLoading[foodId]) return;
    setSessionsLoading((p) => ({ ...p, [foodId]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/foods/${foodId}/sessions`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load sessions.");
      }
      setSessionsByFoodId((p) => ({ ...p, [foodId]: (json.sessions ?? []) as Session[] }));
    } finally {
      setSessionsLoading((p) => ({ ...p, [foodId]: false }));
    }
  };

  const onDeleteFood = async (foodId: number) => {
    try {
      setDeletingFoodId(foodId);
      setDeleteFoodError(null);
      const res = await fetch(`${API_BASE}/api/foods/${foodId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete food.");
      }
      setFoods((prev) => prev.filter((f) => f.id !== foodId));
      setExpandedFoodId((prev) => {
        if (prev !== foodId) return prev;
        const remaining = foods.filter((f) => f.id !== foodId);
        return remaining[0]?.id ?? null;
      });
    } catch (err) {
      setDeleteFoodError((err as any)?.message || "Failed to delete food.");
    } finally {
      setDeletingFoodId(null);
      setFoodToDelete(null);
    }
  };

  const onAddFood = async () => {
    const name = newFood.name.trim();
    const category = newFood.category.trim();
    if (!name || !category) return;

    try {
      const res = await fetch(`${API_BASE}/api/foods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add food.");
      }
      const created = json.food as { id: number; name: string; category: string; createdAt: string };
      let uploadedImageUrl: string | null = null;
      if (newFoodImageFile) {
        const fd = new FormData();
        fd.append("image", newFoodImageFile);
        const imgRes = await fetch(`${API_BASE}/api/foods/${created.id}/image`, {
          method: "POST",
          body: fd,
        });
        const imgJson = await imgRes.json().catch(() => null);
        if (imgRes.ok && imgJson?.ok) {
          uploadedImageUrl = String(imgJson.imageUrl ?? "");
        }
      }
      const newRow: Food = {
        id: created.id,
        name: created.name,
        category: created.category,
        imageUrl: uploadedImageUrl,
        createdAt: created.createdAt,
        sessionsTotal: 0,
        sessionsActive: 0,
        avgDurationMin: null,
      };
      setFoods((prev) => [newRow, ...prev]);
      setExpandedFoodId(created.id);
      setShowAdd(false);
      setTab("food");
      setNewFood({ name: "", category: "" });
      setNewFoodImageFile(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <PageHeader />

      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Food Testing Hub</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Add and Manage Food for Testing</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
            >
              <span aria-hidden="true">➕</span>
              Add New Food
            </button>
            <button
              type="button"
              onClick={() => navigate("/setup")}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
            >
              <span aria-hidden="true">📷</span>
              Camera Recording
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard icon="🍽️" label="Total Foods" value={totalFoods} />
            <StatCard icon="✅" label="Active Foods" value={activeFoods} />
            <StatCard icon="🏷️" label="Categories" value={categories} />
          </div>

          {/* Tabs */}
          <div className="flex rounded-md overflow-hidden border border-gray-200 bg-white mb-5">
            <TabButton active={tab === "food"} onClick={() => setTab("food")}>
              Food Management
            </TabButton>
            <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
              Statistics &amp; Analytics
            </TabButton>
          </div>

          {tab === "food" ? (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-gray-900 font-bold mb-4">Food Management</h2>

              {foodsLoading ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Loading foods…</p>
                </div>
              ) : foodsError ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Failed to load foods.</p>
                  <p className="text-xs mt-2 text-gray-400">{foodsError}</p>
                </div>
              ) : foods.length === 0 ? (
                <div className="text-center py-14 text-gray-400">
                  <div className="text-4xl mb-3" aria-hidden="true">🍽️</div>
                  <p className="text-sm font-semibold text-gray-600">No food products yet</p>
                  <p className="text-xs mt-1">Click "Add New Food" to register your first product for testing.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {foods.map((food) => {
                    const isExpanded = expandedFoodId === food.id;
                    const sessions = sessionsByFoodId[food.id] ?? [];
                    return (
                      <div key={food.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                <span className="inline-flex items-center gap-2">
                                  {food.imageUrl ? (
                                    <img
                                      src={toApiUrl(food.imageUrl) ?? undefined}
                                      alt={food.name}
                                      className="w-8 h-8 rounded-md border border-gray-200 object-cover"
                                    />
                                  ) : (
                                    <span className="w-8 h-8 rounded-md border border-dashed border-gray-300 bg-gray-50 inline-flex items-center justify-center text-[10px] text-gray-400">
                                      IMG
                                    </span>
                                  )}
                                  <span className="truncate">{food.name}</span>
                                </span>
                              </p>
                              <Badge
                                className={
                                  food.sessionsActive > 0
                                    ? "bg-green-50 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }
                              >
                                {food.sessionsActive > 0 ? "Active session" : "No active sessions"}
                              </Badge>
                              <Badge className="bg-blue-50 text-blue-700">
                                {food.sessionsTotal} session{food.sessionsTotal === 1 ? "" : "s"}
                              </Badge>
                            </div>

                            <div className="mt-2 space-y-0.5 text-xs text-gray-500">
                              <p>
                                <span className="text-gray-700 font-semibold">Category:</span>{" "}
                                {food.category}
                              </p>
                              <p>
                                <span className="text-gray-700 font-semibold">Duration:</span>{" "}
                                {food.avgDurationMin == null ? "-" : `${Math.round(food.avgDurationMin)} minutes (avg)`}
                              </p>
                              <p>
                                <span className="text-gray-700 font-semibold">Created:</span>{" "}
                                {formatDate(food.createdAt)}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 mt-3">
                              <button
                                type="button"
                                onClick={() => setFoodToDelete(food)}
                                className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">🗑️</span>
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = isExpanded ? null : food.id;
                                  setExpandedFoodId(next);
                                  if (next != null) await ensureSessionsLoaded(next);
                                }}
                                className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">{isExpanded ? "🔼" : "🔽"}</span>
                                {isExpanded ? "Hide Sessions" : "View Sessions"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <h3 className="text-xs text-gray-700 font-bold mb-2">
                              Testing Sessions
                            </h3>

                            {sessionsLoading[food.id] ? (
                              <div className="text-xs text-gray-500">Loading sessions…</div>
                            ) : sessions.length === 0 ? (
                              <div className="text-xs text-gray-500">No sessions yet.</div>
                            ) : (
                              <div className="space-y-2">
                                {sessions.map((s) => (
                                  <div
                                    key={s.id}
                                    className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-semibold text-gray-900">
                                          S-{s.id}
                                        </p>
                                        <Badge className={statusClasses(s.status)}>{formatStatus(s.status)}</Badge>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/session-detail?sessionId=${s.id}`)}
                                        className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors"
                                      >
                                        View Details
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                      <div>
                                        <span className="text-gray-500">Start:</span>{" "}
                                        <span className="text-gray-700">{formatDateTime(s.startTime)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">End:</span>{" "}
                                        <span className="text-gray-700">{formatDateTime(s.endTime)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Frames:</span>{" "}
                                        <span className="text-gray-700">{s.frames}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Confidence:</span>{" "}
                                        <span className="text-gray-700">
                                          {s.meanConfidence == null ? "-" : `${Math.round(s.meanConfidence * 100)}%`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-gray-900 font-bold">
                      {selectedFood ? selectedFood.name : "Statistics & Analytics"}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Live analytics from DB
                    </p>
                  </div>

                  {foods.length > 1 && (
                    <select
                      value={selectedFood?.id ?? ""}
                      onChange={(e) => setExpandedFoodId(Number(e.target.value))}
                      className="text-xs border border-gray-200 rounded-md px-3 py-2 bg-white"
                      aria-label="Select food"
                    >
                      {foods.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-6">
                {selectedFood && analyticsLoading[selectedFood.id] ? (
                  <AnalyticsSkeleton />
                ) : null}
                {statsError ? (
                  <div className="text-xs text-gray-500">
                    Failed to load analytics. <span className="text-gray-400">{statsError}</span>
                  </div>
                ) : null}

                {analyticsIssues.length > 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    {analyticsIssues.join(" ")}
                  </div>
                ) : null}

                {hideAnalyticsGraphs ? (
                  <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    Graphs are hidden until required analytics data is available.
                  </div>
                ) : (
                  <div className="relative">
                    {/* Low-N overlay */}
                    {stats.surveyCount < 5 && (
                      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
                        <div className="bg-white/90 border border-gray-200 rounded-xl shadow px-5 py-4 text-center max-w-xs pointer-events-auto">
                          <p className="text-sm font-bold text-gray-800 mb-1">Low sample size</p>
                          <p className="text-xs text-gray-500">
                            Need at least 5 surveys for reliable trends.{" "}
                            <span className="font-semibold text-gray-700">
                              Currently: {stats.surveyCount}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                    <div className={stats.surveyCount < 5 ? "opacity-30 pointer-events-none select-none" : ""}>
                    {/* A */}
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 mb-1">
                        A. Frame-by-Frame Hedonic Score Distribution Report
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Do consumers like this product?
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {/* 1 — Sample Size */}
                        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
                            Sample Size
                          </p>
                          <p className="text-3xl leading-none font-extrabold text-gray-900 mt-2">
                            {stats.surveyCount}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">survey responses</p>
                        </div>

                        {/* 2 — Final Hedonic Score (color-coded) */}
                        {(() => {
                          const cl = Math.max(1, Math.min(9, stats.meanHedonic));
                          const tVal = (cl - 1) / 8;
                          const hue = Math.round(tVal * 120);
                          const textColor = `hsl(${hue}, 82%, ${Math.round(44 + tVal * 4)}%)`;
                          const bgColor   = `hsl(${hue}, 80%, 96%)`;
                          const border    = `hsl(${hue}, 60%, 85%)`;
                          return (
                            <div className="rounded-xl border p-4" style={{ backgroundColor: bgColor, borderColor: border }}>
                              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: textColor }}>
                                Final Hedonic Score
                              </p>
                              <p className="text-3xl leading-none font-extrabold mt-2" style={{ color: textColor }}>
                                {stats.meanHedonic.toFixed(1)}
                              </p>
                              <p className="text-[11px] mt-1" style={{ color: textColor, opacity: 0.7 }}>out of 9</p>
                            </div>
                          );
                        })()}

                        {/* 3 — FER Confidence */}
                        {(() => {
                          const tier = confidenceToTier(stats.meanConfidence);
                          return (
                            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
                                FER Confidence
                              </p>
                              <div className="flex items-end gap-1.5 mt-2">
                                <p className="text-3xl leading-none font-extrabold text-gray-900">
                                  {Math.round(stats.meanConfidence * 100)}%
                                </p>
                                <span
                                  className={`mb-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${tier.bgClass} ${tier.textClass}`}
                                  title={`Confidence tier: ${tier.label}`}
                                >
                                  {tier.label}
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${tier.colorClass}`}
                                  style={{ width: `${Math.round(stats.meanConfidence * 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}

                        {/* 4 — Reaction Distribution pie */}
                        <div className="flex flex-col items-center justify-center">
                          <p className="text-xs text-gray-600 mb-2 text-center">Reaction Distribution</p>
                          <div
                            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-gray-100 shadow-sm flex-shrink-0"
                            style={{
                              background:
                                Number(stats.frameLogCount ?? 0) <= 0
                                  ? "conic-gradient(#e5e7eb 0% 100%)"
                                  : `conic-gradient(${stats.distribution
                                      .map((d, i) => {
                                        const start =
                                          i === 0
                                            ? 0
                                            : stats.distribution
                                                .slice(0, i)
                                                .reduce((a, b) => a + b.value, 0);
                                        const end = start + d.value;
                                        return `${d.color} ${start}% ${end}%`;
                                      })
                                      .join(", ")})`,
                            }}
                            aria-label="Pie chart"
                          />
                          <div className="mt-2 space-y-0.5 w-full">
                            {stats.distribution.map((d) => (
                              <div key={d.label} className="flex items-center gap-1.5 text-[11px]">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: d.color }}
                                  aria-hidden="true"
                                />
                                <span className="text-gray-600 leading-tight">
                                  {d.label}: {d.value}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* B */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-1">
                        B. Survey-Based Attribute Radar Report
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        What consumers like about the product (based on session survey logs)
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                          <p className="text-xs text-gray-700 font-semibold mb-2">Spider chart</p>
                          <div className="min-h-[200px] h-[240px]">
                            <Radar data={radarChartData as any} options={radarChartOptions as any} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {stats.radar.map((r) => {
                            const isOverall = r.label === "Overall";
                            const color = ATTRIBUTE_COLORS[r.label] ?? "#e8174a";
                            return (
                              <div
                                key={r.label}
                                className={isOverall ? "border-t border-gray-100 pt-3 mt-1" : ""}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-600 flex items-center gap-1.5">
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: color }}
                                      aria-hidden="true"
                                    />
                                    {r.label}
                                  </span>
                                  <span className="text-xs text-gray-900 font-semibold">
                                    {r.score.toFixed(1)} / 9
                                  </span>
                                </div>
                                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${clampPct((r.score / 9) * 100)}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* C */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-1">
                        C. FER Timeline Report
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Emotion over time during testing
                      </p>

                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="min-h-[160px] h-[190px]">
                          <Line data={lineChartData as any} options={lineChartOptions as any} />
                        </div>
                      </div>
                    </div>

                    {/* D */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-1">
                        D. Demographics Report
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Consumer profile and survey-based hedonic scores
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-xs text-gray-700 font-semibold mb-3">
                            Hedonic Score by Age Group
                          </p>
                          <div className="space-y-2">
                            {stats.byAge.map((a, i) => (
                              <div key={a.label}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-gray-600">{a.label}</span>
                                  <span className="text-gray-900 font-semibold">
                                    {a.score.toFixed(1)}
                                  </span>
                                </div>
                                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${clampPct((a.score / 9) * 100)}%`,
                                      backgroundColor: getDemoColor(i),
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-gray-700 font-semibold mb-3">
                            Hedonic Score by Gender
                          </p>
                          <div className="space-y-2">
                            {stats.byGender.map((g, i) => (
                              <div key={g.label}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-gray-600">{g.label}</span>
                                  <span className="text-gray-900 font-semibold">
                                    {g.score.toFixed(1)}
                                  </span>
                                </div>
                                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${clampPct((g.score / 9) * 100)}%`,
                                      backgroundColor: getDemoColor(i + 3),
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 1–9 hedonic legend */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-sm font-bold text-gray-900 mb-3">
                        9-Point Hedonic Scale Reference
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                        {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => {
                          const isPositive = score >= 7;
                          const isNegative = score <= 4;
                          return (
                            <div
                              key={score}
                              className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                                isPositive
                                  ? "bg-green-50 text-green-800"
                                  : isNegative
                                    ? "bg-red-50 text-red-800"
                                    : "bg-yellow-50 text-yellow-800"
                              }`}
                            >
                              <span className="font-bold w-4 text-center">{score}</span>
                              <span>{RATING_LABELS[score]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Add Food Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Add New Food</h2>

            <div className="space-y-3">
              <Field label="Food Name *">
                <input
                  type="text"
                  value={newFood.name}
                  onChange={(e) => setNewFood((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Ice Cream"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Category">
                <input
                  type="text"
                  value={newFood.category}
                  onChange={(e) => setNewFood((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. dessert"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Food Image (optional)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewFoodImageFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onAddFood}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Add Food
              </button>
            </div>
          </div>
        </div>
      )}
      {foodToDelete ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-2">Delete food?</h2>
            <p className="text-sm text-gray-600">
              This will permanently remove <span className="font-semibold">{foodToDelete.name}</span> and
              its related sessions.
            </p>
            {deleteFoodError ? <p className="text-xs text-red-600 mt-2">{deleteFoodError}</p> : null}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setFoodToDelete(null)}
                disabled={deletingFoodId === foodToDelete.id}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDeleteFood(foodToDelete.id)}
                disabled={deletingFoodId === foodToDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {deletingFoodId === foodToDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-red-50 flex-shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-semibold truncate">{label}</p>
        <p className="text-2xl leading-none text-gray-900 font-bold mt-1">{value}</p>
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
        active ? "bg-[#e8174a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-xs text-gray-500 font-semibold">{title}</p>
      {subtitle ? <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function HeroKpiBlock({
  meanHedonic,
  surveyCount,
  meanConfidence,
}: {
  meanHedonic: number;
  surveyCount: number;
  meanConfidence: number;
}) {
  const tier = confidenceToTier(meanConfidence);

  // Dynamic color variants for the hedonic score card
  const clamped = Math.max(1, Math.min(9, meanHedonic));
  const t = (clamped - 1) / 8;
  const hue = Math.round(t * 120);
  const hedonicTextColor = `hsl(${hue}, 82%, ${Math.round(44 + t * 4)}%)`;
  const hedonicBgColor   = `hsl(${hue}, 80%, 96%)`;
  const hedonicBorderColor = `hsl(${hue}, 60%, 85%)`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-2">
      {/* 1 — Sample Size */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
          Sample Size
        </p>
        <p className="text-4xl leading-none font-extrabold text-gray-900">
          {surveyCount}
        </p>
        <p className="text-[11px] text-gray-400 mt-1">survey responses</p>
      </div>

      {/* 2 — Final Hedonic Score (color-coded by score) */}
      <div
        className="col-span-2 sm:col-span-1 rounded-xl border p-4"
        style={{ backgroundColor: hedonicBgColor, borderColor: hedonicBorderColor }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: hedonicTextColor }}
        >
          Final Hedonic Score
        </p>
        <p
          className="text-[clamp(2rem,5vw,2.75rem)] leading-none font-extrabold"
          style={{ color: hedonicTextColor }}
        >
          {meanHedonic.toFixed(1)}
        </p>
        <p className="text-[11px] mt-1" style={{ color: hedonicTextColor, opacity: 0.7 }}>
          out of 9
        </p>
      </div>

      {/* 3 — FER Confidence */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
          FER Confidence
        </p>
        <div className="flex items-end gap-2 mt-1">
          <p className="text-[clamp(1.5rem,3vw,1.75rem)] leading-none font-extrabold text-gray-900">
            {Math.round(meanConfidence * 100)}%
          </p>
          <span
            className={`mb-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${tier.bgClass} ${tier.textClass}`}
            title={`Confidence tier: ${tier.label}`}
          >
            {tier.label}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${tier.colorClass}`}
            style={{ width: `${Math.round(meanConfidence * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-4 bg-gray-100 rounded w-1/3" />
      <div className="h-40 bg-gray-100 rounded-xl" />
      <div className="h-4 bg-gray-100 rounded w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
    </div>
  );
}