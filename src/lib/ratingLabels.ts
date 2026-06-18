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
