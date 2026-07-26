export const RATING_LABELS: Record<number, string> = {
  9: "Like Extremely",
  8: "Like Very Much",
  7: "Like Moderately",
  6: "Like Slightly",
  5: "Neither Like nor Dislike",
  4: "Dislike Slightly",
  3: "Dislike Moderately",
  2: "Dislike Very Much",
  1: "Dislike Extremely",
};

export function getGuideEmoji(score: number): string {
  switch (score) {
    case 9: return "😍";
    case 8: return "😊";
    case 7: return "🙂";
    case 6: return "😄";
    case 5: return "😐";
    case 4: return "😕";
    case 3: return "🙁";
    case 2: return "😖";
    case 1: return "😣";
    default: return "";
  }
}

/** Convert a 1–9 hedonic score to its nearest label string. */
export function hedonicLabel(score: number): string {
  const rounded = Math.round(Math.max(1, Math.min(9, score)));
  return RATING_LABELS[rounded] ?? "";
}

/**
 * Map a 1–9 hedonic score to a CSS color string.
 * Interpolates hue from 0° (red) at score 1 through 38° (amber) at ~5
 * up to 120° (green) at score 9, matching the traffic-light convention.
 */
export function hedonicColor(score: number): string {
  const clamped = Math.max(1, Math.min(9, score));
  const t = (clamped - 1) / 8; // 0 → 1
  const hue = Math.round(t * 120); // 0° red → 120° green
  const saturation = 82;
  const lightness = Math.round(44 + t * 4); // slight brightness lift toward green
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Map a 1–9 hedonic score to the same 3-tier Tailwind text classes
 * used for FER confidence (green / yellow / red).
 */
export function hedonicToTierClasses(score: number): string {
  if (score >= 7) return "text-green-700";
  if (score >= 5) return "text-yellow-700";
  return "text-red-700";
}

/** Sensory aspect means used for weakest-attribute callouts (excludes overall). */
export type SensoryAspectMeans = {
  color?: { mean: number; n: number };
  flavorAroma?: { mean: number; n: number };
  saltSweet?: { mean: number; n: number };
  texture?: { mean: number; n: number };
};

export type HedonicInterpretationInput = {
  /** Survey overall mean on the 1–9 hedonic scale. */
  surveyOverall: number | null;
  /** Optional FER mean on the 1–9 hedonic scale. */
  ferMean?: number | null;
  /** Optional mean FER confidence in 0–1. */
  confidence?: number | null;
  /** Optional aspect stats for a weakest-attribute tip when survey ≤ 4. */
  aspectStats?: SensoryAspectMeans | null;
};

const ASPECT_LABELS: { key: keyof SensoryAspectMeans; label: string }[] = [
  { key: "color", label: "Color" },
  { key: "flavorAroma", label: "Flavor/Aroma" },
  { key: "saltSweet", label: "Salt/Sweet" },
  { key: "texture", label: "Texture" },
];

function formatHedonicPhrase(score: number): string {
  const label = hedonicLabel(score);
  return label ? `${label.toLowerCase()} (${score.toFixed(1)}/9)` : `${score.toFixed(1)}/9`;
}

function weakestSensoryAttribute(
  aspectStats: SensoryAspectMeans
): { label: string; mean: number } | null {
  let weakest: { label: string; mean: number } | null = null;
  for (const { key, label } of ASPECT_LABELS) {
    const aspect = aspectStats[key];
    if (!aspect || aspect.n <= 0) continue;
    if (!weakest || aspect.mean < weakest.mean) {
      weakest = { label, mean: aspect.mean };
    }
  }
  return weakest;
}

/**
 * Build a short CAP-tone narrative for survey + optional FER hedonic scores.
 * Returns empty-state copy when survey overall is unavailable.
 */
export function buildHedonicInterpretation(input: HedonicInterpretationInput): string {
  const survey = input.surveyOverall;
  if (survey == null || !Number.isFinite(survey)) {
    return "Not enough survey data yet to interpret hedonic scores for this product.";
  }

  const parts: string[] = [
    `<strong>Survey respondents</strong> rate this product as <strong>${formatHedonicPhrase(survey)}</strong>`,
  ];

  const fer = input.ferMean;
  const confidence = input.confidence;
  if (fer != null && Number.isFinite(fer)) {
    const confPct =
      confidence != null && Number.isFinite(confidence)
        ? ` with ${Math.round(confidence * 100)}% mean confidence`
        : "";
    parts.push(
      `while the <strong>FER system</strong> predicts the customer's emotional reaction to this product as <strong>${formatHedonicPhrase(fer)}</strong>` +
        (confidence != null && Number.isFinite(confidence)
          ? ` with <strong>${Math.round(confidence * 100)}% confidence</strong>`
          : "") +
        "."
    );
  } else if (confidence != null && Number.isFinite(confidence) && confidence > 0) {
    parts.push(`Mean FER confidence is ${Math.round(confidence * 100)}%.`);
  }

  if (survey <= 4 && input.aspectStats) {
    const weakest = weakestSensoryAttribute(input.aspectStats);
    if (weakest) {
      parts.push(
        `The <strong>weakest sensory attribute</strong> acquired from the survey is <strong>${weakest.label} (${weakest.mean.toFixed(1)}/9)</strong>.`
      );
    }
  }

  return parts.join(" ");
}
