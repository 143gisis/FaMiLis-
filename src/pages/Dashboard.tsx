import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, apiFetch } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { FoodCard } from "../components/dashboard";
import {
  ColoredRatingBar,
  FerConfidenceCard,
  HeroHedonicCard,
  InsightCard,
  MetricCard,
  SectionPill,
  TabButton,
} from "../components/analytics";
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

const toApiUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

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
  const [analyticsByFoodId, setAnalyticsByFoodId] = useState<Record<number, Analytics>>({});
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<Record<number, boolean>>({});
  const [statsError, setStatsError] = useState<string | null>(null);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
  const [deletingFoodId, setDeletingFoodId] = useState<number | null>(null);
  const [deleteFoodError, setDeleteFoodError] = useState<string | null>(null);
  const [sessionStatsLoadingFoodId, setSessionStatsLoadingFoodId] = useState<number | null>(null);
  const [editingFoodImage, setEditingFoodImage] = useState<Food | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageModalError, setImageModalError] = useState<string | null>(null);
  const [imageSaving, setImageSaving] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);

  // Edit food modal state
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [editFoodFields, setEditFoodFields] = useState({ name: "", category: "" });
  const [editFoodImageFile, setEditFoodImageFile] = useState<File | null>(null);
  const [editFoodImagePreview, setEditFoodImagePreview] = useState<string | null>(null);
  const [editFoodSaving, setEditFoodSaving] = useState(false);
  const [editFoodError, setEditFoodError] = useState<string | null>(null);
  const editFoodImageInputRef = useRef<HTMLInputElement | null>(null);

  const foodsAbortRef = useRef<AbortController | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    foodsAbortRef.current?.abort();
    const ac = new AbortController();
    foodsAbortRef.current = ac;

    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await apiFetch(`/api/foods`, { signal: ac.signal });
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

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const closeImageModal = () => {
    setEditingFoodImage(null);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageModalError(null);
    setImageSaving(false);
    setImageRemoving(false);
    if (imageFileInputRef.current) imageFileInputRef.current.value = "";
  };

  const openImageModal = (food: Food) => {
    setEditingFoodImage(food);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageModalError(null);
    if (imageFileInputRef.current) imageFileInputRef.current.value = "";
  };

  useEffect(() => {
    if (!editFoodImageFile) {
      setEditFoodImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(editFoodImageFile);
    setEditFoodImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editFoodImageFile]);

  const openEditFoodModal = (food: Food) => {
    setEditingFood(food);
    setEditFoodFields({ name: food.name, category: food.category });
    setEditFoodImageFile(null);
    setEditFoodImagePreview(null);
    setEditFoodError(null);
    setEditFoodSaving(false);
    if (editFoodImageInputRef.current) editFoodImageInputRef.current.value = "";
  };

  const closeEditFoodModal = () => {
    setEditingFood(null);
    setEditFoodImageFile(null);
    setEditFoodImagePreview(null);
    setEditFoodError(null);
    setEditFoodSaving(false);
    if (editFoodImageInputRef.current) editFoodImageInputRef.current.value = "";
  };

  const onSaveEditFood = async () => {
    if (!editingFood) return;
    const name = editFoodFields.name.trim();
    const category = editFoodFields.category.trim();
    if (!name || !category) {
      setEditFoodError("Name and category are required.");
      return;
    }
    setEditFoodSaving(true);
    setEditFoodError(null);
    try {
      // Update metadata if changed.
      if (name !== editingFood.name || category !== editingFood.category) {
        const res = await apiFetch(`/api/foods/${editingFood.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update food.");
        }
      }

      // Upload new image if one was chosen.
      let updatedImageUrl = editingFood.imageUrl;
      if (editFoodImageFile) {
        const fd = new FormData();
        fd.append("image", editFoodImageFile);
        const imgRes = await apiFetch(`/api/foods/${editingFood.id}/image`, {
          method: "POST",
          body: fd,
        });
        const imgJson = await imgRes.json().catch(() => null);
        if (imgRes.ok && imgJson?.ok) {
          updatedImageUrl = String(imgJson.imageUrl ?? "");
        }
      }

      setFoods((prev) =>
        prev.map((f) =>
          f.id === editingFood.id ? { ...f, name, category, imageUrl: updatedImageUrl } : f
        )
      );
      closeEditFoodModal();
    } catch (err: any) {
      setEditFoodError(err?.message || "Failed to save changes.");
    } finally {
      setEditFoodSaving(false);
    }
  };

  const onRemoveEditFoodImage = async () => {
    if (!editingFood) return;
    setEditFoodSaving(true);
    setEditFoodError(null);
    try {
      const res = await apiFetch(`/api/foods/${editingFood.id}/image`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to remove image.");
      }
      setFoods((prev) =>
        prev.map((f) => (f.id === editingFood.id ? { ...f, imageUrl: null } : f))
      );
      setEditingFood((prev) => (prev ? { ...prev, imageUrl: null } : prev));
    } catch (err: any) {
      setEditFoodError(err?.message || "Failed to remove image.");
    } finally {
      setEditFoodSaving(false);
    }
  };

  const updateFoodImageUrl = (foodId: number, imageUrl: string | null) => {
    setFoods((prev) => prev.map((f) => (f.id === foodId ? { ...f, imageUrl } : f)));
  };

  const onSaveFoodImage = async () => {
    if (!editingFoodImage || !imageFile) return;
    setImageSaving(true);
    setImageModalError(null);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      const res = await apiFetch(`/api/foods/${editingFoodImage.id}/image`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to upload image.");
      }
      updateFoodImageUrl(editingFoodImage.id, String(json.imageUrl ?? ""));
      closeImageModal();
    } catch (err: any) {
      setImageModalError(err?.message || "Failed to upload image.");
    } finally {
      setImageSaving(false);
    }
  };

  const onRemoveFoodImage = async () => {
    if (!editingFoodImage?.imageUrl) return;
    setImageRemoving(true);
    setImageModalError(null);
    try {
      const res = await apiFetch(`/api/foods/${editingFoodImage.id}/image`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to remove image.");
      }
      updateFoodImageUrl(editingFoodImage.id, null);
      closeImageModal();
    } catch (err: any) {
      setImageModalError(err?.message || "Failed to remove image.");
    } finally {
      setImageRemoving(false);
    }
  };

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
        const res = await apiFetch(`/api/foods/${foodId}/analytics`);
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
          min: 1,
          max: 9,
          ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
      },
    } as const;
  }, []);

  const onDeleteFood = async (foodId: number) => {
    try {
      setDeletingFoodId(foodId);
      setDeleteFoodError(null);
      const res = await apiFetch(`/api/foods/${foodId}`, { method: "DELETE" });
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
      const res = await apiFetch(`/api/foods`, {
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
        const imgRes = await apiFetch(`/api/foods/${created.id}/image`, {
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

  const onOpenLatestSession = async (food: Food) => {
    if (food.sessionsTotal === 0 || sessionStatsLoadingFoodId != null) return;
    setSessionStatsLoadingFoodId(food.id);
    try {
      const res = await apiFetch(`/api/foods/${food.id}/sessions`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load sessions.");
      }
      const sessions = (json.sessions ?? []) as { id: number }[];
      const latest = sessions[0];
      if (!latest) return;
      navigate(`/session-detail?sessionId=${latest.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSessionStatsLoadingFoodId(null);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <PageHeader />

      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
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
            <MetricCard icon="🍽️" iconBg="bg-red-50 text-[#e8174a]" title="Total Foods" value={String(totalFoods)} />
            <MetricCard icon="✅" iconBg="bg-green-50 text-green-600" title="Active Foods" value={String(activeFoods)} />
            <MetricCard icon="🏷️" iconBg="bg-blue-50 text-blue-600" title="Categories" value={String(categories)} />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {foods.map((food) => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      imageSrc={toApiUrl(food.imageUrl)}
                      isSelected={expandedFoodId === food.id}
                      formatDate={formatDate}
                      onSelect={() => setExpandedFoodId(food.id)}
                      onEdit={() => openEditFoodModal(food)}
                      onImageClick={() => openImageModal(food)}
                      onDelete={() => setFoodToDelete(food)}
                      onStartSession={() => navigate("/setup", { state: { foodId: food.id } })}
                      onSessionStats={() => void onOpenLatestSession(food)}
                      sessionStatsLoading={sessionStatsLoadingFoodId === food.id}
                    />
                  ))}
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
                    <p className="text-s text-gray-500 mt-1">
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
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
                    {analyticsIssues.join(" ")}
                  </div>
                ) : null}

                {selectedFood && !analyticsLoading[selectedFood.id] && !hideAnalyticsGraphs ? (
                  <>
                    <div>
                      <SectionPill>Product Analytics</SectionPill>
                      <p className="text-s text-gray-500 -mt-1 mb-4">
                        {selectedFood.name} · Live analytics from DB
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr] gap-4 mb-4">
                        <HeroHedonicCard
                          score={stats.surveyCount > 0 ? stats.meanHedonic : null}
                        />
                        <FerConfidenceCard meanConfidence={stats.meanConfidence} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <InsightCard
                          title="Sample Size (N)"
                          value={String(stats.surveyCount)}
                          sub={
                            stats.surveyCount < 5
                              ? "Need at least 5 surveys for reliable trends"
                              : "Completed survey responses for this product"
                          }
                        />
                        <MetricCard
                          icon="📋"
                          iconBg="bg-blue-50 text-blue-600"
                          title="Testing Sessions"
                          value={String(stats.sessionCount)}
                        />
                        <MetricCard
                          icon="📷"
                          iconBg="bg-green-50 text-green-600"
                          title="Frames Analyzed"
                          value={String(stats.frameLogCount)}
                        />
                      </div>
                    </div>

                    <div className="relative space-y-6">
                      {stats.surveyCount < 5 ? (
                        <div className="absolute inset-0 z-10 flex items-start justify-center pt-20 pointer-events-none">
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
                      ) : null}

                      <div
                        className={
                          stats.surveyCount < 5
                            ? "opacity-30 pointer-events-none select-none space-y-6"
                            : "space-y-6"
                        }
                      >
                        <div>
                          <SectionPill>Reaction Distribution</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Do consumers like this product? (frame-by-frame FER)
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                              <p className="text-s text-gray-600 font-semibold mb-2">
                                Reaction distribution
                              </p>
                              <div className="min-h-[200px] h-[240px] flex items-center justify-center">
                                <div
                                  className="aspect-square h-full max-h-[220px] w-auto max-w-full rounded-full border border-gray-100 shadow-sm"
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
                                  aria-label="Reaction distribution pie chart"
                                />
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-600 font-semibold mb-2">Breakdown</p>
                              <div className="min-h-[200px] h-[240px] flex flex-col justify-center">
                                {stats.distribution.map((d) => (
                                  <div key={d.label} className="mb-4 last:mb-0">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                                        <span
                                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: d.color }}
                                          aria-hidden="true"
                                        />
                                        {d.label}
                                      </span>
                                      <span className="text-sm text-gray-900 font-semibold tabular-nums">
                                        {d.value}%
                                      </span>
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${d.value}%`, backgroundColor: d.color }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <SectionPill infoTerm="sensoryAttributes">Sensory Attributes</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            What consumers like about the product (survey-based)
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                              <p className="text-s text-gray-600 font-semibold mb-2">Spider chart</p>
                              <div className="min-h-[200px] h-[240px]">
                                <Radar data={radarChartData as any} options={radarChartOptions as any} />
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              {stats.radar.map((r) => (
                                <ColoredRatingBar
                                  key={r.label}
                                  label={r.label}
                                  rating={r.score}
                                  color={ATTRIBUTE_COLORS[r.label] ?? "#e8174a"}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <SectionPill infoTerm="fer">FER Timeline (In-Session Reaction Phases)</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Emotion over time during testing — distinct from session-over-time trends
                          </p>
                          <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                            <p className="text-xs text-gray-600 font-semibold mb-2">
                              Hedonic score over session phases
                            </p>
                            <div className="min-h-[180px] h-[220px]">
                              <Line data={lineChartData as any} options={lineChartOptions as any} />
                            </div>
                          </div>
                        </div>

                        <div>
                          <SectionPill>Demographics</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Consumer profile and survey-based hedonic scores
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-700 font-semibold mb-3">
                                Hedonic Score by Age Group
                              </p>
                              {stats.byAge.length === 0 ? (
                                <p className="text-xs text-gray-500">No age data yet.</p>
                              ) : (
                                stats.byAge.map((a, i) => (
                                  <ColoredRatingBar
                                    key={a.label}
                                    label={a.label}
                                    rating={a.score}
                                    color={getDemoColor(i)}
                                  />
                                ))
                              )}
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-700 font-semibold mb-3">
                                Hedonic Score by Gender
                              </p>
                              {stats.byGender.length === 0 ? (
                                <p className="text-xs text-gray-500">No gender data yet.</p>
                              ) : (
                                stats.byGender.map((g, i) => (
                                  <ColoredRatingBar
                                    key={g.label}
                                    label={g.label}
                                    rating={g.score}
                                    color={getDemoColor(i + 3)}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <SectionPill>9-Point Hedonic Scale Reference</SectionPill>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-3">
                            {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => {
                              const isPositive = score >= 7;
                              const isNegative = score <= 4;
                              return (
                                <div
                                  key={score}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                                    isPositive
                                      ? "bg-green-50 text-green-800"
                                      : isNegative
                                        ? "bg-red-50 text-red-800"
                                        : "bg-yellow-50 text-yellow-800"
                                  }`}
                                >
                                  <span className="font-bold w-4 text-center tabular-nums">{score}</span>
                                  <span>{RATING_LABELS[score]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : selectedFood && !analyticsLoading[selectedFood.id] && hideAnalyticsGraphs ? (
                  <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-4 py-2">
                    Graphs are hidden until required analytics data is available.
                  </div>
                ) : null}
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
      {/* Edit Food Modal */}
      {editingFood ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Edit Food</h2>

            <div className="space-y-3">
              <Field label="Food Name *">
                <input
                  type="text"
                  value={editFoodFields.name}
                  onChange={(e) => setEditFoodFields((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Ice Cream"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Category *">
                <input
                  type="text"
                  value={editFoodFields.category}
                  onChange={(e) => setEditFoodFields((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. dessert"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Replace Image (optional)">
                {editingFood.imageUrl && !editFoodImageFile ? (
                  <div className="mb-2 flex items-center gap-3">
                    <img
                      src={toApiUrl(editingFood.imageUrl) ?? undefined}
                      alt={editingFood.name}
                      className="h-14 w-20 object-cover rounded border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => void onRemoveEditFoodImage()}
                      disabled={editFoodSaving}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
                    >
                      Remove image
                    </button>
                  </div>
                ) : null}
                {editFoodImagePreview ? (
                  <div className="mb-2">
                    <img
                      src={editFoodImagePreview}
                      alt="Preview"
                      className="h-14 w-20 object-cover rounded border border-gray-200"
                    />
                  </div>
                ) : null}
                <input
                  ref={editFoodImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditFoodImageFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>
            </div>

            {editFoodError ? (
              <p className="text-xs text-red-600 mt-3">{editFoodError}</p>
            ) : null}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={closeEditFoodModal}
                disabled={editFoodSaving}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSaveEditFood()}
                disabled={editFoodSaving}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editFoodSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {editingFoodImage ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-1">Food image</h2>
            <p className="text-sm text-gray-500 mb-4">{editingFoodImage.name}</p>

            <div className="aspect-[3/2] rounded-lg overflow-hidden border border-gray-200 bg-gray-50 mb-4">
              {imagePreviewUrl || toApiUrl(editingFoodImage.imageUrl) ? (
                <img
                  src={imagePreviewUrl ?? toApiUrl(editingFoodImage.imageUrl) ?? undefined}
                  alt={editingFoodImage.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <span className="text-3xl mb-1" aria-hidden="true">
                    🍽️
                  </span>
                  <span className="text-xs font-medium">No image</span>
                </div>
              )}
            </div>

            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              onClick={() => imageFileInputRef.current?.click()}
              disabled={imageSaving || imageRemoving}
              className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {editingFoodImage.imageUrl || imageFile ? "Choose new image" : "Choose image"}
            </button>

            {imageModalError ? (
              <p className="text-xs text-red-600 mt-3">{imageModalError}</p>
            ) : null}

            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={closeImageModal}
                disabled={imageSaving || imageRemoving}
                className="flex-1 min-w-[100px] border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              {editingFoodImage.imageUrl ? (
                <button
                  type="button"
                  onClick={() => void onRemoveFoodImage()}
                  disabled={imageSaving || imageRemoving}
                  className="flex-1 min-w-[100px] border border-red-200 text-red-700 hover:bg-red-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {imageRemoving ? "Removing…" : "Remove image"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSaveFoodImage()}
                disabled={!imageFile || imageSaving || imageRemoving}
                className="flex-1 min-w-[100px] bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-6 bg-gray-100 rounded-full w-40" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
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