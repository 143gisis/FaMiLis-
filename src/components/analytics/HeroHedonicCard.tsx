import { hedonicLabel } from "../../lib/ratingLabels";
import { InfoTip } from "../InfoTip";

export function HeroHedonicCard({
  score,
  label = "Final Hedonic Score",
}: {
  score: number | null;
  label?: string;
}) {
  const display = score != null ? score.toFixed(1) : "—";
  const subLabel = score != null ? hedonicLabel(score) : "No survey data yet";

  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-xl border-2 border-[#e8174a] p-6 min-h-[160px]">
      <p className="text-xs text-gray-500 font-semibold mb-2 flex items-center gap-1.5">
        <span className="uppercase tracking-wider">{label}</span>
        <InfoTip term="hedonicScore" />
      </p>
      <p className="text-[clamp(3rem,8vw,4rem)] font-extrabold text-[#e8174a] leading-none">
        {display}
      </p>
      <p className="text-sm text-gray-400 mt-2">out of 9</p>
      {score != null ? (
        <p className="text-s text-gray-500 mt-2 text-center">{subLabel}</p>
      ) : null}
    </div>
  );
}
