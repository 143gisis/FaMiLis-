export type FoodCardData = {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  createdAt: string | null;
  sessionsTotal: number;
  sessionsActive: number;
  avgDurationMin: number | null;
};

type FoodCardProps = {
  food: FoodCardData;
  imageSrc: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onImageClick: () => void;
  onDelete: () => void;
  onStartSession: () => void;
  onSessionStats: () => void;
  sessionStatsLoading?: boolean;
  formatDate: (iso: string | null) => string;
};

export function FoodCard({
  food,
  imageSrc,
  isSelected,
  onSelect,
  onImageClick,
  onDelete,
  onStartSession,
  onSessionStats,
  sessionStatsLoading = false,
  formatDate,
}: FoodCardProps) {
  const durationLabel =
    food.avgDurationMin == null ? "—" : `${Math.round(food.avgDurationMin)} minutes`;
  const sessionStatsDisabled = food.sessionsTotal === 0 || sessionStatsLoading;

  return (
    <article
      className={`bg-white rounded-[10px] border shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
        isSelected ? "border-[#e8174a] ring-2 ring-[#e8174a]/30" : "border-gray-100"
      }`}
    >
      <button
        type="button"
        onClick={onImageClick}
        className="relative w-full aspect-[3/2] bg-gray-100 overflow-hidden group"
        aria-label={`Edit image for ${food.name}`}
      >
        {imageSrc ? (
          <img src={imageSrc} alt={food.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center border-b border-dashed border-gray-200 bg-gray-50 text-gray-400">
            <span className="text-3xl mb-1" aria-hidden="true">
              🍽️
            </span>
            <span className="text-xs font-medium">No image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-black/50">
            Click to edit image
          </span>
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          {food.sessionsActive > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
              Active
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="px-4 pt-4 pb-3 text-center flex-1 w-full hover:bg-gray-50/80 transition-colors"
        aria-label={`Select ${food.name}`}
      >
        <h3 className="text-lg font-bold text-gray-900 leading-tight">{food.name}</h3>
        <p className="text-xs text-gray-500 mt-1">{food.category}</p>
        <div className="mt-2 space-y-0.5 text-sm text-gray-600">
          <p>Duration: {durationLabel}</p>
          <p>Created: {formatDate(food.createdAt)}</p>
        </div>

        <div className="mt-3 border border-gray-200 rounded-[10px] px-4 py-2 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-[11px] text-gray-400 font-medium">Sessions</p>
            <p className="text-lg font-bold text-gray-900">{food.sessionsTotal}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="text-center flex-1">
            <p className="text-[11px] text-gray-400 font-medium">Active</p>
            <p className="text-lg font-bold text-gray-900">{food.sessionsActive}</p>
          </div>
        </div>
      </button>

      <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onStartSession}
          className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold py-2 rounded-[10px] transition-colors"
        >
          Start Session
        </button>
        <button
          type="button"
          onClick={onSessionStats}
          disabled={sessionStatsDisabled}
          className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 text-sm font-semibold py-2 rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          {sessionStatsLoading ? "Loading…" : "Session Stats"}
        </button>
      </div>

      <div className="px-4 pb-3 flex justify-center">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors inline-flex items-center gap-1"
        >
          <span aria-hidden="true">🗑️</span>
          Delete
        </button>
      </div>
    </article>
  );
}
