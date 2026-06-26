import { clampPct } from "./utils";

export function ColoredRatingBar({
  label,
  rating,
  color,
}: {
  label: string;
  rating: number | null;
  color: string;
}) {
  const val = rating ?? 0;
  const pct = clampPct((val / 9) * 100);
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {label}
        </span>
        <span className="text-sm text-gray-900 font-semibold tabular-nums">
          {rating == null
            ? "—"
            : Number.isInteger(rating)
              ? `${Math.round(rating)}`
              : rating.toFixed(1)}{" "}
          / 9
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: rating == null ? "0%" : `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
