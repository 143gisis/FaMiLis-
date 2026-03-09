import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Plus, Play } from "lucide-react";
import { useApp, FoodItem } from "../store/AppContext";

export function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, dispatch } = useApp();

  const tab = (searchParams.get("tab") as "food" | "stats") || "food";

  const foods = state.foods;
  const sessions = state.sessions;

  const totalFoods = foods.length;
  const activeFoods = foods.filter((f) => f.status === "Active").length;
  const categories = [...new Set(foods.map((f) => f.category))].length;

  const [showAddModal, setShowAddModal] = useState(false);
  const [newFood, setNewFood] = useState({
    name: "",
    variant: "",
    category: "Dessert",
    duration: "15", // placeholder
  });

  const stats = useMemo(() => {
    const total = sessions.length;
    const like = sessions.filter((s) => s.model.hedonicScore >= 7).length;
    const neutral = sessions.filter((s) => s.model.hedonicScore >= 5 && s.model.hedonicScore <= 6).length;
    const dislike = sessions.filter((s) => s.model.hedonicScore <= 4).length;

    return { total, like, neutral, dislike };
  }, [sessions]);

  const handleAddFood = () => {
    if (!newFood.name.trim()) return;

    const food: FoodItem = {
      id: Date.now().toString(),
      name: newFood.name.trim(),
      variant: newFood.variant.trim(),
      category: newFood.category,
      durationMinutes: Number(newFood.duration) || 15,
      created: new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
      status: "Active",
    };

    dispatch({ type: "ADD_FOOD", payload: food });
    setNewFood({ name: "", variant: "", category: "Dessert", duration: "15" });
    setShowAddModal(false);
  };

  const toggleStatus = (id: string) => {
    dispatch({ type: "TOGGLE_FOOD_STATUS", payload: { id } });
  };

  const deleteFood = (id: string) => {
    dispatch({ type: "DELETE_FOOD", payload: { id } });
  };

  const setTab = (next: "food" | "stats") => {
    setSearchParams({ tab: next });
  };

  return (
    <div className="px-10 py-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-8 py-6 rounded-[10px] mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[32px] font-bold text-black">Dashboard</h1>
            <p
              className="text-[#bdb4b4] text-[16px] mt-1"
              style={{ fontFamily: "'Albert Sans', sans-serif" }}
            >
              Add and Manage Food for Testing
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-red-600 text-white px-6 py-2 rounded-[10px] text-[14px] font-extrabold flex items-center gap-2 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.6)] hover:bg-red-700 transition-colors"
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              <Plus size={16} />
              Add New Food
            </button>
            <button
              onClick={() => navigate("/admin/testing")}
              className="bg-red-600 text-white px-6 py-2 rounded-[10px] text-[14px] font-extrabold flex items-center gap-2 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.6)] hover:bg-red-700 transition-colors"
              style={{ fontFamily: "'Roboto', sans-serif" }}
            >
              <Play size={16} />
              Start Testing
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {[
          { label: "Total Foods", value: totalFoods, emoji: "🍽️" },
          { label: "Active Foods", value: activeFoods, emoji: "✅" },
          { label: "Categories", value: categories, emoji: "📂" },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-white rounded-[10px] p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.2)] flex items-center gap-4"
          >
            <div className="bg-[#d9d9d9] rounded-[10px] w-[50px] h-[50px] flex items-center justify-center">
              <span className="text-[20px]">{card.emoji}</span>
            </div>
            <div>
              <p className="text-[15px] text-black" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
                {card.label}
              </p>
              <p className="text-[20px] text-black" style={{ fontFamily: "'Bree Serif', serif" }}>
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* URL-based Tabs */}
      <div className="flex mb-6">
        <button
          onClick={() => setTab("food")}
          className={`flex-1 py-3 text-[20px] font-medium text-center rounded-l-[10px] transition-colors ${
            tab === "food" ? "bg-red-600 text-white" : "bg-white text-black border border-[#bfbfbf]"
          }`}
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Food Management
        </button>
        <button
          onClick={() => setTab("stats")}
          className={`flex-1 py-3 text-[20px] font-medium text-center rounded-r-[10px] transition-colors ${
            tab === "stats" ? "bg-red-600 text-white" : "bg-white text-black border border-[#bfbfbf]"
          }`}
          style={{ fontFamily: "'Roboto', sans-serif" }}
        >
          Statistics & Analytics
        </button>
      </div>

      {/* Tab Content */}
      {tab === "food" ? (
        <FoodManagementTab foods={foods} onToggle={toggleStatus} onDelete={deleteFood} />
      ) : (
        <StatisticsTab foods={foods} sessions={sessions} stats={stats} />
      )}

      {/* Add Food Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-[10px] p-8 w-[500px] shadow-2xl">
            <h3 className="text-[24px] font-bold text-black mb-6">Add New Food</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[16px] font-medium text-black block mb-1">Food Name</label>
                <input
                  type="text"
                  value={newFood.name}
                  onChange={(e) => setNewFood({ ...newFood, name: e.target.value })}
                  placeholder="e.g. Ice Cream"
                  className="w-full px-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] focus:outline-none focus:border-red-400"
                />
              </div>
              <div>
                <label className="text-[16px] font-medium text-black block mb-1">Variant / Flavor</label>
                <input
                  type="text"
                  value={newFood.variant}
                  onChange={(e) => setNewFood({ ...newFood, variant: e.target.value })}
                  placeholder="e.g. Strawberry"
                  className="w-full px-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] focus:outline-none focus:border-red-400"
                />
              </div>
              <div>
                <label className="text-[16px] font-medium text-black block mb-1">Category</label>
                <select
                  value={newFood.category}
                  onChange={(e) => setNewFood({ ...newFood, category: e.target.value })}
                  className="w-full px-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] focus:outline-none focus:border-red-400"
                >
                  <option>Dessert</option>
                  <option>Beverage</option>
                  <option>Snack</option>
                  <option>Main Course</option>
                  <option>Sauce</option>
                </select>
              </div>
              <div>
                <label className="text-[16px] font-medium text-black block mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  value={newFood.duration}
                  onChange={(e) => setNewFood({ ...newFood, duration: e.target.value })}
                  className="w-full px-4 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] focus:outline-none focus:border-red-400"
                />
                <p className="text-[12px] text-black/50 mt-1">(This is a placeholder for now.)</p>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 border border-[#bfbfbf] rounded-[10px] text-[16px] font-semibold text-black hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFood}
                className="flex-1 py-3 bg-red-600 rounded-[10px] text-[16px] font-semibold text-white hover:bg-red-700"
              >
                Add Food
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FoodManagementTab({
  foods,
  onToggle,
  onDelete,
}: {
  foods: FoodItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-[10px] p-8 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.2)]">
      <h2 className="text-[24px] font-bold text-black mb-6">Food Management</h2>

      {foods.length === 0 ? (
        <p className="text-black/60">No foods added yet.</p>
      ) : (
        <div className="space-y-6">
          {foods.map((food) => (
            <div key={food.id} className="border border-black/20 rounded-[10px] p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[24px] font-bold text-black flex items-center gap-4">
                    {food.name}
                    <span
                      className={`px-4 py-1 rounded-full text-[14px] font-bold ${
                        food.status === "Active" ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {food.status}
                    </span>
                  </h3>
                  <p className="text-[16px] text-black/60 mt-1">{food.variant}</p>

                  <div className="mt-4 space-y-2 text-[16px] text-black">
                    <p>
                      <span className="font-bold">Category:</span> {food.category}
                    </p>
                    <p>
                      <span className="font-bold">Duration:</span> {food.durationMinutes} minutes
                    </p>
                    <p>
                      <span className="font-bold">Created:</span> {food.created}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-16">
                  <button
                    onClick={() => onToggle(food.id)}
                    className="text-red-600 text-[16px] font-bold hover:underline"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  >
                    {food.status === "Active" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => onDelete(food.id)}
                    className="text-red-600 text-[16px] font-bold hover:underline"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatisticsTab({
  foods,
  sessions,
  stats,
}: {
  foods: FoodItem[];
  sessions: any[];
  stats: { total: number; like: number; neutral: number; dislike: number };
}) {
  const summaryCards = [
    { icon: "😍", label: "Like Reactions", value: stats.like },
    { icon: "😐", label: "Neutral Reactions", value: stats.neutral },
    { icon: "🙁", label: "Dislike Reactions", value: stats.dislike },
    { icon: "📊", label: "Total Sessions", value: stats.total },
  ];

  const scoreColumns = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const rows = foods.map((food) => {
    const foodSessions = sessions.filter((x) => x.foodId === food.id);
    const scoreCounts = Object.fromEntries(scoreColumns.map((score) => [score, 0])) as Record<number, number>;

    foodSessions.forEach((session) => {
      const score = Number(session.model?.hedonicScore);
      if (score >= 1 && score <= 9) scoreCounts[score] += 1;
    });

    const modelScores = foodSessions
      .map((session) => Number(session.model?.hedonicScore))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 9);

    const surveyScores = foodSessions
      .map((session) => Number(session.surveyRatings?.["OVERALL PROFILE"]))
      .filter((value) => Number.isFinite(value));

    const modelAvg = modelScores.length
      ? (modelScores.reduce((sum, value) => sum + value, 0) / modelScores.length).toFixed(1)
      : "-";

    const surveyAvg = surveyScores.length
      ? (surveyScores.reduce((sum, value) => sum + value, 0) / surveyScores.length).toFixed(1)
      : "-";

    return {
      food,
      sessionsCount: foodSessions.length,
      scoreCounts,
      overallRating: `${modelAvg} / ${surveyAvg}`,
    };
  });

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card, i) => (
          <div
            key={i}
            className="bg-white rounded-[10px] p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.2)] flex items-center gap-4"
          >
            <div className="bg-[#d9d9d9] rounded-[10px] w-[50px] h-[50px] flex items-center justify-center">
              <span className="text-[26px]">{card.icon}</span>
            </div>
            <div>
              <p className="text-[15px] text-black" style={{ fontFamily: "'Albert Sans', sans-serif" }}>
                {card.label}
              </p>
              <p className="text-[20px] text-black" style={{ fontFamily: "'Bree Serif', serif" }}>
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[10px] p-6 xl:p-8 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.2)] overflow-hidden">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] xl:text-[22px] font-bold text-black mb-2">Individual Food Performance</h2>
            <div className="text-[12px] xl:text-[14px] leading-[1.6] text-[#8b8f97] break-words pr-0 xl:pr-10">
              9 = Like Extremely, 8 = Like Very Much, 7 = Like Moderately, 6 = Like Slightly, 5 = Neither Like nor Dislike,
              4 = Dislike Slightly, 3 = Dislike Moderately, 2 = Dislike Very Much, 1 = Dislike Extremely
            </div>
          </div>

          <div className="bg-[#f8f9fb] border border-[#e5e7eb] rounded-[10px] px-4 py-3 shrink-0 xl:min-w-[240px] self-start">
            <p className="text-[12px] font-bold text-[#6e737c] uppercase tracking-[0.04em]">Overall Rating</p>
            <p className="text-[13px] text-[#8b8f97] mt-1">Model Avg / Survey Avg</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="bg-[#f8f9fb] text-left text-[12px] text-[#a6a6a6] uppercase">
                <th className="py-3 px-4 rounded-l-[10px] whitespace-nowrap">Food Name</th>
                <th className="py-3 px-3 whitespace-nowrap">Category</th>
                <th className="py-3 px-3 whitespace-nowrap">Sessions</th>
                {scoreColumns.map((score) => (
                  <th key={score} className="py-3 px-3 text-center whitespace-nowrap">{score}</th>
                ))}
                <th className="py-3 px-4 rounded-r-[10px] whitespace-nowrap">
                  <div>Overall Rating</div>
                  <div className="text-[10px] normal-case tracking-normal text-[#b2b5bb] mt-1">Model Avg / Survey Avg</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-20">
                    <p className="text-[18px] text-black mb-2">No testing data yet</p>
                    <p className="text-[15px] text-black/50 max-w-[520px] mx-auto">
                      Statistics will appear here after users complete food testing sessions.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map(({ food, sessionsCount, scoreCounts, overallRating }, rowIndex) => (
                  <tr key={food.id} className={`${rowIndex % 2 === 1 ? "bg-[#fcfcfd]" : "bg-white"} border-t border-[#eeeeee]`}>
                    <td className="py-4 px-4 text-[14px] text-black whitespace-nowrap">{food.name}{food.variant ? ` - ${food.variant}` : ""}</td>
                    <td className="py-4 px-3 text-[14px] text-black whitespace-nowrap">{food.category}</td>
                    <td className="py-4 px-3 text-[14px] text-black whitespace-nowrap">{sessionsCount}</td>
                    {scoreColumns.map((score) => (
                      <td key={score} className="py-4 px-3 text-[14px] text-black text-center whitespace-nowrap">
                        {scoreCounts[score] || "-"}
                      </td>
                    ))}
                    <td className="py-4 px-4 text-[14px] font-semibold text-black whitespace-nowrap">{overallRating}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
